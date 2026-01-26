import mqtt from 'mqtt';
import dotenv from 'dotenv';
import { query } from './database';
import { processTasmotaTelemetry } from '../services/sensorService';
import { processShellyEnergyData } from '../services/energyService';
import {
  updateGatewayState,
  updateNodesFromList,
  updateNodeState,
  getAllNodes,
  updateLedState,
  getLedState
} from '../services/omniapiState';
import {
  emitOmniapiGatewayUpdate,
  emitOmniapiNodeUpdate,
  emitOmniapiNodesUpdate,
  emitOmniapiLedUpdate
} from '../socket';
import {
  updateGatewayFromMqtt,
  markGatewayOffline
} from '../controllers/gatewayController';
import * as notificationService from '../services/notificationService';
// Device Type Registry - Single Source of Truth
import {
  FIRMWARE_IDS,
  isLedFirmwareId,
  isRelayFirmwareId,
  getDeviceTypeFromFirmwareId
} from './deviceTypes';

dotenv.config();

// ============================================
// CONFIGURAZIONE MQTT
// Supporto: Tasmota, Shelly EM, Sensori, OmniaPi
// ============================================

const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://localhost:1883';
const MQTT_USERNAME = process.env.MQTT_USERNAME || '';
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || '';

let mqttClient: mqtt.MqttClient | null = null;

// Handler per aggiornare lo stato dispositivo nel database
const handleMqttMessage = async (topic: string, message: Buffer) => {
  const messageStart = Date.now();
  console.log(`📨 MQTT: ${topic} - ${message.toString().substring(0, 100)}`);

  // ======================
  // OMNIAPI messages
  // Topic format: omniapi/gateway/...
  // ======================
  if (topic.startsWith('omniapi/')) {
    try {
      await handleOmniapiMessage(topic, message);
    } catch (error) {
      console.error('Errore processamento OmniaPi:', error);
    }
    return;
  }

  const parts = topic.split('/');
  if (parts.length < 3) return;

  const prefix = parts[0]; // stat o tele
  const deviceTopic = parts[1]; // es. tasmota_78F384
  const command = parts[2]; // es. POWER, RESULT, SENSOR

  // ======================
  // STAT messages (stato)
  // ======================
  if (prefix === 'stat') {
    try {
      // Aggiorna stato online
      await query(
        'UPDATE dispositivi SET stato = ? WHERE topic_mqtt = ?',
        ['online', deviceTopic]
      );

      // Se è un messaggio POWER, aggiorna anche power_state
      if (command === 'POWER') {
        const powerState = message.toString().toUpperCase() === 'ON';
        await query(
          'UPDATE dispositivi SET power_state = ? WHERE topic_mqtt = ?',
          [powerState, deviceTopic]
        );
        console.log(`💡 Device ${deviceTopic}: power_state = ${powerState}`);
      }

      // Se è un RESULT con POWER, estrai lo stato
      if (command === 'RESULT') {
        try {
          const result = JSON.parse(message.toString());
          if (result.POWER !== undefined) {
            const powerState = result.POWER === 'ON';
            await query(
              'UPDATE dispositivi SET power_state = ? WHERE topic_mqtt = ?',
              [powerState, deviceTopic]
            );
          }
        } catch (e) {
          // Non è JSON valido, ignora
        }
      }
    } catch (error) {
      // Ignora errori di DB silenziosamente
    }
  }

  // ======================
  // TELE messages (telemetria sensori)
  // ======================
  if (prefix === 'tele' && command === 'SENSOR') {
    try {
      const payload = JSON.parse(message.toString());
      await processTasmotaTelemetry(topic, payload);
      console.log(`🌡️ Sensor data from ${deviceTopic}`);
    } catch (error) {
      console.error('Errore processamento telemetria:', error);
    }
  }

  // ======================
  // SHELLY messages (energy monitoring)
  // Topic format: shellies/shellyem-XXXXXX/emeter/0/power
  // ======================
  if (prefix === 'shellies') {
    try {
      await processShellyEnergyData(topic, message);
    } catch (error) {
      console.error('Errore processamento Shelly:', error);
    }
  }
};

