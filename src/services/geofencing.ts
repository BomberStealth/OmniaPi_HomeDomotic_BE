import { query } from '../config/database';
import logger from '../config/logger';

// ============================================
// GEOFENCING SERVICE
// Rileva entrata/uscita da zone geografiche
// ============================================

interface GeofenceZone {
  id: number;
  impianto_id: number;
  nome: string;
  latitude: number;
  longitude: number;
  radius: number; // metri
  trigger_enter_scene_id: number | null;
  trigger_exit_scene_id: number | null;
  enabled: boolean;
}

interface UserLocation {
  userId: number;
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: Date;
}

interface GeofenceEvent {
  type: 'enter' | 'exit';
  userId: number;
  zoneId: number;
  zoneName: string;
  impiantoId: number;
  timestamp: Date;
}

// Cache delle ultime posizioni utente per rilevare transizioni
const userLocationCache: Map<number, { lat: number; lng: number; zonesInside: Set<number> }> = new Map();

/**
 * Calcola la distanza tra due punti geografici (formula di Haversine)
 * Ritorna la distanza in metri
 */
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371000; // Raggio della Terra in metri
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Verifica se un punto è dentro una zona geofence
 */
const isInsideZone = (lat: number, lng: number, zone: GeofenceZone): boolean => {
  const distance = calculateDistance(lat, lng, zone.latitude, zone.longitude);
  return distance <= zone.radius;
};

/**
 * Ottieni tutte le zone geofence per un utente (basate sugli impianti a cui ha accesso)
 */
export const getUserGeofences = async (userId: number): Promise<GeofenceZone[]> => {
  try {
    const [zones]: any = await query(
      `SELECT gz.* FROM geofence_zones gz
       JOIN impianti i ON gz.impianto_id = i.id
       LEFT JOIN impianti_condivisi ic ON i.id = ic.impianto_id
       WHERE gz.enabled = TRUE AND (i.utente_id = ? OR ic.utente_id = ?)`,
      [userId, userId]
    );
    return zones;
  } catch (error) {
    logger.error('Errore recupero geofences:', error);
    return [];
  }
};

/**
 * Ottieni zone geofence per un impianto specifico
 */
export const getImpiantoGeofences = async (impiantoId: number): Promise<GeofenceZone[]> => {
  try {
    const [zones]: any = await query(
      'SELECT * FROM geofence_zones WHERE impianto_id = ?',
      [impiantoId]
    );
    return zones;
  } catch (error) {
    logger.error('Errore recupero geofences impianto:', error);
    return [];
  }
};

/**
 * Crea una nuova zona geofence
 */
