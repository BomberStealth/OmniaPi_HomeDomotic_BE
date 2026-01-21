import { query } from '../config/database';
import logger from '../config/logger';

// ============================================
// SMART HOME SERVICE
// Integrazione Google Home e Alexa
// ============================================

// Google Smart Home device types
export type GoogleDeviceType =
  | 'action.devices.types.LIGHT'
  | 'action.devices.types.SWITCH'
  | 'action.devices.types.OUTLET'
  | 'action.devices.types.THERMOSTAT'
  | 'action.devices.types.SENSOR'
  | 'action.devices.types.SCENE';

// Google Smart Home traits
export type GoogleTrait =
  | 'action.devices.traits.OnOff'
  | 'action.devices.traits.Brightness'
  | 'action.devices.traits.ColorSetting'
  | 'action.devices.traits.Scene'
  | 'action.devices.traits.TemperatureSetting'
  | 'action.devices.traits.SensorState';

// Alexa device types
export type AlexaDeviceType =
  | 'LIGHT'
  | 'SWITCH'
  | 'SMARTPLUG'
  | 'THERMOSTAT'
  | 'TEMPERATURE_SENSOR'
  | 'SCENE_TRIGGER';

interface SmartHomeDevice {
  id: string;
  type: string;
  traits: string[];
  name: {
    name: string;
    nicknames?: string[];
    defaultNames?: string[];
  };
  willReportState: boolean;
  roomHint?: string;
  deviceInfo?: {
    manufacturer: string;
    model: string;
    hwVersion: string;
    swVersion: string;
  };
  attributes?: Record<string, any>;
}

/**
 * Mappa tipo dispositivo a Google device type
 */
const mapToGoogleType = (tipoDispositivo: string): GoogleDeviceType => {
  const mapping: Record<string, GoogleDeviceType> = {
    'switch': 'action.devices.types.SWITCH',
    'light': 'action.devices.types.LIGHT',
    'dimmer': 'action.devices.types.LIGHT',
    'outlet': 'action.devices.types.OUTLET',
    'thermostat': 'action.devices.types.THERMOSTAT',
    'sensor': 'action.devices.types.SENSOR',
    'dht22': 'action.devices.types.SENSOR',
    'scene': 'action.devices.types.SCENE',
  };
  return mapping[tipoDispositivo] || 'action.devices.types.SWITCH';
};

/**
 * Mappa tipo dispositivo a Alexa type
 */
const mapToAlexaType = (tipoDispositivo: string): AlexaDeviceType => {
  const mapping: Record<string, AlexaDeviceType> = {
    'switch': 'SWITCH',
    'light': 'LIGHT',
    'dimmer': 'LIGHT',
    'outlet': 'SMARTPLUG',
    'thermostat': 'THERMOSTAT',
    'sensor': 'TEMPERATURE_SENSOR',
    'dht22': 'TEMPERATURE_SENSOR',
    'scene': 'SCENE_TRIGGER',
  };
  return mapping[tipoDispositivo] || 'SWITCH';
};

/**
 * Ottieni traits per tipo dispositivo
 */
const getTraits = (tipoDispositivo: string): GoogleTrait[] => {
  const traits: GoogleTrait[] = [];

  switch (tipoDispositivo) {
    case 'light':
    case 'switch':
    case 'outlet':
      traits.push('action.devices.traits.OnOff');
      break;
    case 'dimmer':
      traits.push('action.devices.traits.OnOff', 'action.devices.traits.Brightness');
      break;
    case 'thermostat':
      traits.push('action.devices.traits.TemperatureSetting');
      break;
    case 'sensor':
    case 'dht22':
      traits.push('action.devices.traits.SensorState');
      break;
    case 'scene':
      traits.push('action.devices.traits.Scene');
      break;
  }

  return traits;
};

/**
 * Ottieni dispositivi in formato Google Smart Home
 */
