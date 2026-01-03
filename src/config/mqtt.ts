import mqtt from 'mqtt';
import dotenv from 'dotenv';
import { query } from './database';
import { processTasmotaTelemetry } from '../services/sensorService';
import { processShellyEnergyData } from '../services/energyService';
import {
  updateGatewayState,
  updateNodesFromList,
  updateNodeState,
  getAllNodes
} from '../services/omniapiState';
import {
  emitOmniapiGatewayUpdate,
  emitOmniapiNodeUpdate,
  emitOmniapiNodesUpdate
} from '../socket';
import {
  updateGatewayFromMqtt,
  markGatewayOffline
} from '../controllers/gatewayController';

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
      'omniapi/gateway/lwt'           // Last Will and Testament (offline)
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
  const payload = message.toString();
  console.log(`📡 OmniaPi MQTT: ${topic}`);

  try {
    const data = JSON.parse(payload);

    // omniapi/gateway/lwt (Last Will - Gateway offline)
    if (topic === 'omniapi/gateway/lwt') {
      console.log('📴 Gateway offline (LWT):', data.mac || payload);
      if (data.mac) {
        await markGatewayOffline(data.mac);
        // Aggiorna anche lo stato in-memory
        updateGatewayState({ ...data, online: false });
        emitOmniapiGatewayUpdate({ mac: data.mac, online: false });
      }
      return;
    }

    // omniapi/gateway/status
    if (topic === 'omniapi/gateway/status') {
      const gateway = updateGatewayState(data);
      emitOmniapiGatewayUpdate(gateway);

      // Registra/aggiorna gateway nel database
      if (data.mac) {
        await updateGatewayFromMqtt(
          data.mac,
          data.ip,
          data.version,
          data.node_count ?? data.nodeCount
        );
      }
      return;
    }

    // omniapi/gateway/nodes
    if (topic === 'omniapi/gateway/nodes') {
      if (data.nodes && Array.isArray(data.nodes)) {
        updateNodesFromList(data.nodes);
        emitOmniapiNodesUpdate(getAllNodes());
        // Sync nodi al database
        await syncNodesToDatabase(data.nodes);
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
      const nodeUpdate = updateNodeState(mac, {
        relay1,
        relay2,
        online: data.online ?? true,
        rssi: data.rssi
      });
      if (nodeUpdate) {
        emitOmniapiNodeUpdate(nodeUpdate);
        // Sync stato al database
        await syncNodeStateToDatabase(mac, {
          relay1,
          relay2,
          rssi: data.rssi,
          online: data.online ?? true
        });
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
 */
const syncNodesToDatabase = async (nodes: any[]) => {
  try {
    const macs = nodes.map(n => n.mac);

    // Segna tutti i nodi registrati come offline prima
    await query(
      `UPDATE dispositivi SET stato = 'offline'
       WHERE device_type = 'omniapi_node'
       AND mac_address NOT IN (?)`,
      [macs.length > 0 ? macs : ['']]
    );

    // Aggiorna ogni nodo online
    for (const node of nodes) {
      await query(
        `UPDATE dispositivi SET
          stato = 'online',
          omniapi_info = JSON_SET(
            COALESCE(omniapi_info, '{}'),
            '$.rssi', ?,
            '$.version', ?,
            '$.relay1', ?,
            '$.relay2', ?
          ),
          aggiornato_il = NOW()
         WHERE mac_address = ? AND device_type = 'omniapi_node'`,
        [
          node.rssi || 0,
          node.version || 'unknown',
          node.relay1 ? true : false,
          node.relay2 ? true : false,
          node.mac
        ]
      );
    }
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
  const client = getMQTTClient();
  const payload = JSON.stringify({
    node_mac: nodeMac,
    channel,
    action
  });
  client.publish('omniapi/gateway/command', payload);
  console.log(`📡 OmniaPi command sent: ${nodeMac} ch${channel} ${action}`);
};
