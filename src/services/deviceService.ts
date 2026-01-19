/**
 * Device Service - Unified Device Management
 * Single service for ALL device types (Relay, LED, Sensor, Dimmer, Tasmota)
 */

import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import {
  Device,
  DbDevice,
  DeviceCommand,
  DeviceState,
  RelayState,
  LedState,
  CommandParams
} from '../types/device';
import {
  DeviceType,
  DeviceCategory,
  DEVICE_REGISTRY,
  getDeviceCategory,
  getDeviceConfig,
  isLedDevice as isLedDeviceType
} from '../config/deviceTypes';
import {
  getAllNodes,
  getNode,
  getAllLedDevices,
  getLedState,
  OmniapiNode,
  LedDevice
} from './omniapiState';
import { getMQTTClient } from '../config/mqtt';

// ============================================
// MQTT TOPICS
// ============================================

const MQTT_NODE_COMMAND = 'omniapi/node/command';
const MQTT_LED_COMMAND = 'omniapi/led/command';

// ============================================
// HELPER: Send LED MQTT Command
// ============================================

const sendLedMqttCommand = (payload: {
  mac: string;
  action: string;
  r?: number;
  g?: number;
  b?: number;
  value?: number;
  effect?: number;
  speed?: number;
}) => {
  const mqttClient = getMQTTClient();
  mqttClient.publish(MQTT_LED_COMMAND, JSON.stringify(payload));
  console.log('📤 LED command sent:', payload);
};

// ============================================
// CONVERTERS: Memory State → Unified Device
// ============================================

/**
 * Convert in-memory OmniapiNode to unified Device format
 */
const nodeToDevice = (node: OmniapiNode): Device => {
  const deviceType = 'omniapi_node' as DeviceType;
  const config = getDeviceConfig(deviceType);

  return {
    mac: node.mac,
    deviceType,
    firmwareId: config?.firmwareId ?? null,
    category: 'relay',
    name: `Node ${node.mac.slice(-5)}`,
    icon: config?.icon || 'zap',
    registered: false,
    blocked: false,
    state: {
      online: node.online,
      lastSeen: node.lastSeen.toISOString(),
      rssi: node.rssi,
      firmwareVersion: node.version,
      channels: [node.relay1, node.relay2]
    } as RelayState,
    capabilities: config?.capabilities ? [...config.capabilities] : [],
    commands: config?.commands ? [...config.commands] : []
  };
};

/**
 * Convert in-memory LedDevice to unified Device format
 */
const ledToDevice = (led: LedDevice): Device => {
  const deviceType = 'omniapi_led' as DeviceType;
  const config = getDeviceConfig(deviceType);

  return {
    mac: led.mac,
    deviceType,
    firmwareId: config?.firmwareId ?? null,
    category: 'led',
    name: `LED ${led.mac.slice(-5)}`,
    icon: config?.icon || 'lightbulb',
    registered: false,
    blocked: false,
    state: {
      online: led.online,
      lastSeen: led.lastSeen.toISOString(),
      power: led.power,
      r: led.r,
      g: led.g,
      b: led.b,
      brightness: led.brightness,
      effect: led.effect
    } as LedState,
    capabilities: config?.capabilities ? [...config.capabilities] : [],
    commands: config?.commands ? [...config.commands] : []
  };
};

/**
 * Convert DB device to unified Device format
 */
