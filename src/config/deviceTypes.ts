/**
 * Device Type Registry - Single Source of Truth
 * Mappa tra firmware deviceType (hex) e configurazione sistema
 */

// Firmware IDs (quello che arriva via ESP-NOW)
export const FIRMWARE_IDS = {
  RELAY_2CH: 0x01,
  RELAY_4CH: 0x02,
  LED_STRIP_RGB: 0x10,
  LED_STRIP_RGBW: 0x11,
  SENSOR_TEMP_HUM: 0x20,
  SENSOR_MOTION: 0x21,
  DIMMER: 0x30,
} as const;

// Mapping firmware ID → device type string (per DB)
export const DEVICE_TYPE_MAP: Record<number, string> = {
  [FIRMWARE_IDS.RELAY_2CH]: 'omniapi_relay_2ch',
  [FIRMWARE_IDS.RELAY_4CH]: 'omniapi_relay_4ch',
  [FIRMWARE_IDS.LED_STRIP_RGB]: 'omniapi_led_rgb',
  [FIRMWARE_IDS.LED_STRIP_RGBW]: 'omniapi_led_rgbw',
  [FIRMWARE_IDS.SENSOR_TEMP_HUM]: 'omniapi_sensor_th',
  [FIRMWARE_IDS.SENSOR_MOTION]: 'omniapi_sensor_motion',
  [FIRMWARE_IDS.DIMMER]: 'omniapi_dimmer',
};

// Device Registry completo
export const DEVICE_REGISTRY = {
  omniapi_relay_2ch: {
    firmwareId: 0x01,
    name: 'Relay 2 Canali',
    icon: 'zap',
    category: 'relay',
    capabilities: ['relay'],
    channels: 2,
    commands: ['on', 'off', 'toggle'],
  },
  omniapi_relay_4ch: {
    firmwareId: 0x02,
    name: 'Relay 4 Canali',
    icon: 'zap',
    category: 'relay',
    capabilities: ['relay'],
    channels: 4,
    commands: ['on', 'off', 'toggle'],
  },
  omniapi_led_rgb: {
    firmwareId: 0x10,
    name: 'LED Strip RGB',
    icon: 'lightbulb',
    category: 'led',
    capabilities: ['power', 'color', 'brightness', 'effect'],
    commands: ['on', 'off', 'color', 'brightness', 'effect'],
    effects: ['static', 'rainbow', 'breathing', 'chase', 'sparkle', 'fire'],
  },
  omniapi_led_rgbw: {
    firmwareId: 0x11,
    name: 'LED Strip RGBW',
    icon: 'lightbulb',
    category: 'led',
    capabilities: ['power', 'color', 'brightness', 'effect', 'white'],
    commands: ['on', 'off', 'color', 'brightness', 'effect', 'white'],
    effects: ['static', 'rainbow', 'breathing', 'chase', 'sparkle', 'fire'],
  },
  omniapi_sensor_th: {
    firmwareId: 0x20,
    name: 'Sensore Temp/Umidità',
    icon: 'thermometer',
    category: 'sensor',
    capabilities: ['temperature', 'humidity'],
    commands: [],
    readOnly: true,
  },
  omniapi_sensor_motion: {
    firmwareId: 0x21,
    name: 'Sensore Movimento',
    icon: 'activity',
    category: 'sensor',
    capabilities: ['motion'],
    commands: [],
    readOnly: true,
  },
  omniapi_dimmer: {
    firmwareId: 0x30,
    name: 'Dimmer',
    icon: 'sun',
    category: 'dimmer',
    capabilities: ['dimmer'],
    channels: 1,
    commands: ['on', 'off', 'brightness'],
  },
  // Legacy types per retrocompatibilità
  omniapi_node: {
    firmwareId: 0x01,
    name: 'OmniaPi Node',
    icon: 'zap',
    category: 'relay',
    capabilities: ['relay'],
    channels: 2,
    commands: ['on', 'off', 'toggle'],
    legacy: true,
  },
  omniapi_led: {
    firmwareId: 0x10,
    name: 'OmniaPi LED',
    icon: 'lightbulb',
    category: 'led',
    capabilities: ['power', 'color', 'brightness', 'effect'],
    commands: ['on', 'off', 'color', 'brightness', 'effect'],
    effects: ['static', 'rainbow', 'breathing', 'chase', 'sparkle', 'fire'],
    legacy: true,
  },
  tasmota: {
    firmwareId: null,
    name: 'Tasmota',
    icon: 'plug',
    category: 'tasmota',
    capabilities: ['relay', 'power_meter'],
    commands: ['on', 'off', 'toggle'],
  },
} as const;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Ottieni device type string dal firmware ID
 */
export function getDeviceTypeFromFirmwareId(firmwareId: number): string | null {
  return DEVICE_TYPE_MAP[firmwareId] || null;
}

/**
 * Ottieni la configurazione completa di un device type
 */
export function getDeviceConfig(deviceType: string) {
  return DEVICE_REGISTRY[deviceType as keyof typeof DEVICE_REGISTRY] || null;
}

/**
 * Ottieni le capabilities di un device type
 */
export function getCapabilities(deviceType: string): string[] {
  const config = getDeviceConfig(deviceType);
  return config?.capabilities ? [...config.capabilities] : [];
}

/**
 * Verifica se un device type ha una certa capability
 */
export function hasCapability(deviceType: string, capability: string): boolean {
  return getCapabilities(deviceType).includes(capability);
}

/**
 * Ottieni la categoria di un device type
 */
export function getDeviceCategory(deviceType: string): string | null {
  return getDeviceConfig(deviceType)?.category || null;
}

/**
 * Verifica se un device type è read-only (sensori)
 */
export function isReadOnly(deviceType: string): boolean {
  const config = getDeviceConfig(deviceType);
  return (config as any)?.readOnly || false;
}

/**
 * Verifica se un device type è di tipo LED
 */
export function isLedDevice(deviceType: string): boolean {
  return getDeviceCategory(deviceType) === 'led';
}

/**
 * Verifica se un device type è di tipo Relay
 */
export function isRelayDevice(deviceType: string): boolean {
  return getDeviceCategory(deviceType) === 'relay';
}

/**
 * Ottieni il numero di canali per un device type
 */
export function getChannelCount(deviceType: string): number {
  const config = getDeviceConfig(deviceType);
  return (config as any)?.channels || 1;
}

/**
 * Verifica se un firmware ID corrisponde a un LED
 */
export function isLedFirmwareId(firmwareId: number): boolean {
  return firmwareId === FIRMWARE_IDS.LED_STRIP_RGB ||
         firmwareId === FIRMWARE_IDS.LED_STRIP_RGBW;
}

/**
 * Verifica se un firmware ID corrisponde a un Relay
 */
export function isRelayFirmwareId(firmwareId: number): boolean {
  return firmwareId === FIRMWARE_IDS.RELAY_2CH ||
         firmwareId === FIRMWARE_IDS.RELAY_4CH;
}

// ============================================
// TYPE EXPORTS
// ============================================

export type FirmwareId = typeof FIRMWARE_IDS[keyof typeof FIRMWARE_IDS];
export type DeviceType = keyof typeof DEVICE_REGISTRY;
export type DeviceCategory = 'relay' | 'led' | 'sensor' | 'dimmer' | 'tasmota';
