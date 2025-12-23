import { query } from '../config/database';
import logger from '../config/logger';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ============================================
// PRESENCE DETECTION SERVICE
// Rileva dispositivi sulla rete locale
// ============================================

export interface TrackedDevice {
  id?: number;
  impianto_id: number;
  mac_address: string;
  nome: string;
  device_type: 'phone' | 'tablet' | 'laptop' | 'other';
  utente_id?: number;
  trigger_enter_scene_id?: number;
  trigger_exit_scene_id?: number;
  enabled: boolean;
}

export interface DevicePresence {
  device: TrackedDevice;
  is_home: boolean;
  last_seen: Date | null;
  ip_address?: string;
}

// Cache presenza dispositivi
const presenceCache: Map<string, { isHome: boolean; lastSeen: Date; ip?: string }> = new Map();

/**
 * Ping un indirizzo IP per verificare se il dispositivo è online
 */
const pingDevice = async (ip: string): Promise<boolean> => {
  try {
    const cmd = process.platform === 'win32'
      ? `ping -n 1 -w 1000 ${ip}`
      : `ping -c 1 -W 1 ${ip}`;

    await execAsync(cmd);
    return true;
  } catch {
    return false;
  }
};

/**
 * Ottiene la tabella ARP per trovare dispositivi sulla rete
 */
const getArpTable = async (): Promise<Map<string, string>> => {
  const arpMap = new Map<string, string>();

  try {
    const cmd = process.platform === 'win32' ? 'arp -a' : 'arp -n';
    const { stdout } = await execAsync(cmd);

    const lines = stdout.split('\n');
    for (const line of lines) {
      // Parse arp output (format varies by OS)
      // Windows: 192.168.1.1    00-11-22-33-44-55    dynamic
      // Linux:   192.168.1.1    ether   00:11:22:33:44:55
      const macMatch = line.match(/([0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}/);
      const ipMatch = line.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);

      if (macMatch && ipMatch) {
        const mac = macMatch[0].toUpperCase().replace(/-/g, ':');
        const ip = ipMatch[1];
        arpMap.set(mac, ip);
      }
    }
  } catch (error) {
    logger.error('Errore lettura ARP table:', error);
  }

  return arpMap;
};

/**
 * Ottieni dispositivi tracciati per un impianto
 */
export const getTrackedDevices = async (impiantoId: number): Promise<TrackedDevice[]> => {
  try {
    const [devices]: any = await query(
      `SELECT td.*, u.nome as utente_nome
       FROM tracked_devices td
       LEFT JOIN utenti u ON td.utente_id = u.id
       WHERE td.impianto_id = ?`,
      [impiantoId]
    );
    return devices;
  } catch (error) {
    logger.error('Errore recupero dispositivi tracciati:', error);
    return [];
  }
};

/**
 * Aggiungi dispositivo da tracciare
 */