export const getGoogleDevices = async (userId: number): Promise<SmartHomeDevice[]> => {
  try {
    const [dispositivi]: any = await query(
      `SELECT d.*, s.nome as stanza_nome, i.nome as impianto_nome
       FROM dispositivi d
       JOIN impianti i ON d.impianto_id = i.id
       LEFT JOIN stanze s ON d.stanza_id = s.id
       LEFT JOIN condivisioni_impianto c ON i.id = c.impianto_id AND c.stato = 'accettato'
       WHERE (i.utente_id = ? OR c.utente_id = ?) AND d.stato = 'online'`,
      [userId, userId]
    );

    const devices: SmartHomeDevice[] = dispositivi.map((d: any) => ({
      id: `omnia-${d.id}`,
      type: mapToGoogleType(d.tipo_dispositivo || 'switch'),
      traits: getTraits(d.tipo_dispositivo || 'switch'),
      name: {
        name: d.nome,
        nicknames: [d.nome],
        defaultNames: [d.nome]
      },
      willReportState: true,
      roomHint: d.stanza_nome || undefined,
      deviceInfo: {
        manufacturer: 'OmniaPi',
        model: d.tipo_dispositivo || 'Tasmota Switch',
        hwVersion: '1.0',
        swVersion: '1.0'
      }
    }));

    // Aggiungi anche le scene
    const [scene]: any = await query(
      `SELECT sc.*, i.nome as impianto_nome
       FROM scene sc
       JOIN impianti i ON sc.impianto_id = i.id
       LEFT JOIN condivisioni_impianto c ON i.id = c.impianto_id AND c.stato = 'accettato'
       WHERE (i.utente_id = ? OR c.utente_id = ?)`,
      [userId, userId]
    );

    for (const s of scene) {
      devices.push({
        id: `omnia-scene-${s.id}`,
        type: 'action.devices.types.SCENE',
        traits: ['action.devices.traits.Scene'],
        name: {
          name: s.nome,
          nicknames: [s.nome],
          defaultNames: [s.nome]
        },
        willReportState: false,
        attributes: {
          sceneReversible: false
        }
      });
    }

    return devices;
  } catch (error) {
    logger.error('Errore get Google devices:', error);
    return [];
  }
};

/**
 * Esegui comando Google Smart Home
 */
export const executeGoogleCommand = async (
  userId: number,
  deviceId: string,
  command: string,
  params: Record<string, any>
): Promise<{ success: boolean; states?: Record<string, any> }> => {
  try {
    // Parse device ID: omnia-123 or omnia-scene-123
    const isScene = deviceId.startsWith('omnia-scene-');
    const id = parseInt(deviceId.replace('omnia-scene-', '').replace('omnia-', ''));

    if (isScene) {
      // Esegui scena
      const [scene]: any = await query(
        `SELECT sc.* FROM scene sc
         JOIN impianti i ON sc.impianto_id = i.id
         LEFT JOIN condivisioni_impianto c ON i.id = c.impianto_id AND c.stato = 'accettato'
         WHERE sc.id = ? AND (i.utente_id = ? OR c.utente_id = ?)`,
        [id, userId, userId]
      );

      if (scene.length === 0) {
        return { success: false };
      }

      const azioni = JSON.parse(scene[0].azioni || '[]');
      const { getMQTTClient } = require('../config/mqtt');
      const mqttClient = getMQTTClient();

      for (const azione of azioni) {
        if (azione.topic) {
          const topic = `cmnd/${azione.topic}/POWER`;
          const payload = azione.stato === 'ON' ? 'ON' : 'OFF';
          mqttClient.publish(topic, payload);
        }
      }

      return { success: true };
    }

    // Comando dispositivo
    const [dispositivi]: any = await query(
      `SELECT d.* FROM dispositivi d
       JOIN impianti i ON d.impianto_id = i.id
       LEFT JOIN condivisioni_impianto c ON i.id = c.impianto_id AND c.stato = 'accettato'
       WHERE d.id = ? AND (i.utente_id = ? OR c.utente_id = ?)`,
      [id, userId, userId]
    );

    if (dispositivi.length === 0) {
      return { success: false };
    }

    const device = dispositivi[0];

    // Gestisci comandi
    if (command === 'action.devices.commands.OnOff') {
      const { on } = params;
      const { getMQTTClient } = require('../config/mqtt');
      const mqttClient = getMQTTClient();

      const topic = `cmnd/${device.topic_mqtt}/POWER`;
      const payload = on ? 'ON' : 'OFF';
      mqttClient.publish(topic, payload);

      // Aggiorna DB
      await query('UPDATE dispositivi SET power_state = ? WHERE id = ?', [on, id]);

      return {
        success: true,
        states: { on }
      };
    }

    return { success: false };
  } catch (error) {
    logger.error('Errore execute Google command:', error);
    return { success: false };
  }
};