const dbDeviceToDevice = (dbDevice: DbDevice): Device => {
  const deviceType = dbDevice.device_type as DeviceType;
  const config = getDeviceConfig(deviceType);
  const category = getDeviceCategory(deviceType);

  // Get live state from memory if available
  let state: DeviceState;

  if (category === 'relay' && dbDevice.mac_address) {
    const node = getNode(dbDevice.mac_address);
    if (node) {
      state = {
        online: node.online,
        lastSeen: node.lastSeen.toISOString(),
        rssi: node.rssi,
        firmwareVersion: node.version,
        channels: [node.relay1, node.relay2]
      } as RelayState;
    } else {
      state = {
        online: dbDevice.stato === 'online',
        lastSeen: dbDevice.aggiornato_il,
        channels: [dbDevice.power_state, false]
      } as RelayState;
    }
  } else if (category === 'led' && dbDevice.mac_address) {
    const led = getLedState(dbDevice.mac_address);
    if (led) {
      state = {
        online: led.online,
        lastSeen: led.lastSeen.toISOString(),
        power: led.power,
        r: led.r,
        g: led.g,
        b: led.b,
        brightness: led.brightness,
        effect: led.effect
      } as LedState;
    } else {
      state = {
        online: dbDevice.stato === 'online',
        lastSeen: dbDevice.aggiornato_il,
        power: dbDevice.power_state,
        r: 0,
        g: 255,
        b: 0,
        brightness: 128,
        effect: 0
      } as LedState;
    }
  } else {
    // Generic state for other types
    state = {
      online: dbDevice.stato === 'online',
      lastSeen: dbDevice.aggiornato_il
    } as RelayState;
  }

  return {
    id: dbDevice.id,
    mac: dbDevice.mac_address || '',
    deviceType,
    firmwareId: config?.firmwareId ?? null,
    category: (category as DeviceCategory) || 'relay',
    name: dbDevice.nome,
    icon: config?.icon || 'cpu',
    impiantoId: dbDevice.impianto_id,
    stanzaId: dbDevice.stanza_id,
    registered: true,
    blocked: dbDevice.bloccato,
    state,
    capabilities: config?.capabilities ? [...config.capabilities] : [],
    commands: config?.commands ? [...config.commands] : [],
    createdAt: dbDevice.creato_il,
    updatedAt: dbDevice.aggiornato_il
  };
};

// ============================================
// SERVICE METHODS
// ============================================

/**
 * Get all registered devices for an impianto
 */
export const getAllDevices = async (impiantoId: number): Promise<Device[]> => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT d.*, s.nome as stanza_nome
     FROM dispositivi d
     LEFT JOIN stanze s ON d.stanza_id = s.id
     WHERE d.impianto_id = ?
     ORDER BY d.creato_il DESC`,
    [impiantoId]
  );

  return rows.map((row: RowDataPacket) => {
    const device = dbDeviceToDevice(row as DbDevice);
    device.stanzaNome = row.stanza_nome;
    return device;
  });
};

/**
 * Get available (not registered) devices from in-memory state
 */
export const getAvailableDevices = async (impiantoId: number): Promise<Device[]> => {
  // Get registered MACs for this impianto
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT mac_address FROM dispositivi WHERE impianto_id = ? AND mac_address IS NOT NULL',
    [impiantoId]
  );
  const registeredMacs = new Set(rows.map((r: RowDataPacket) => r.mac_address));

  const available: Device[] = [];

  // Check relay nodes
  getAllNodes().forEach(node => {
    if (!registeredMacs.has(node.mac)) {
      available.push(nodeToDevice(node));
    }
  });

  // Check LED devices
  getAllLedDevices().forEach(led => {
    if (!registeredMacs.has(led.mac)) {
      available.push(ledToDevice(led));
    }
  });

  return available;
};

/**
 * Get device by ID
 */
export const getDeviceById = async (id: number): Promise<Device | null> => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT d.*, s.nome as stanza_nome
     FROM dispositivi d
     LEFT JOIN stanze s ON d.stanza_id = s.id
     WHERE d.id = ?`,
    [id]
  );

  if (rows.length === 0) return null;

  const device = dbDeviceToDevice(rows[0] as DbDevice);
  device.stanzaNome = rows[0].stanza_nome;
  return device;
};

/**
 * Get device by MAC address
 */
export const getDeviceByMac = async (mac: string, impiantoId?: number): Promise<Device | null> => {
  // First check DB
  let query = `SELECT d.*, s.nome as stanza_nome
               FROM dispositivi d
               LEFT JOIN stanze s ON d.stanza_id = s.id
               WHERE d.mac_address = ?`;
  const params: (string | number)[] = [mac];

  if (impiantoId) {
    query += ' AND d.impianto_id = ?';
    params.push(impiantoId);
  }

  const [rows] = await pool.query<RowDataPacket[]>(query, params);

  if (rows.length > 0) {
    const device = dbDeviceToDevice(rows[0] as DbDevice);
    device.stanzaNome = rows[0].stanza_nome;
    return device;
  }

  // Check in-memory state
  const node = getNode(mac);
  if (node) return nodeToDevice(node);

  const led = getLedState(mac);
  if (led) return ledToDevice(led);

  return null;
};