export const addTrackedDevice = async (device: TrackedDevice): Promise<number | null> => {
  try {
    const result: any = await query(
      `INSERT INTO tracked_devices
       (impianto_id, mac_address, nome, device_type, utente_id, trigger_enter_scene_id, trigger_exit_scene_id, enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        device.impianto_id,
        device.mac_address.toUpperCase(),
        device.nome,
        device.device_type,
        device.utente_id || null,
        device.trigger_enter_scene_id || null,
        device.trigger_exit_scene_id || null,
        device.enabled ?? true
      ]
    );
    return result.insertId;
  } catch (error) {
    logger.error('Errore aggiunta dispositivo:', error);
    return null;
  }
};

/**
 * Aggiorna dispositivo tracciato
 */
export const updateTrackedDevice = async (
  deviceId: number,
  updates: Partial<TrackedDevice>
): Promise<boolean> => {
  try {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.nome !== undefined) { fields.push('nome = ?'); values.push(updates.nome); }
    if (updates.device_type !== undefined) { fields.push('device_type = ?'); values.push(updates.device_type); }
    if (updates.utente_id !== undefined) { fields.push('utente_id = ?'); values.push(updates.utente_id); }
    if (updates.trigger_enter_scene_id !== undefined) {
      fields.push('trigger_enter_scene_id = ?');
      values.push(updates.trigger_enter_scene_id);
    }
    if (updates.trigger_exit_scene_id !== undefined) {
      fields.push('trigger_exit_scene_id = ?');
      values.push(updates.trigger_exit_scene_id);
    }
    if (updates.enabled !== undefined) { fields.push('enabled = ?'); values.push(updates.enabled); }

    if (fields.length === 0) return true;

    values.push(deviceId);
    await query(`UPDATE tracked_devices SET ${fields.join(', ')} WHERE id = ?`, values);
    return true;
  } catch (error) {
    logger.error('Errore aggiornamento dispositivo:', error);
    return false;
  }
};

/**
 * Elimina dispositivo tracciato
 */
export const deleteTrackedDevice = async (deviceId: number): Promise<boolean> => {
  try {
    await query('DELETE FROM tracked_devices WHERE id = ?', [deviceId]);
    return true;
  } catch (error) {
    logger.error('Errore eliminazione dispositivo:', error);
    return false;
  }
};

/**
 * Esegue scena
 */
const executeScene = async (sceneId: number) => {
  try {
    const [scenes]: any = await query('SELECT * FROM scene WHERE id = ?', [sceneId]);
    if (scenes.length === 0) return;

    const scene = scenes[0];
    const azioni = JSON.parse(scene.azioni || '[]');

    logger.info(`Esecuzione scena presenza: ${scene.nome}`);

    const { getMQTTClient } = require('../config/mqtt');
    const mqttClient = getMQTTClient();

    for (const azione of azioni) {
      if (azione.topic) {
        const topic = `cmnd/${azione.topic}/POWER`;
        const payload = azione.stato === 'ON' ? 'ON' : 'OFF';
        mqttClient.publish(topic, payload);
      }
    }
  } catch (error) {
    logger.error('Errore esecuzione scena presenza:', error);
  }
};

/**
 * Verifica presenza di un singolo dispositivo
 */
const checkDevicePresence = async (device: TrackedDevice): Promise<boolean> => {
  const arpTable = await getArpTable();
  const ip = arpTable.get(device.mac_address);

  if (!ip) {
    return false;
  }

  // Verifica con ping per conferma
  const isOnline = await pingDevice(ip);

  if (isOnline) {
    presenceCache.set(device.mac_address, {
      isHome: true,
      lastSeen: new Date(),
      ip
    });
  }

  return isOnline;
};

/**
 * Scansiona tutti i dispositivi tracciati e rileva cambiamenti presenza
 */
export const scanPresence = async (impiantoId: number): Promise<DevicePresence[]> => {
  const devices = await getTrackedDevices(impiantoId);
  const arpTable = await getArpTable();
  const results: DevicePresence[] = [];

  for (const device of devices) {
    if (!device.enabled) continue;

    const ip = arpTable.get(device.mac_address);
    const cached = presenceCache.get(device.mac_address);
    const wasHome = cached?.isHome || false;

    let isHome = false;
    if (ip) {
      isHome = await pingDevice(ip);
    }

    // Rileva cambiamenti
    if (isHome && !wasHome) {
      // Dispositivo appena arrivato
      logger.info(`📱 Dispositivo arrivato: ${device.nome} (${device.mac_address})`);

      // Log evento
      await logPresenceEvent(device.id!, 'enter', ip);

      // Esegui scena di entrata
      if (device.trigger_enter_scene_id) {
        await executeScene(device.trigger_enter_scene_id);
      }

      presenceCache.set(device.mac_address, { isHome: true, lastSeen: new Date(), ip });
    } else if (!isHome && wasHome) {
      // Dispositivo appena uscito (usa grace period di 5 minuti)
      const lastSeen = cached?.lastSeen;
      const gracePeriod = 5 * 60 * 1000; // 5 minuti

      if (lastSeen && (Date.now() - lastSeen.getTime()) > gracePeriod) {
        logger.info(`📱 Dispositivo uscito: ${device.nome} (${device.mac_address})`);

        // Log evento
        await logPresenceEvent(device.id!, 'exit');

        // Esegui scena di uscita
        if (device.trigger_exit_scene_id) {
          await executeScene(device.trigger_exit_scene_id);
        }

        presenceCache.set(device.mac_address, { isHome: false, lastSeen: new Date() });
      }
    } else if (isHome) {
      // Aggiorna last seen
      presenceCache.set(device.mac_address, { isHome: true, lastSeen: new Date(), ip });
    }

    results.push({
      device,
      is_home: isHome,
      last_seen: presenceCache.get(device.mac_address)?.lastSeen || null,
      ip_address: ip
    });
  }

  return results;
};

/**
 * Log evento presenza
 */
const logPresenceEvent = async (deviceId: number, eventType: 'enter' | 'exit', ip?: string): Promise<void> => {
  try {
    await query(
      `INSERT INTO presence_events (tracked_device_id, event_type, ip_address, created_at)
       VALUES (?, ?, ?, NOW())`,
      [deviceId, eventType, ip || null]
    );
  } catch (error) {
    logger.error('Errore log evento presenza:', error);
  }
};

/**
 * Ottieni cronologia presenza
 */
export const getPresenceHistory = async (impiantoId: number, limit: number = 50): Promise<any[]> => {
  try {
    const [events]: any = await query(
      `SELECT pe.*, td.nome as device_name, td.device_type
       FROM presence_events pe
       JOIN tracked_devices td ON pe.tracked_device_id = td.id
       WHERE td.impianto_id = ?
       ORDER BY pe.created_at DESC
       LIMIT ?`,
      [impiantoId, limit]
    );
    return events;
  } catch (error) {
    logger.error('Errore recupero cronologia presenza:', error);
    return [];
  }
};

/**
 * Ottieni stato presenza attuale per impianto
 */
export const getCurrentPresence = async (impiantoId: number): Promise<any> => {
  const presences = await scanPresence(impiantoId);

  const homeDevices = presences.filter(p => p.is_home);
  const awayDevices = presences.filter(p => !p.is_home);

  return {
    home: homeDevices,
    away: awayDevices,
    anyoneHome: homeDevices.length > 0,
    timestamp: new Date()
  };
};

/**
 * Scansiona dispositivi sulla rete (discovery)
 */
export const discoverDevices = async (subnet: string = '192.168.1'): Promise<any[]> => {
  const discovered: any[] = [];

  // Ping scan sulla subnet
  const pingPromises = [];
  for (let i = 1; i < 255; i++) {
    const ip = `${subnet}.${i}`;
    pingPromises.push(
      pingDevice(ip).then(online => online ? ip : null)
    );
  }

  // Esegui in parallelo (batch di 50)
  const batchSize = 50;
  for (let i = 0; i < pingPromises.length; i += batchSize) {
    const batch = pingPromises.slice(i, i + batchSize);
    await Promise.all(batch);
  }

  // Ottieni tabella ARP aggiornata
  const arpTable = await getArpTable();

  for (const [mac, ip] of arpTable.entries()) {
    discovered.push({ mac_address: mac, ip_address: ip });
  }

  return discovered;
};

export default {
  getTrackedDevices,
  addTrackedDevice,
  updateTrackedDevice,
  deleteTrackedDevice,
  scanPresence,
  getPresenceHistory,
  getCurrentPresence,
  discoverDevices
};
