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
  getLedState,
  getGatewayBusyState,
  resolvePendingCommand,
  normalizeMac
} from '../services/omniapiState';
import {
  emitOmniapiGatewayUpdate,
  emitOmniapiNodeUpdate,
  emitOmniapiNodesUpdate,
  emitOmniapiLedUpdate,
  getImpiantoIdForMac
} from '../socket';
import {
  updateGatewayFromMqtt,
  markGatewayOffline,
} from '../controllers/gatewayController';
import { emitGatewayUpdate } from '../socket';
import * as notificationService from '../services/notificationService';
// Device Type Registry - Single Source of Truth
import {
  FIRMWARE_IDS,
  isLedFirmwareId,
  isRelayFirmwareId,
  getDeviceTypeFromFirmwareId
} from './deviceTypes';
import { logOperation } from '../services/operationLog';

// ============================================
// RECONCILIATION STATE
// ============================================
let firstHeartbeatDone = false;
let lastReconcileTime = 0;
const RECONCILE_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Deferred orphan cleanup: don't factory-reset immediately when no impianto,
// wait for next cycle to avoid racing with wizard (commission → create impianto)
let pendingOrphanCleanup: { pending: boolean; timestamp: number } = { pending: false, timestamp: 0 };

// Node online state tracking: detect online↔offline transitions (not every heartbeat)
const previousNodeOnlineState = new Map<string, boolean>();

// Low heap warning throttle: max once every 30 minutes
let lastLowHeapWarningTime = 0;
const LOW_HEAP_WARNING_INTERVAL = 30 * 60 * 1000; // 30 minutes
const LOW_HEAP_THRESHOLD = 40000;

dotenv.config();

// ============================================
// GATEWAY ONLINE MAP (in-memory tracking)
// ============================================

interface OnlineGateway {
  mac: string;
  ip: string;
  version: string;
  uptime: number;
  nodes_count: number;
  eth_connected: boolean;
  public_ip: string;
  last_seen: Date;
}

export const onlineGateways = new Map<string, OnlineGateway>();

// IP pubblico del server (condiviso con i gateway sulla stessa rete)
let serverPublicIp: string = '';

const fetchPublicIp = async () => {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json() as { ip: string };
    serverPublicIp = data.ip;
    console.log(`🌐 IP pubblico server: ${serverPublicIp}`);
  } catch (error) {
    console.error('❌ Errore fetch IP pubblico:', error);
  }
};

// Fetch IP pubblico all'avvio e ogni 30 minuti
fetchPublicIp();
setInterval(fetchPublicIp, 30 * 60 * 1000);

// Cleanup gateway che non pubblicano da più di 90 secondi
setInterval(() => {
  const now = Date.now();
  for (const [mac, gw] of onlineGateways) {
    if (now - gw.last_seen.getTime() > 90_000) {
      onlineGateways.delete(mac);
      console.log(`🧹 Gateway ${mac} rimosso dalla Map (timeout 90s)`);
    }
  }
}, 60_000);

// ============================================
// SCAN & COMMISSION RESULTS (in-memory tracking)
// ============================================

interface ScanNode {
  mac: string;
  device_type: number;
  firmware: string;
  rssi: number;
  commissioned: boolean;
}

interface ScanResults {
  nodes: ScanNode[];
  count: number;
  timestamp: number;
}

interface CommissionResult {
  success: boolean;
  message: string;
  timestamp: number;
}

export let scanResults: ScanResults | null = null;
export const commissionResults = new Map<string, CommissionResult>();