/**
 * Register a new device
 */
export const registerDevice = async (
  impiantoId: number,
  mac: string,
  name: string,
  stanzaId?: number | null,
  deviceType?: string
): Promise<Device> => {
  // Detect device type from in-memory state if not provided
  let finalDeviceType = deviceType;
  if (!finalDeviceType) {
    const node = getNode(mac);
    if (node) {
      finalDeviceType = 'omniapi_node';
    } else {
      const led = getLedState(mac);
      if (led) {
        finalDeviceType = 'omniapi_led';
      } else {
        finalDeviceType = 'omniapi_node'; // Default
      }
    }
  }
  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO dispositivi (impianto_id, mac_address, nome, device_type, stanza_id, stato, power_state, bloccato)
     VALUES (?, ?, ?, ?, ?, 'unknown', false, false)`,
    [impiantoId, mac, name, finalDeviceType, stanzaId || null]
  );

  const device = await getDeviceById(result.insertId);
  if (!device) {
    throw new Error('Failed to retrieve registered device');
  }

  return device;
};

/**
 * Unregister (delete) a device
 */
export const unregisterDevice = async (id: number): Promise<boolean> => {
  const [result] = await pool.query<ResultSetHeader>(
    'DELETE FROM dispositivi WHERE id = ?',
    [id]
  );

  return result.affectedRows > 0;
};

/**
 * Update a device
 * Supports both new API (name, stanzaId) and legacy API (nome, stanza_id)
 */
export const updateDevice = async (
  id: number,
  data: { name?: string; nome?: string; stanzaId?: number | null; stanza_id?: number | null; blocked?: boolean }
): Promise<Device | null> => {
  const updates: string[] = [];
  const values: (string | number | boolean | null)[] = [];

  // Support both camelCase and snake_case
  const name = data.name ?? data.nome;
  const stanzaId = data.stanzaId ?? data.stanza_id;

  if (name !== undefined) {
    updates.push('nome = ?');
    values.push(name);
  }
  if (stanzaId !== undefined) {
    updates.push('stanza_id = ?');
    values.push(stanzaId);
  }
  if (data.blocked !== undefined) {
    updates.push('bloccato = ?');
    values.push(data.blocked);
  }

  if (updates.length === 0) {
    return getDeviceById(id);
  }

  updates.push('aggiornato_il = NOW()');
  values.push(id);

  await pool.query<ResultSetHeader>(
    `UPDATE dispositivi SET ${updates.join(', ')} WHERE id = ?`,
    values
  );

  return getDeviceById(id);
};

/**
 * Send command to a device by ID
 */
export const sendCommandById = async (
  id: number,
  command: DeviceCommand
): Promise<{ success: boolean; message: string }> => {
  const device = await getDeviceById(id);

  if (!device) {
    return { success: false, message: 'Device not found' };
  }

  // Update command with actual MAC
  command.mac = device.mac;

  return sendCommand(device.mac, command);
};

/**
 * Send command to a device by MAC
 */
export const sendCommand = async (
  mac: string,
  command: DeviceCommand
): Promise<{ success: boolean; message: string }> => {
  const device = await getDeviceByMac(mac);

  if (!device) {
    return { success: false, message: 'Device not found' };
  }

  if (device.blocked) {
    return { success: false, message: 'Device is blocked' };
  }

  const mqttClient = getMQTTClient();
  const { action, params } = command;

  // Route command based on device category
  switch (device.category) {
    case 'relay':
      return sendRelayCommand(mac, action, params);

    case 'led':
      return sendLedCommand(mac, action, params);

    default:
      return { success: false, message: `Unsupported device category: ${device.category}` };
  }
};

/**
 * Send command to relay device
 */
const sendRelayCommand = (
  mac: string,
  action: string,
  params?: CommandParams
): { success: boolean; message: string } => {
  const mqttClient = getMQTTClient();
  const channel = params?.channel ?? 1;

  let payload: any = { mac };

  switch (action) {
    case 'on':
      payload.action = 'relay';
      payload.channel = channel;
      payload.state = 1;
      break;
    case 'off':
      payload.action = 'relay';
      payload.channel = channel;
      payload.state = 0;
      break;
    case 'toggle':
      payload.action = 'toggle';
      payload.channel = channel;
      break;
    default:
      return { success: false, message: `Unknown relay action: ${action}` };
  }

  mqttClient.publish(MQTT_NODE_COMMAND, JSON.stringify(payload));
  console.log('📤 Relay command sent:', payload);

  return { success: true, message: `Command ${action} sent to relay ${mac}` };
};

/**
 * Send command to LED device
 */
const sendLedCommand = (
  mac: string,
  action: string,
  params?: CommandParams
): { success: boolean; message: string } => {
  let payload: any = { mac, action };

  switch (action) {
    case 'on':
    case 'off':
      break;

    case 'color':
    case 'set_color':
      if (params?.r === undefined || params?.g === undefined || params?.b === undefined) {
        return { success: false, message: 'r, g, b required for color command' };
      }
      payload.action = 'set_color';
      payload.r = params.r;
      payload.g = params.g;
      payload.b = params.b;
      break;

    case 'brightness':
    case 'set_brightness':
      if (params?.brightness === undefined) {
        return { success: false, message: 'brightness required' };
      }
      payload.action = 'set_brightness';
      payload.value = params.brightness;
      break;

    case 'effect':
    case 'set_effect':
      if (params?.effect === undefined) {
        return { success: false, message: 'effect required' };
      }
      payload.action = 'set_effect';
      payload.effect = params.effect;
      break;

    case 'speed':
    case 'set_speed':
      if (params?.speed === undefined) {
        return { success: false, message: 'speed required' };
      }
      payload.action = 'set_speed';
      payload.speed = params.speed;
      break;

    default:
      return { success: false, message: `Unknown LED action: ${action}` };
  }

  sendLedMqttCommand(payload);
  return { success: true, message: `Command ${action} sent to LED ${mac}` };
};

/**
 * Test device connection
 */
export const testDevice = async (mac: string): Promise<{ success: boolean; message: string }> => {
  const device = await getDeviceByMac(mac);

  if (!device) {
    return { success: false, message: 'Device not found' };
  }

  // Send a ping/test command based on device type
  const mqttClient = getMQTTClient();

  if (device.category === 'relay') {
    mqttClient.publish(MQTT_NODE_COMMAND, JSON.stringify({
      mac,
      action: 'ping'
    }));
  } else if (device.category === 'led') {
    sendLedMqttCommand({ mac, action: 'ping' });
  }

  return { success: true, message: `Test command sent to ${mac}` };
};

/**
 * Get device count by category for an impianto
 */
export const getDeviceCount = async (impiantoId: number): Promise<{
  total: number;
  byCategory: Record<string, number>;
}> => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT device_type, COUNT(*) as count
     FROM dispositivi
     WHERE impianto_id = ?
     GROUP BY device_type`,
    [impiantoId]
  );

  const byCategory: Record<string, number> = {};
  let total = 0;

  rows.forEach((row: RowDataPacket) => {
    const category = getDeviceCategory(row.device_type) || 'unknown';
    byCategory[category] = (byCategory[category] || 0) + row.count;
    total += row.count;
  });

  return { total, byCategory };
};

/**
 * Get devices by room
 */
export const getDevicesByRoom = async (stanzaId: number): Promise<Device[]> => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT d.*, s.nome as stanza_nome
     FROM dispositivi d
     LEFT JOIN stanze s ON d.stanza_id = s.id
     WHERE d.stanza_id = ?
     ORDER BY d.nome`,
    [stanzaId]
  );

  return rows.map((row: RowDataPacket) => {
    const device = dbDeviceToDevice(row as DbDevice);
    device.stanzaNome = row.stanza_nome;
    return device;
  });
};