/**
 * Ottieni stato dispositivi per Google
 */
export const getGoogleDeviceStates = async (
  userId: number,
  deviceIds: string[]
): Promise<Record<string, any>> => {
  const states: Record<string, any> = {};

  try {
    for (const deviceId of deviceIds) {
      const isScene = deviceId.startsWith('omnia-scene-');
      const id = parseInt(deviceId.replace('omnia-scene-', '').replace('omnia-', ''));

      if (isScene) {
        states[deviceId] = { online: true };
        continue;
      }

      const [dispositivi]: any = await query(
        `SELECT d.* FROM dispositivi d
         JOIN impianti i ON d.impianto_id = i.id
         LEFT JOIN condivisioni_impianto c ON i.id = c.impianto_id AND c.stato = 'accettato'
         WHERE d.id = ? AND (i.utente_id = ? OR c.utente_id = ?)`,
        [id, userId, userId]
      );

      if (dispositivi.length > 0) {
        const device = dispositivi[0];
        states[deviceId] = {
          online: device.stato === 'online',
          on: device.power_state === 1 || device.power_state === true
        };
      } else {
        states[deviceId] = { online: false };
      }
    }
  } catch (error) {
    logger.error('Errore get device states:', error);
  }

  return states;
};

/**
 * Ottieni dispositivi in formato Alexa
 */
export const getAlexaDevices = async (userId: number): Promise<any[]> => {
  try {
    const [dispositivi]: any = await query(
      `SELECT d.*, s.nome as stanza_nome
       FROM dispositivi d
       JOIN impianti i ON d.impianto_id = i.id
       LEFT JOIN stanze s ON d.stanza_id = s.id
       LEFT JOIN condivisioni_impianto c ON i.id = c.impianto_id AND c.stato = 'accettato'
       WHERE (i.utente_id = ? OR c.utente_id = ?) AND d.stato = 'online'`,
      [userId, userId]
    );

    return dispositivi.map((d: any) => ({
      endpointId: `omnia-${d.id}`,
      manufacturerName: 'OmniaPi',
      friendlyName: d.nome,
      description: `OmniaPi ${d.tipo_dispositivo || 'Switch'}`,
      displayCategories: [mapToAlexaType(d.tipo_dispositivo || 'switch')],
      capabilities: [
        {
          type: 'AlexaInterface',
          interface: 'Alexa.PowerController',
          version: '3',
          properties: {
            supported: [{ name: 'powerState' }],
            proactivelyReported: true,
            retrievable: true
          }
        }
      ],
      cookie: {
        topic: d.topic_mqtt
      }
    }));
  } catch (error) {
    logger.error('Errore get Alexa devices:', error);
    return [];
  }
};

/**
 * Esegui comando Alexa
 */
export const executeAlexaCommand = async (
  userId: number,
  endpointId: string,
  namespace: string,
  name: string,
  payload?: any
): Promise<{ success: boolean; state?: any }> => {
  try {
    const id = parseInt(endpointId.replace('omnia-', ''));

    const [dispositivi]: any = await query(
      `SELECT d.* FROM dispositivi d
       JOIN impianti i ON d.impianto_id = i.id
       LEFT JOIN condivisioni_impianto c ON i.id = c.impianto_id AND c.stato = 'accettato'
       WHERE d.id = ? AND (i.utente_id = ? OR c.utente_id = ?)`,
      [id, userId, userId]
    );

    if (dispositivi.length === 0) {
      return { success: false };
    }

    const device = dispositivi[0];

    // Gestisci comandi Alexa
    if (namespace === 'Alexa.PowerController') {
      const { getMQTTClient } = require('../config/mqtt');
      const mqttClient = getMQTTClient();

      const on = name === 'TurnOn';
      const topic = `cmnd/${device.topic_mqtt}/POWER`;
      mqttClient.publish(topic, on ? 'ON' : 'OFF');

      await query('UPDATE dispositivi SET power_state = ? WHERE id = ?', [on, id]);

      return {
        success: true,
        state: { powerState: on ? 'ON' : 'OFF' }
      };
    }

    return { success: false };
  } catch (error) {
    logger.error('Errore execute Alexa command:', error);
    return { success: false };
  }
};

export default {
  getGoogleDevices,
  executeGoogleCommand,
  getGoogleDeviceStates,
  getAlexaDevices,
  executeAlexaCommand
};