export const clearScanResults = () => {
  scanResults = null;
};

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
    // Reset reconciliation flag so next heartbeat triggers full sync
    firstHeartbeatDone = false;
    // Subscribe ai topic: Tasmota (stato, telemetria) + Shelly (energia) + OmniaPi
    const topics = [
      'stat/+/+',               // Tasmota stato
      'tele/+/SENSOR',          // Tasmota sensori
      'shellies/+/emeter/+/+',  // Shelly EM energia
      'shellies/+/relay/+',     // Shelly stato relay
      // OmniaPi Gateway topics
      'omniapi/gateway/status',       // Stato gateway
      'omniapi/gateway/nodes',        // Lista nodi
      'omniapi/gateway/nodes/+/state', // Stato singolo nodo (relay feedback)
      'omniapi/gateway/lwt',          // Last Will and Testament (offline)
      // OmniaPi Scan & Commission results
      'omniapi/gateway/scan/results',       // Scan results from gateway
      'omniapi/gateway/commission/result',   // Commission result from gateway
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
// RECONCILIATION: Gateway ↔ Backend
// ============================================

const reconcileGatewayNodes = async (gatewayMac: string, gatewayNodes: string[]) => {
  try {
    // 1. If gateway is busy (scan, commission, etc.) → skip reconciliation entirely
    const busyState = getGatewayBusyState();
    if (busyState.busy) {
      console.log(`[RECONCILE] Skipping — gateway busy with: ${busyState.operation}`);
      return;
    }

    // Find impianto for this gateway
    const gwRows = await query(
      'SELECT impianto_id FROM gateways WHERE mac_address = ? AND impianto_id IS NOT NULL LIMIT 1',
      [gatewayMac]
    ) as any[];

    if (!gwRows || gwRows.length === 0) {
      if (gatewayNodes.length > 0) {
        // 2. Deferred orphan cleanup: don't factory-reset immediately
        if (!pendingOrphanCleanup.pending) {
          // First time seeing orphans without impianto → flag it, wait for next cycle
          pendingOrphanCleanup = { pending: true, timestamp: Date.now() };
          console.log(`[RECONCILE] Gateway has ${gatewayNodes.length} orphan nodes but no impianto — flagging for deferred cleanup (will check again next cycle)`);
        } else {
          // 3. Already flagged → check if enough time has passed (at least one full cycle)
          const elapsed = Date.now() - pendingOrphanCleanup.timestamp;
          if (elapsed >= RECONCILE_INTERVAL) {
            console.log(`[RECONCILE] Deferred cleanup confirmed (${Math.round(elapsed / 1000)}s elapsed) — sending factory-reset for ${gatewayNodes.length} orphan nodes`);
            const client = getMQTTClient();
            client.publish('omniapi/gateway/cmd/factory-reset', JSON.stringify({}));
            pendingOrphanCleanup = { pending: false, timestamp: 0 };
            logOperation(null, 'factory_reset', 'success', { reason: 'orphan_cleanup', orphan_count: gatewayNodes.length, gateway_mac: gatewayMac });
          } else {
            console.log(`[RECONCILE] Deferred cleanup pending — only ${Math.round(elapsed / 1000)}s elapsed, waiting for full cycle`);
          }
        }
      } else {
        // No nodes and no impianto → clear any pending cleanup
        if (pendingOrphanCleanup.pending) {
          console.log(`[RECONCILE] Orphan nodes cleared (factory-reset already happened or nodes left) — cancelling deferred cleanup`);
          pendingOrphanCleanup = { pending: false, timestamp: 0 };
        }
      }
      return;
    }

    // Gateway has impianto → clear any pending orphan cleanup (wizard completed successfully)
    if (pendingOrphanCleanup.pending) {
      console.log(`[RECONCILE] Gateway now has impianto — cancelling deferred orphan cleanup`);
      pendingOrphanCleanup = { pending: false, timestamp: 0 };
    }

    const impiantoId = gwRows[0].impianto_id;

    // Get DB nodes for this impianto
    const dbRows = await query(
      `SELECT mac_address FROM dispositivi WHERE impianto_id = ? AND device_type IN ('omniapi_node', 'omniapi_led')`,
      [impiantoId]
    ) as any[];

    const dbMacs = new Set((dbRows || []).map((r: any) => normalizeMac(r.mac_address || '')));
    const gwMacs = new Set(gatewayNodes.map((m: string) => normalizeMac(m)));

    let matched = 0;
    let removed = 0;
    let markedOffline = 0;

    // MAC in gateway but NOT in DB → orphan, delete from gateway
    for (const mac of gwMacs) {
      if (dbMacs.has(mac)) {
        matched++;
      } else {
        console.log(`[RECONCILE] Removing orphan node ${mac} from gateway`);
        omniapiDeleteNode(mac);
        removed++;
      }
    }

    // MAC in DB but NOT in gateway → mark offline
    for (const mac of dbMacs) {
      if (!gwMacs.has(mac)) {
        console.log(`[RECONCILE] Node ${mac} in DB but not on gateway - marking offline`);
        updateNodeState(mac, { online: false });
        await query(
          `UPDATE dispositivi SET stato = 'offline' WHERE mac_address = ? AND device_type IN ('omniapi_node', 'omniapi_led')`,
          [mac]
        );
        markedOffline++;
      }
    }

    console.log(`[RECONCILE] Gateway sync complete: ${matched} matched, ${removed} removed, ${markedOffline} marked offline`);
    lastReconcileTime = Date.now();
    if (removed > 0 || markedOffline > 0) {
      logOperation(impiantoId, 'reconciliation', 'success', { matched, removed, marked_offline: markedOffline, gateway_mac: gatewayMac });
    }
  } catch (error: any) {
    console.error('[RECONCILE] Error during reconciliation:', error);
    logOperation(null, 'reconciliation', 'error', { error: error.message, gateway_mac: gatewayMac });
  }
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

      // Emit WebSocket event ONLY if changed (room-scoped)
      if (changed) {
        const wsEmitStart = Date.now();
        const ledImpiantoId = await getImpiantoIdForMac(data.mac);
        emitOmniapiLedUpdate(ledState, ledImpiantoId);
        console.log(`⏱️ [TIMING-LED] WebSocket emit: ${Date.now() - wsEmitStart}ms (impianto=${ledImpiantoId})`);
      }
      console.log(`⏱️ [TIMING-LED] Total processing: ${Date.now() - messageStart}ms (changed=${changed})`);
      return;
    }

    // omniapi/gateway/scan/results (Scan results from gateway)
    if (topic === 'omniapi/gateway/scan/results') {
      console.log(`📡 Scan results received: ${data.count} nodes`);
      scanResults = {
        nodes: data.nodes || [],
        count: data.count || 0,
        timestamp: Date.now()
      };
      return;
    }

    // omniapi/gateway/commission/result (Commission result from gateway)
    if (topic === 'omniapi/gateway/commission/result') {
      console.log(`📡 Commission result: mac=${data.mac}, success=${data.success}`);
      if (data.mac) {
        const normalizedMac = data.mac.toUpperCase().replace(/-/g, ':');
        commissionResults.set(normalizedMac, {
          success: data.success,
          message: data.message || '',
          timestamp: Date.now()
        });
      }
      return;
    }

    // omniapi/gateway/lwt (Last Will - Gateway offline)
    if (topic === 'omniapi/gateway/lwt') {
      console.log('📴 Gateway offline (LWT):', data.mac || payload);
      if (data.mac) {
        const normalizedMac = data.mac.toUpperCase().replace(/-/g, ':');
        onlineGateways.delete(normalizedMac);
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

    // omniapi/gateway/status (includes LWT with online:false)
    if (topic === 'omniapi/gateway/status') {
      const { gateway, changed } = updateGatewayState(data);

      // Lookup impianto for this gateway (used for all emissions in this block)
      let gwImpiantoId: number | null = null;
      if (data.mac) {
        try {
          const gwRows = await query('SELECT impianto_id FROM gateways WHERE mac_address = ? LIMIT 1', [data.mac]) as any[];
          gwImpiantoId = gwRows.length > 0 ? gwRows[0].impianto_id : null;
        } catch { /* ignore */ }
      }

      // Always emit GATEWAY_UPDATED on heartbeat with nodes summary
      // so frontend can clear unreachable/offline states even when gateway state is unchanged
      const nodesForGateway = data.nodes && Array.isArray(data.nodes)
        ? data.nodes.map((n: any) => ({ mac: n.mac, online: n.online === true }))
        : undefined;
      emitOmniapiGatewayUpdate({ ...gateway, nodes: nodesForGateway }, gwImpiantoId);

      // Parse nodes array from heartbeat (v1.7.7+)
      // NOTE: heartbeat nodes may NOT have a 'type' field — classify via
      // in-memory state (known LED → ledDevicesState, else → relay default)
      if (data.nodes && Array.isArray(data.nodes) && data.nodes.length > 0) {
        const relayUpdates: Array<{ mac: string; online: boolean; rssi: number; version: string }> = [];
        const ledUpdates: any[] = [];

        for (const n of data.nodes) {
          const mac = normalizeMac(n.mac);
          // If 'type' field is present, use it; otherwise classify by in-memory state
          if (n.type !== undefined ? isLedFirmwareId(n.type) : !!getLedState(mac)) {
            ledUpdates.push(n);
          } else {
            relayUpdates.push({
              mac: n.mac,
              online: n.online === true,
              rssi: n.rssi ?? 0,
              version: n.fw ?? '',
            });
          }
        }

        if (relayUpdates.length > 0) {
          const { nodes: updatedNodes, changed: nodesChanged } = updateNodesFromList(relayUpdates);
          if (nodesChanged) {
            emitOmniapiNodesUpdate(updatedNodes, gwImpiantoId);
          }
        }

        // Update LED devices
        ledUpdates.forEach((led: any) => {
          const result = updateLedState(led.mac, { online: led.online === true });
          if (result.changed) {
            emitOmniapiLedUpdate(result.led, gwImpiantoId);
          }
        });

        // NODE ONLINE/OFFLINE NOTIFICATIONS — only on state change
        if (gwImpiantoId) {
          const allNodes = data.nodes as any[];
          const currentOnlineMacs = new Set(
            allNodes.filter((n: any) => n.online === true).map((n: any) => normalizeMac(n.mac))
          );
          const allCurrentMacs = new Set(
            allNodes.map((n: any) => normalizeMac(n.mac))
          );

          // Check for nodes that went offline
          for (const [mac, wasOnline] of previousNodeOnlineState) {
            const isNowOnline = currentOnlineMacs.has(mac);
            if (wasOnline && !isNowOnline) {
              // Was online, now offline (or missing from list)
              console.log(`[NODE-STATUS] Node ${mac} went OFFLINE`);
              // Update DB stato
              query(
                `UPDATE dispositivi SET stato = 'offline' WHERE UPPER(mac_address) = ? AND impianto_id = ?`,
                [mac, gwImpiantoId]
              ).catch(err => console.error('[NODE-STATUS] DB update offline error:', err));
              // Notification
              query(
                `SELECT nome FROM dispositivi WHERE UPPER(mac_address) = ? AND impianto_id = ? LIMIT 1`,
                [mac, gwImpiantoId]
              ).then((rows: any) => {
                const nome = rows?.[0]?.nome || mac;
                notificationService.sendAndSave({
                  impiantoId: gwImpiantoId!,
                  type: 'device_offline',
                  title: 'Nodo offline',
                  body: `Il nodo ${nome} non risponde`,
                  data: { mac, timestamp: new Date().toISOString() }
                }).catch(err => console.error('[NODE-STATUS] Error sending offline notification:', err));
              }).catch(() => {});
            } else if (!wasOnline && isNowOnline) {
              // Was offline, now online
              console.log(`[NODE-STATUS] Node ${mac} came ONLINE`);
              // Update DB stato
              query(
                `UPDATE dispositivi SET stato = 'online' WHERE UPPER(mac_address) = ? AND impianto_id = ?`,
                [mac, gwImpiantoId]
              ).catch(err => console.error('[NODE-STATUS] DB update online error:', err));
              // Notification
              query(
                `SELECT nome FROM dispositivi WHERE UPPER(mac_address) = ? AND impianto_id = ? LIMIT 1`,
                [mac, gwImpiantoId]
              ).then((rows: any) => {
                const nome = rows?.[0]?.nome || mac;
                notificationService.sendAndSave({
                  impiantoId: gwImpiantoId!,
                  type: 'device_online',
                  title: 'Nodo online',
                  body: `Il nodo ${nome} è tornato online`,
                  data: { mac, timestamp: new Date().toISOString() }
                }).catch(err => console.error('[NODE-STATUS] Error sending online notification:', err));
              }).catch(() => {});
            }
          }

          // Update tracked state for next heartbeat
          for (const node of allNodes) {
            previousNodeOnlineState.set(normalizeMac(node.mac), node.online === true);
          }
        }
      }

      // LOW HEAP WARNING
      if (data.heap_free !== undefined && data.heap_free < LOW_HEAP_THRESHOLD && gwImpiantoId) {
        const now = Date.now();
        if (now - lastLowHeapWarningTime > LOW_HEAP_WARNING_INTERVAL) {
          lastLowHeapWarningTime = now;
          const heapKb = Math.round(data.heap_free / 1024);
          console.warn(`[HEAP-WARNING] Gateway heap low: ${data.heap_free} bytes (${heapKb} KB)`);
          notificationService.sendAndSave({
            impiantoId: gwImpiantoId,
            type: 'system',
            title: 'Memoria gateway bassa',
            body: `Heap libero: ${heapKb} KB. Riavvio consigliato.`,
            data: { heap_free: data.heap_free, timestamp: new Date().toISOString() }
          }).catch(err => console.error('[HEAP-WARNING] Error sending notification:', err));
        }
      }

      // Aggiorna onlineGateways Map
      if (data.mac) {
        const normalizedMac = data.mac.toUpperCase().replace(/-/g, ':');
        if (data.online !== false) {
          onlineGateways.set(normalizedMac, {
            mac: normalizedMac,
            ip: data.ip || '',
            version: data.version || '',
            uptime: data.uptime || 0,
            nodes_count: data.nodes_count ?? data.node_count ?? data.nodeCount ?? 0,
            eth_connected: data.eth_connected ?? false,
            public_ip: serverPublicIp,
            last_seen: new Date()
          });

          // RECONCILIATION: first heartbeat or periodic (every 5 min)
          if (data.nodes && Array.isArray(data.nodes)) {
            const gwNodeMacs = data.nodes.map((n: any) => n.mac).filter(Boolean);
            const now = Date.now();

            if (!firstHeartbeatDone) {
              firstHeartbeatDone = true;
              console.log('[RECONCILE] First heartbeat — triggering full reconciliation');
              reconcileGatewayNodes(data.mac, gwNodeMacs).catch(e =>
                console.error('[RECONCILE] Error:', e)
              );
            } else if (now - lastReconcileTime > RECONCILE_INTERVAL) {
              // Periodic: check if count mismatch
              const gwCount = gwNodeMacs.length;
              // Quick DB count check
              query(
                `SELECT COUNT(*) as cnt FROM dispositivi WHERE impianto_id = (SELECT impianto_id FROM gateways WHERE mac_address = ? AND impianto_id IS NOT NULL LIMIT 1) AND device_type IN ('omniapi_node', 'omniapi_led')`,
                [data.mac]
              ).then((rows: any) => {
                const dbCount = rows?.[0]?.cnt ?? 0;
                if (gwCount !== dbCount) {
                  console.log(`[RECONCILE] Count mismatch (gw=${gwCount}, db=${dbCount}) — triggering reconciliation`);
                  reconcileGatewayNodes(data.mac, gwNodeMacs).catch(e =>
                    console.error('[RECONCILE] Error:', e)
                  );
                } else {
                  lastReconcileTime = now;
                }
              }).catch(() => {});
            }
          }
        } else {
          onlineGateways.delete(normalizedMac);
        }
      }

      // Handle offline (LWT arrives on same topic with online:false)
      if (data.online === false && data.mac) {
        console.log('📴 Gateway offline (LWT on status topic):', data.mac);
        await markGatewayOffline(data.mac);

        // Recupera impianto_id e invia notifica push
        const gateways = await query(
          'SELECT impianto_id FROM gateways WHERE mac_address = ?',
          [data.mac]
        ) as any[];

        if (gateways && gateways.length > 0 && gateways[0].impianto_id) {
          notificationService.sendAndSave({
            impiantoId: gateways[0].impianto_id,
            type: 'gateway_offline',
            title: '⚠️ Gateway Offline',
            body: 'Il gateway OmniaPi non è raggiungibile',
            data: { mac: data.mac, timestamp: new Date().toISOString() }
          }).catch(err => console.error('Error sending offline notification:', err));
        }
        return;
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

        const relayNodes = data.nodes.filter((n: any) => isRelayFirmwareId(n.deviceType));
        const ledNodes = data.nodes.filter((n: any) => isLedFirmwareId(n.deviceType));

        // Lookup impianto for this gateway
        let nodesImpiantoId: number | null = null;
        if (data.gateway_mac) {
          await updateGatewayFromMqtt(data.gateway_mac, undefined, undefined, data.nodes.length);
          try {
            const gwRows = await query('SELECT impianto_id FROM gateways WHERE mac_address = ? LIMIT 1', [data.gateway_mac]) as any[];
            nodesImpiantoId = gwRows.length > 0 ? gwRows[0].impianto_id : null;
          } catch { /* ignore */ }
        }

        console.log(`📡 [DEBUG] Filtered: ${relayNodes.length} relay nodes, ${ledNodes.length} LED strips`);

        const { nodes: updatedNodes, changed: nodesChanged } = updateNodesFromList(relayNodes);
        if (nodesChanged) {
          emitOmniapiNodesUpdate(updatedNodes, nodesImpiantoId);
        }

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
            result = updateLedState(led.mac, { online: led.online ?? true });
          }
          if (result.changed) {
            emitOmniapiLedUpdate(result.led, nodesImpiantoId);
          }
        });

        await syncNodesToDatabase(relayNodes);
      }
      return;
    }

    // omniapi/gateway/nodes/{mac}/state
    // Topic format: omniapi/gateway/nodes/AABBCCDDEEFF/state
    const nodeStateMatch = topic.match(/^omniapi\/gateway\/nodes\/([^/]+)\/state$/);
    if (nodeStateMatch) {
      const mac = normalizeMac(nodeStateMatch[1]);
      // Expected payload: { relay1: 0|1|"on"|"off", relay2: 0|1|"on"|"off", online?: boolean }
      const parseRelay = (val: any) => val === 1 || val === true || val === 'on' || val === 'ON';
      const relay1 = parseRelay(data.relay1);
      const relay2 = parseRelay(data.relay2);

      console.log(`📡 [DEBUG] Node state received: MAC=${mac}, raw={relay1:${data.relay1}, relay2:${data.relay2}}, parsed={relay1:${relay1}, relay2:${relay2}}`);
      console.log(`⏱️ [TIMING] Node state message processing started at +${Date.now() - messageStart}ms`);

      // Resolve any pending relay commands for this MAC (confirm delivery)
      // MAC from MQTT is AABBCCDDEEFF format, pending commands use original format
      resolvePendingCommand(mac);

      const stateUpdateStart = Date.now();
      const { node: nodeUpdate, changed } = updateNodeState(mac, {
        relay1,
        relay2,
        online: data.online ?? true,
        rssi: data.rssi
      });
      console.log(`⏱️ [TIMING] Memory state update: ${Date.now() - stateUpdateStart}ms`);

      // ALWAYS emit NODE_UPDATED for relay state messages (even if state didn't change).
      // This is a command acknowledgment — the frontend needs it to clear pendingCommands.
      // Without this, the spinner persists forever when toggling to the same state.
      if (nodeUpdate) {
        const wsEmitStart = Date.now();
        const nodeImpiantoId = await getImpiantoIdForMac(mac);
        console.log(`📡 [DEBUG] Emitting node update (changed=${changed}):`, JSON.stringify(nodeUpdate));
        emitOmniapiNodeUpdate(nodeUpdate, nodeImpiantoId);
        console.log(`⏱️ [TIMING] WebSocket emit: ${Date.now() - wsEmitStart}ms (impianto=${nodeImpiantoId})`);

        if (changed) {
          // Sync stato al database only when actually changed
          const dbSyncStart = Date.now();
          await syncNodeStateToDatabase(mac, {
            relay1,
            relay2,
            rssi: data.rssi,
            online: data.online ?? true
          });
          console.log(`⏱️ [TIMING] DB sync: ${Date.now() - dbSyncStart}ms`);
        }
        console.log(`⏱️ [TIMING] Node state TOTAL processing: ${Date.now() - messageStart}ms`);
      } else {
        console.log(`⚠️ [DEBUG] Node update returned null for MAC=${mac} (node not in memory)`);
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
      const normalMac = normalizeMac(node.mac);
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
          normalMac
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
    const normalMac = normalizeMac(mac);
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
        normalMac
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
  // Frontend uses 1-based channels, firmware uses 0-based
  const fwChannel = channel > 0 ? channel - 1 : 0;
  const payload = JSON.stringify({
    mac: nodeMac,
    channel: fwChannel,
    action
  });
  const topic = 'omniapi/gateway/cmd/relay';
  console.log(`📡 [DEBUG] Sending MQTT command: topic=${topic}, payload=${payload}`);
  client.publish(topic, payload, (err) => {
    const publishTime = Date.now() - commandStart;
    if (err) {
      console.error(`⏱️ [TIMING] MQTT publish ERROR after ${publishTime}ms:`, err);
    } else {
      console.log(`⏱️ [TIMING] MQTT publish confirmed: ${publishTime}ms`);
    }
  });
  console.log(`📡 OmniaPi command sent: ${nodeMac} ch${fwChannel} ${action}`);
};

export const omniapiDeleteNode = (nodeMac: string) => {
  const client = getMQTTClient();
  const payload = JSON.stringify({ mac: nodeMac });
  const topic = 'omniapi/gateway/cmd/delete-node';
  client.publish(topic, payload, (err) => {
    if (err) {
      console.error(`❌ MQTT delete-node publish error:`, err);
    } else {
      console.log(`🗑️ MQTT delete-node sent: ${nodeMac}`);
    }
  });
};