export const connectMQTT = () => {
  const options: mqtt.IClientOptions = {
    username: MQTT_USERNAME || undefined,
    password: MQTT_PASSWORD || undefined,
    reconnectPeriod: 5000,
    connectTimeout: 30000
  };

  mqttClient = mqtt.connect(MQTT_BROKER, options);

  mqttClient.on('connect', () => {
    console.log('✅ MQTT connesso con successo');
    // Subscribe ai topic: Tasmota (stato, telemetria) + Shelly (energia) + OmniaPi
    const topics = [
      'stat/+/+',               // Tasmota stato
      'tele/+/SENSOR',          // Tasmota sensori
      'shellies/+/emeter/+/+',  // Shelly EM energia
      'shellies/+/relay/+',     // Shelly stato relay
      // OmniaPi Gateway topics
      'omniapi/gateway/status',       // Stato gateway
      'omniapi/gateway/nodes',        // Lista nodi
      'omniapi/gateway/node/+/state', // Stato singolo nodo
      'omniapi/gateway/lwt',          // Last Will and Testament (offline)
      // OmniaPi LED Strip topics
      'omniapi/led/state'             // LED Strip state updates
    ];
    mqttClient?.subscribe(topics, (err) => {
      if (err) console.error('❌ Errore subscribe MQTT:', err);
      else console.log(`📡 Subscribed to ${topics.length} topic patterns`);
    });
  });

  mqttClient.on('error', (error) => {
    console.error('❌ Errore MQTT:', error);
  });

  mqttClient.on('message', handleMqttMessage);

  return mqttClient;
};

export const getMQTTClient = () => {
  if (!mqttClient) {
    throw new Error('MQTT client non inizializzato');
  }
  return mqttClient;
};

// Funzioni helper per Tasmota
export const tasmotaCommand = (topic: string, command: string, value?: any) => {
  const client = getMQTTClient();
  const payload = value !== undefined ? JSON.stringify(value) : '';
  client.publish(`cmnd/${topic}/${command}`, payload);
};

// ============================================
// OMNIAPI HANDLER
// ============================================