export const createGeofence = async (
  impiantoId: number,
  nome: string,
  latitude: number,
  longitude: number,
  radius: number,
  enterSceneId?: number,
  exitSceneId?: number
): Promise<number | null> => {
  try {
    const result: any = await query(
      `INSERT INTO geofence_zones
       (impianto_id, nome, latitude, longitude, radius, trigger_enter_scene_id, trigger_exit_scene_id, enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [impiantoId, nome, latitude, longitude, radius, enterSceneId || null, exitSceneId || null]
    );
    logger.info(`Geofence creato: ${nome} (id: ${result.insertId})`);
    return result.insertId;
  } catch (error) {
    logger.error('Errore creazione geofence:', error);
    return null;
  }
};

/**
 * Aggiorna una zona geofence
 */
export const updateGeofence = async (
  zoneId: number,
  updates: Partial<GeofenceZone>
): Promise<boolean> => {
  try {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.nome !== undefined) { fields.push('nome = ?'); values.push(updates.nome); }
    if (updates.latitude !== undefined) { fields.push('latitude = ?'); values.push(updates.latitude); }
    if (updates.longitude !== undefined) { fields.push('longitude = ?'); values.push(updates.longitude); }
    if (updates.radius !== undefined) { fields.push('radius = ?'); values.push(updates.radius); }
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

    values.push(zoneId);
    await query(`UPDATE geofence_zones SET ${fields.join(', ')} WHERE id = ?`, values);
    return true;
  } catch (error) {
    logger.error('Errore aggiornamento geofence:', error);
    return false;
  }
};

/**
 * Elimina una zona geofence
 */
export const deleteGeofence = async (zoneId: number): Promise<boolean> => {
  try {
    await query('DELETE FROM geofence_zones WHERE id = ?', [zoneId]);
    return true;
  } catch (error) {
    logger.error('Errore eliminazione geofence:', error);
    return false;
  }
};

/**
 * Esegue una scena
 */
const executeScene = async (sceneId: number) => {
  try {
    const [scenes]: any = await query('SELECT * FROM scene WHERE id = ?', [sceneId]);
    if (scenes.length === 0) return;

    const scene = scenes[0];
    const azioni = JSON.parse(scene.azioni || '[]');

    logger.info(`Esecuzione scena geofence: ${scene.nome} (${sceneId})`);

    const { getMQTTClient } = require('../config/mqtt');
    const mqttClient = getMQTTClient();

    for (const azione of azioni) {
      if (azione.topic) {
        const topic = `cmnd/${azione.topic}/POWER`;
        const payload = azione.stato === 'ON' ? 'ON' : 'OFF';
        mqttClient.publish(topic, payload);
        logger.info(`Geofence MQTT: ${topic} -> ${payload}`);
      }
    }
  } catch (error) {
    logger.error(`Errore esecuzione scena geofence ${sceneId}:`, error);
  }
};

/**
 * Processa un aggiornamento di posizione e rileva eventi geofence
 */
export const processLocationUpdate = async (location: UserLocation): Promise<GeofenceEvent[]> => {
  const events: GeofenceEvent[] = [];

  try {
    // Ottieni cache posizione precedente
    const cached = userLocationCache.get(location.userId);
    const previousZones = cached?.zonesInside || new Set<number>();

    // Ottieni zone disponibili per l'utente
    const zones = await getUserGeofences(location.userId);

    // Calcola zone in cui l'utente si trova ora
    const currentZones = new Set<number>();
    for (const zone of zones) {
      if (isInsideZone(location.latitude, location.longitude, zone)) {
        currentZones.add(zone.id);
      }
    }

    // Rileva eventi di entrata
    for (const zoneId of currentZones) {
      if (!previousZones.has(zoneId)) {
        const zone = zones.find(z => z.id === zoneId);
        if (zone) {
          const event: GeofenceEvent = {
            type: 'enter',
            userId: location.userId,
            zoneId: zone.id,
            zoneName: zone.nome,
            impiantoId: zone.impianto_id,
            timestamp: new Date()
          };
          events.push(event);
          logger.info(`Geofence ENTER: User ${location.userId} -> ${zone.nome}`);

          // Registra evento nel database
          await logGeofenceEvent(event);

          // Esegui scena di entrata se configurata
          if (zone.trigger_enter_scene_id) {
            await executeScene(zone.trigger_enter_scene_id);
          }
        }
      }
    }

    // Rileva eventi di uscita
    for (const zoneId of previousZones) {
      if (!currentZones.has(zoneId)) {
        const zone = zones.find(z => z.id === zoneId);
        if (zone) {
          const event: GeofenceEvent = {
            type: 'exit',
            userId: location.userId,
            zoneId: zone.id,
            zoneName: zone.nome,
            impiantoId: zone.impianto_id,
            timestamp: new Date()
          };
          events.push(event);
          logger.info(`Geofence EXIT: User ${location.userId} -> ${zone.nome}`);

          // Registra evento nel database
          await logGeofenceEvent(event);

          // Esegui scena di uscita se configurata
          if (zone.trigger_exit_scene_id) {
            await executeScene(zone.trigger_exit_scene_id);
          }
        }
      }
    }

    // Aggiorna cache
    userLocationCache.set(location.userId, {
      lat: location.latitude,
      lng: location.longitude,
      zonesInside: currentZones
    });

    // Salva posizione nel database
    await saveUserLocation(location);

    return events;
  } catch (error) {
    logger.error('Errore processamento posizione:', error);
    return events;
  }
};

/**
 * Salva la posizione dell'utente nel database
 */
const saveUserLocation = async (location: UserLocation): Promise<void> => {
  try {
    await query(
      `INSERT INTO user_locations (user_id, latitude, longitude, accuracy, created_at)
       VALUES (?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
       latitude = VALUES(latitude),
       longitude = VALUES(longitude),
       accuracy = VALUES(accuracy),
       created_at = NOW()`,
      [location.userId, location.latitude, location.longitude, location.accuracy]
    );
  } catch (error) {
    logger.error('Errore salvataggio posizione:', error);
  }
};

/**
 * Registra evento geofence nel database
 */
const logGeofenceEvent = async (event: GeofenceEvent): Promise<void> => {
  try {
    await query(
      `INSERT INTO geofence_events (user_id, zone_id, event_type, created_at)
       VALUES (?, ?, ?, NOW())`,
      [event.userId, event.zoneId, event.type]
    );
  } catch (error) {
    logger.error('Errore log evento geofence:', error);
  }
};

/**
 * Ottieni cronologia eventi geofence per un impianto
 */
export const getGeofenceHistory = async (
  impiantoId: number,
  limit: number = 50
): Promise<any[]> => {
  try {
    const [events]: any = await query(
      `SELECT ge.*, gz.nome as zone_name, u.nome as user_name
       FROM geofence_events ge
       JOIN geofence_zones gz ON ge.zone_id = gz.id
       JOIN utenti u ON ge.user_id = u.id
       WHERE gz.impianto_id = ?
       ORDER BY ge.created_at DESC
       LIMIT ?`,
      [impiantoId, limit]
    );
    return events;
  } catch (error) {
    logger.error('Errore recupero cronologia geofence:', error);
    return [];
  }
};

/**
 * Ottieni utenti attualmente presenti in un impianto
 */
export const getUsersInImpianto = async (impiantoId: number): Promise<any[]> => {
  try {
    // Trova zone dell'impianto
    const zones = await getImpiantoGeofences(impiantoId);
    const zoneIds = zones.map(z => z.id);

    if (zoneIds.length === 0) return [];

    // Trova utenti la cui ultima posizione è dentro una di queste zone
    const usersInside: any[] = [];

    const [locations]: any = await query(
      `SELECT ul.*, u.nome, u.email
       FROM user_locations ul
       JOIN utenti u ON ul.user_id = u.id
       WHERE ul.created_at > DATE_SUB(NOW(), INTERVAL 30 MINUTE)
       ORDER BY ul.created_at DESC`
    );

    for (const loc of locations) {
      for (const zone of zones) {
        if (isInsideZone(loc.latitude, loc.longitude, zone)) {
          usersInside.push({
            userId: loc.user_id,
            nome: loc.nome,
            zoneName: zone.nome,
            lastSeen: loc.created_at
          });
          break; // Utente già contato, passa al prossimo
        }
      }
    }

    return usersInside;
  } catch (error) {
    logger.error('Errore recupero utenti in impianto:', error);
    return [];
  }
};

export default {
  getUserGeofences,
  getImpiantoGeofences,
  createGeofence,
  updateGeofence,
  deleteGeofence,
  processLocationUpdate,
  getGeofenceHistory,
  getUsersInImpianto
};
