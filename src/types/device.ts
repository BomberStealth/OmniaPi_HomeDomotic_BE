/**
 * Device Types - Unified Type Definitions
 * Tipi TypeScript per dispositivi unificati
 */

import { DeviceType, DeviceCategory } from '../config/deviceTypes';

// ============================================
// STATE INTERFACES
// ============================================

/**
 * Stato base condiviso da tutti i dispositivi
 */
export interface BaseDeviceState {
  online: boolean;
  lastSeen: string;
  rssi?: number;
  firmwareVersion?: string;
}

/**
 * Stato per dispositivi Relay (interruttori)
 */
export interface RelayState extends BaseDeviceState {
  channels: boolean[];  // [ch1, ch2, ...] true=ON
}

/**
 * Stato per dispositivi LED Strip
 */
export interface LedState extends BaseDeviceState {
  power: boolean;
  r: number;
  g: number;
  b: number;
  w?: number;          // Per RGBW
  brightness: number;  // 0-255
  effect: number;      // 0-5
  speed?: number;      // 0-255
}

/**
 * Stato per sensori
 */
export interface SensorState extends BaseDeviceState {
  temperature?: number;
  humidity?: number;
  motion?: boolean;
}

/**
 * Stato per dimmer
 */
export interface DimmerState extends BaseDeviceState {
  power: boolean;
  brightness: number;  // 0-100
}

/**
 * Stato per Tasmota
 */
export interface TasmotaState extends BaseDeviceState {
  power: boolean;
  powerMeter?: {
    voltage?: number;
    current?: number;
    power?: number;
    energy?: number;
  };
}

/**
 * Union type per tutti gli stati possibili
 */
export type DeviceState = RelayState | LedState | SensorState | DimmerState | TasmotaState;

// ============================================
// DEVICE INTERFACES
// ============================================

/**
 * Device unificato - rappresentazione completa di qualsiasi dispositivo
 */
export interface Device {
  // Identificazione
  id?: number;              // ID database (se registrato)
  mac: string;              // MAC address (sempre presente)

  // Tipo
  deviceType: DeviceType;
  firmwareId: number | null;
  category: DeviceCategory;

  // Info
  name: string;
  icon: string;

  // Relazioni
  impiantoId?: number;
  stanzaId?: number | null;
  stanzaNome?: string | null;

  // Stato
  registered: boolean;      // true = nel DB, false = solo in memory
  blocked: boolean;         // true = dispositivo bloccato
  state: DeviceState;

  // Capabilities (dal registry)
  capabilities: string[];
  commands: string[];

  // Timestamps
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Device dal database (formato raw)
 */
export interface DbDevice {
  id: number;
  impianto_id: number;
  stanza_id: number | null;
  nome: string;
  mac_address: string | null;
  topic_mqtt: string | null;
  device_type: string;
  stato: 'online' | 'offline' | 'unknown';
  power_state: boolean;
  bloccato: boolean;
  omniapi_info: string | null;  // JSON string
  creato_il: string;
  aggiornato_il: string;
}

// ============================================
// COMMAND INTERFACES
// ============================================

/**
 * Comando da inviare a un dispositivo
 */
export interface DeviceCommand {
  mac: string;
  action: string;
  params?: CommandParams;
}

/**
 * Parametri del comando
 */
export interface CommandParams {
  channel?: number;
  value?: number;
  r?: number;
  g?: number;
  b?: number;
  w?: number;
  brightness?: number;
  effect?: number;
  speed?: number;
}

/**
 * Comando unificato (formato API)
 */
export interface UnifiedCommand {
  action: string;
  params?: CommandParams;
}

// ============================================
// API RESPONSE INTERFACES
// ============================================

/**
 * Response standard per operazioni dispositivo
 */
export interface DeviceResponse {
  success: boolean;
  device?: Device;
  devices?: Device[];
  message?: string;
  error?: string;
}

/**
 * Response per lista dispositivi
 */
export interface DevicesListResponse {
  success: boolean;
  devices: Device[];
  count: number;
}

/**
 * Response per dispositivi disponibili (non registrati)
 */
export interface AvailableDevicesResponse {
  success: boolean;
  devices: Device[];
  count: number;
}

// ============================================
// LEGACY COMPATIBILITY
// ============================================

/**
 * OmniapiNode legacy - per retrocompatibilità
 * @deprecated Usare Device invece
 */
export interface OmniapiNodeLegacy {
  mac: string;
  online: boolean;
  rssi: number;
  version: string;
  relay1: boolean;
  relay2: boolean;
  lastSeen: Date;
}

/**
 * LedDevice legacy - per retrocompatibilità
 * @deprecated Usare Device invece
 */
export interface LedDeviceLegacy {
  mac: string;
  power: boolean;
  r: number;
  g: number;
  b: number;
  brightness: number;
  effect: number;
  online: boolean;
  lastSeen: Date;
}

// ============================================
// HELPER TYPE GUARDS
// ============================================

/**
 * Type guard per RelayState
 */
export function isRelayState(state: DeviceState): state is RelayState {
  return 'channels' in state && Array.isArray((state as RelayState).channels);
}

/**
 * Type guard per LedState
 */
export function isLedState(state: DeviceState): state is LedState {
  return 'r' in state && 'g' in state && 'b' in state && 'brightness' in state;
}

/**
 * Type guard per SensorState
 */
export function isSensorState(state: DeviceState): state is SensorState {
  return 'temperature' in state || 'humidity' in state || 'motion' in state;
}

/**
 * Type guard per DimmerState
 */
export function isDimmerState(state: DeviceState): state is DimmerState {
  return 'power' in state && 'brightness' in state && !('r' in state);
}

/**
 * Type guard per TasmotaState
 */
export function isTasmotaState(state: DeviceState): state is TasmotaState {
  return 'power' in state && !('channels' in state) && !('r' in state) && !('brightness' in state);
}