const handleOmniapiMessage = async (topic: string, message: Buffer) => {
  const messageStart = Date.now();
  const payload = message.toString();
  console.log(`📡 OmniaPi MQTT: ${topic}`);

  try {
    const data = JSON.parse(payload);

    // omniapi/led/state (LED Strip state updates)
    if (topic === 'omniapi/led/state') {
      console.log(`⏱️ [TIMING-LED] State update received at +${Date.now() - messageStart}ms`);
      console.log('📡 MQTT LED state:', data);

      // Update state in memory store
      const stateUpdateStart = Date.now();
      const { led: ledState, changed } = updateLedState(data.mac, {
        power: data.power,
        r: data.r,
        g: data.g,
        b: data.b,
        brightness: data.brightness,
        effect: data.effect,
        online: true
      });
      console.log(`⏱️ [TIMING-LED] Memory update: ${Date.now() - stateUpdateStart}ms`);

      // Emit WebSocket event ONLY if changed
      if (changed) {
        const wsEmitStart = Date.now();
        emitOmniapiLedUpdate(ledState);
        console.log(`⏱️ [TIMING-LED] WebSocket emit: ${Date.now() - wsEmitStart}ms`);
      }
      console.log(`⏱️ [TIMING-LED] Total processing: ${Date.now() - messageStart}ms (changed=${changed})`);
      return;
    }

    // omniapi/gateway/lwt (Last Will - Gateway offline)
    if (topic === 'omniapi/gateway/lwt') {
      console.log('📴 Gateway offline (LWT):', data.mac || payload);
      if (data.mac) {
        await markGatewayOffline(data.mac);
        // Aggiorna anche lo stato in-memory
        updateGatewayState({ ...data, online: false });
        emitOmniapiGatewayUpdate({ mac: data.mac, online: false });

        // Recupera impianto_id dal gateway MAC
        const gateways = await query(
          'SELECT impianto_id FROM gateways WHERE mac_address = ?',
          [data.mac]
        ) as any[];

        if (gateways && gateways.length > 0 && gateways[0].impianto_id) {
          // Salva nello storico e invia notifica push
          notificationService.sendAndSave({
            impiantoId: gateways[0].impianto_id,
            type: 'gateway_offline',
            title: '⚠️ Gateway Offline',
            body: 'Il gateway OmniaPi non è raggiungibile',
            data: { mac: data.mac, timestamp: new Date().toISOString() }
          }).catch(err => console.error('Error sending offline notification:', err));
        } else {
          // Fallback: broadcast senza storico se gateway non associato
          notificationService.sendBroadcast({
            title: '⚠️ Gateway Offline',
            body: 'Il gateway OmniaPi non è raggiungibile',
            data: { type: 'gateway_offline', mac: data.mac, timestamp: new Date().toISOString() }
          }).catch(err => console.error('Error sending offline notification:', err));
        }
      }
      return;
    }

    // omniapi/gateway/status
    if (topic === 'omniapi/gateway/status') {
      const { gateway, changed } = updateGatewayState(data);
      if (changed) {
        emitOmniapiGatewayUpdate(gateway);
      }

      // Registra/aggiorna gateway nel database
      // Usa MAC se disponibile, altrimenti cerca per IP
      if (data.mac || data.ip) {
        await updateGatewayFromMqtt(
          data.mac,  // può essere undefined
          data.ip,
          data.version,
          data.nodes_count ?? data.node_count ?? data.nodeCount
        );
      }
      return;
    }

    // omniapi/gateway/nodes
    if (topic === 'omniapi/gateway/nodes') {
      if (data.nodes && Array.isArray(data.nodes)) {
        console.log(`📡 [DEBUG] Nodes list received: ${data.nodes.length} nodes`);

        // Usa Device Type Registry per filtrare i dispositivi
        // LED: firmwareId 0x10 (16) o 0x11 (17)
        // Relay: firmwareId 0x01 (1) o 0x02 (2)
        const relayNodes = data.nodes.filter((n: any) => isRelayFirmwareId(n.deviceType));
        const ledNodes = data.nodes.filter((n: any) => isLedFirmwareId(n.deviceType));

        // FIX: Aggiorna node_count nel gateway quando riceviamo la lista nodi
        if (data.gateway_mac) {
          await updateGatewayFromMqtt(data.gateway_mac, undefined, undefined, data.nodes.length);
        }

        console.log(`📡 [DEBUG] Filtered: ${relayNodes.length} relay nodes, ${ledNodes.length} LED strips`);

        // Log e aggiorna solo i relay nodes in nodesState
        const { nodes: updatedNodes, changed: nodesChanged } = updateNodesFromList(relayNodes);
        if (nodesChanged) {
          emitOmniapiNodesUpdate(updatedNodes);
        }

        // Aggiorna i LED strip in ledDevicesState
        ledNodes.forEach((led: any) => {
          let result;
          if (led.ledState) {
            result = updateLedState(led.mac, {
              power: led.ledState.power,
              r: led.ledState.r,
              g: led.ledState.g,
              b: led.ledState.b,
              brightness: led.ledState.brightness,
              effect: led.ledState.effect,
              online: led.online ?? true
            });
          } else {
            // LED senza stato dettagliato - aggiorna solo online
            result = updateLedState(led.mac, { online: led.online ?? true });
          }
          if (result.changed) {
            emitOmniapiLedUpdate(result.led);
          }
        });

        // Sync solo relay nodes al database
        await syncNodesToDatabase(relayNodes);
      }
      return;
    }

    // omniapi/gateway/node/{mac}/state
    // Topic format: omniapi/gateway/node/XX:XX:XX:XX:XX:XX/state
    const nodeStateMatch = topic.match(/^omniapi\/gateway\/node\/([^/]+)\/state$/);
    if (nodeStateMatch) {
      const mac = nodeStateMatch[1];
      // Expected payload: { relay1: 0|1|"on"|"off", relay2: 0|1|"on"|"off", online?: boolean }
      const parseRelay = (val: any) => val === 1 || val === true || val === 'on' || val === 'ON';
      const relay1 = parseRelay(data.relay1);
      const relay2 = parseRelay(data.relay2);

      console.log(`📡 [DEBUG] Node state received: MAC=${mac}, raw={relay1:${data.relay1}, relay2:${data.relay2}}, parsed={relay1:${relay1}, relay2:${relay2}}`);
      console.log(`⏱️ [TIMING] Node state message processing started at +${Date.now() - messageStart}ms`);

      const stateUpdateStart = Date.now();
      const { node: nodeUpdate, changed } = updateNodeState(mac, {
        relay1,
        relay2,
        online: data.online ?? true,
        rssi: data.rssi
      });
      console.log(`⏱️ [TIMING] Memory state update: ${Date.now() - stateUpdateStart}ms`);

      if (nodeUpdate && changed) {
        const wsEmitStart = Date.now();
        console.log(`📡 [DEBUG] Emitting node update (CHANGED):`, JSON.stringify(nodeUpdate));
        emitOmniapiNodeUpdate(nodeUpdate);
        console.log(`⏱️ [TIMING] WebSocket emit: ${Date.now() - wsEmitStart}ms`);

        // Sync stato al database
        const dbSyncStart = Date.now();
        await syncNodeStateToDatabase(mac, {
          relay1,
          relay2,
          rssi: data.rssi,
          online: data.online ?? true
        });
        console.log(`⏱️ [TIMING] DB sync: ${Date.now() - dbSyncStart}ms`);
        console.log(`⏱️ [TIMING] Node state TOTAL processing: ${Date.now() - messageStart}ms`);
      } else {
        console.log(`⚠️ [DEBUG] Node update returned null for MAC=${mac}`);
      }
      return;
    }

  } catch (error) {
    console.error('Errore parsing OmniaPi message:', error);
  }
};

