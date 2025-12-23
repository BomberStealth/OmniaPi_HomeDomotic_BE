import { Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import {
  getImpiantoGeofences,
  createGeofence,
  updateGeofence,
  deleteGeofence,
  processLocationUpdate,
  getGeofenceHistory,
  getUsersInImpianto
} from '../services/geofencing';

// ============================================
// GEOFENCE CONTROLLER
// ============================================

// GET tutte le zone geofence di un impianto
export const getGeofences = async (req: AuthRequest, res: Response) => {
  try {
    const { impiantoId } = req.params;

    // Verifica accesso all'impianto
    const [impianti]: any = await query(
      `SELECT i.* FROM impianti i
       LEFT JOIN impianti_condivisi ic ON i.id = ic.impianto_id
       WHERE i.id = ? AND (i.utente_id = ? OR ic.utente_id = ?)`,
      [impiantoId, req.user!.userId, req.user!.userId]
    );

    if (impianti.length === 0) {
      return res.status(404).json({ error: 'Impianto non trovato' });
    }

    const zones = await getImpiantoGeofences(parseInt(impiantoId));

    res.json(zones);
  } catch (error) {
    console.error('Errore get geofences:', error);
    res.status(500).json({ error: 'Errore durante il recupero delle zone geofence' });
  }
};

// POST crea nuova zona geofence
export const createZone = async (req: AuthRequest, res: Response) => {
  try {
    const { impiantoId } = req.params;
    const { nome, latitude, longitude, radius, trigger_enter_scene_id, trigger_exit_scene_id } = req.body;

    if (!nome || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'Nome, latitudine e longitudine sono richiesti' });
    }

    // Verifica accesso all'impianto
    const [impianti]: any = await query(
      `SELECT i.* FROM impianti i
       LEFT JOIN impianti_condivisi ic ON i.id = ic.impianto_id
       WHERE i.id = ? AND (i.utente_id = ? OR ic.utente_id = ?)`,
      [impiantoId, req.user!.userId, req.user!.userId]
    );

    if (impianti.length === 0) {
      return res.status(404).json({ error: 'Impianto non trovato' });
    }

    const zoneId = await createGeofence(
      parseInt(impiantoId),
      nome,
      latitude,
      longitude,
      radius || 100, // Default 100 metri
      trigger_enter_scene_id,
      trigger_exit_scene_id
    );

    if (!zoneId) {
      return res.status(500).json({ error: 'Errore durante la creazione della zona' });
    }

    // Recupera la zona creata
    const [zones]: any = await query('SELECT * FROM geofence_zones WHERE id = ?', [zoneId]);

    res.status(201).json(zones[0]);
  } catch (error) {
    console.error('Errore create geofence:', error);
    res.status(500).json({ error: 'Errore durante la creazione della zona geofence' });
  }
};

// PUT aggiorna zona geofence
export const updateZone = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Verifica che la zona esista e che l'utente abbia accesso
    const [zones]: any = await query(
      `SELECT gz.* FROM geofence_zones gz
       JOIN impianti i ON gz.impianto_id = i.id
       LEFT JOIN impianti_condivisi ic ON i.id = ic.impianto_id
       WHERE gz.id = ? AND (i.utente_id = ? OR ic.utente_id = ?)`,
      [id, req.user!.userId, req.user!.userId]
    );

    if (zones.length === 0) {
      return res.status(404).json({ error: 'Zona geofence non trovata' });
    }

    const success = await updateGeofence(parseInt(id), updates);

    if (!success) {
      return res.status(500).json({ error: 'Errore durante l\'aggiornamento' });
    }

    // Recupera la zona aggiornata
    const [updated]: any = await query('SELECT * FROM geofence_zones WHERE id = ?', [id]);

    res.json(updated[0]);
  } catch (error) {
    console.error('Errore update geofence:', error);
    res.status(500).json({ error: 'Errore durante l\'aggiornamento della zona geofence' });
  }
};

// DELETE elimina zona geofence
export const deleteZone = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Verifica che la zona esista e che l'utente abbia accesso
    const [zones]: any = await query(
      `SELECT gz.* FROM geofence_zones gz
       JOIN impianti i ON gz.impianto_id = i.id
       LEFT JOIN impianti_condivisi ic ON i.id = ic.impianto_id
       WHERE gz.id = ? AND (i.utente_id = ? OR ic.utente_id = ?)`,
      [id, req.user!.userId, req.user!.userId]
    );

    if (zones.length === 0) {
      return res.status(404).json({ error: 'Zona geofence non trovata' });
    }

    const success = await deleteGeofence(parseInt(id));

    if (!success) {
      return res.status(500).json({ error: 'Errore durante l\'eliminazione' });
    }

    res.json({ message: 'Zona eliminata con successo' });
  } catch (error) {
    console.error('Errore delete geofence:', error);
    res.status(500).json({ error: 'Errore durante l\'eliminazione della zona geofence' });
  }
};

// POST aggiorna posizione utente
export const updateLocation = async (req: AuthRequest, res: Response) => {
  try {
    const { latitude, longitude, accuracy } = req.body;

    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'Latitudine e longitudine sono richieste' });
    }

    const events = await processLocationUpdate({
      userId: req.user!.userId,
      latitude,
      longitude,
      accuracy: accuracy || 10,
      timestamp: new Date()
    });

    res.json({
      success: true,
      events: events.map(e => ({
        type: e.type,
        zone: e.zoneName,
        timestamp: e.timestamp
      }))
    });
  } catch (error) {
    console.error('Errore update location:', error);
    res.status(500).json({ error: 'Errore durante l\'aggiornamento della posizione' });
  }
};

// GET cronologia eventi geofence
export const getHistory = async (req: AuthRequest, res: Response) => {
  try {
    const { impiantoId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;

    // Verifica accesso all'impianto
    const [impianti]: any = await query(
      `SELECT i.* FROM impianti i
       LEFT JOIN impianti_condivisi ic ON i.id = ic.impianto_id
       WHERE i.id = ? AND (i.utente_id = ? OR ic.utente_id = ?)`,
      [impiantoId, req.user!.userId, req.user!.userId]
    );

    if (impianti.length === 0) {
      return res.status(404).json({ error: 'Impianto non trovato' });
    }

    const history = await getGeofenceHistory(parseInt(impiantoId), Math.min(limit, 100));

    res.json(history);
  } catch (error) {
    console.error('Errore get geofence history:', error);
    res.status(500).json({ error: 'Errore durante il recupero della cronologia' });
  }
};

// GET utenti attualmente presenti
export const getPresence = async (req: AuthRequest, res: Response) => {
  try {
    const { impiantoId } = req.params;

    // Verifica accesso all'impianto
    const [impianti]: any = await query(
      `SELECT i.* FROM impianti i
       LEFT JOIN impianti_condivisi ic ON i.id = ic.impianto_id
       WHERE i.id = ? AND (i.utente_id = ? OR ic.utente_id = ?)`,
      [impiantoId, req.user!.userId, req.user!.userId]
    );

    if (impianti.length === 0) {
      return res.status(404).json({ error: 'Impianto non trovato' });
    }

    const users = await getUsersInImpianto(parseInt(impiantoId));

    res.json({
      count: users.length,
      users
    });
  } catch (error) {
    console.error('Errore get presence:', error);
    res.status(500).json({ error: 'Errore durante il recupero della presenza' });
  }
};