// ============================================
// SYNC OMNIAPI → DATABASE
// ============================================

/**
 * Sincronizza la lista nodi al database (update stato online/offline)
 * REAL-TIME: usa SOLO il campo online riportato dal gateway
 */
const syncNodesToDatabase = async (nodes: any[]) => {
  try {
    // Aggiorna ogni nodo in base al suo stato online riportato dal gateway
    for (const node of nodes) {
      const isOnline = node.online === true || node.online === 1;
      await query(
        `UPDATE dispositivi SET
          stato = ?,
          omniapi_info = JSON_SET(
            COALESCE(omniapi_info, '{}'),
            '$.rssi', ?,
            '$.version', ?,
            '$.relay1', ?,
            '$.relay2', ?,
            '$.online', ?
          ),
          aggiornato_il = NOW()
         WHERE mac_address = ? AND device_type = 'omniapi_node'`,
        [
          isOnline ? 'online' : 'offline',
          node.rssi || 0,
          node.version || 'unknown',
          node.relay1 ? true : false,
          node.relay2 ? true : false,
          isOnline,
          node.mac
        ]
      );
    }
    console.log(`📡 Synced ${nodes.length} nodes to DB (real-time status)`);
  } catch (error) {
    console.error('Errore sync nodi DB:', error);
  }
};

/**
 * Sincronizza lo stato di un singolo nodo al database
 */
const syncNodeStateToDatabase = async (mac: string, state: {
  relay1: boolean;
  relay2: boolean;
  rssi?: number;
  online?: boolean;
}) => {
  try {
    await query(
      `UPDATE dispositivi SET
        stato = ?,
        power_state = ?,
        omniapi_info = JSON_SET(
          COALESCE(omniapi_info, '{}'),
          '$.rssi', ?,
          '$.relay1', ?,
          '$.relay2', ?
        ),
        aggiornato_il = NOW()
       WHERE mac_address = ? AND device_type = 'omniapi_node'`,
      [
        state.online !== false ? 'online' : 'offline',
        state.relay1 || state.relay2, // power_state = true se almeno un relay è on
        state.rssi || 0,
        state.relay1,
        state.relay2,
        mac
      ]
    );
  } catch (error) {
    console.error('Errore sync stato nodo DB:', error);
  }
};

// ============================================
// OMNIAPI COMMANDS
// ============================================

export const omniapiCommand = (nodeMac: string, channel: number, action: 'on' | 'off' | 'toggle') => {
  const commandStart = Date.now();
  const client = getMQTTClient();
  const payload = JSON.stringify({
    node_mac: nodeMac,
    channel,
    action
  });
  console.log(`📡 [DEBUG] Sending MQTT command: topic=omniapi/gateway/command, payload=${payload}`);
  client.publish('omniapi/gateway/command', payload, (err) => {
    const publishTime = Date.now() - commandStart;
    if (err) {
      console.error(`⏱️ [TIMING] MQTT publish ERROR after ${publishTime}ms:`, err);
    } else {
      console.log(`⏱️ [TIMING] MQTT publish confirmed: ${publishTime}ms`);
    }
  });
  console.log(`📡 OmniaPi command sent: ${nodeMac} ch${channel} ${action}`);
};
