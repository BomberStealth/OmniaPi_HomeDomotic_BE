import { Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import {
  getTrackedDevices,
  addTrackedDevice,
  updateTrackedDevice,
  deleteTrackedDevice,
  getCurrentPresence,
  getPresenceHistory,
  discoverDevices
} from '../services/presenceService';

// ============================================
// PRESENCE CONTROLLER
// ============================================

// GET dispositivi tracciati
export const getDevices = async (req: AuthRequest, res: Response) => {
  try {
    const { impiantoId } = req.params;

    // Verifica accesso all'impianto
    const [impianti]: any = await query(
      `SELECT i.* FROM impianti i
       LEFT JOIN condivisioni_impianto c ON i.id = c.impianto_id AND c.stato = 'accettato'
       WHERE i.id = ? AND (i.utente_id = ? OR c.utente_id = ?)`,
      [impiantoId, req.user!.userId, req.user!.userId]
    );

    if (impianti.length === 0) {
      return res.status(404).json({ error: 'Impianto non trovato' });
    }

    const devices = await getTrackedDevices(parseInt(impiantoId));

    res.json(devices);
  } catch (error) {
    console.error('Errore get tracked devices:', error);
    res.status(500).json({ error: 'Errore durante il recupero dei dispositivi' });
  }
};

// POST aggiungi dispositivo
export const addDevice = async (req: AuthRequest, res: Response) => {
  try {
    const { impiantoId } = req.params;
    const { mac_address, nome, device_type, utente_id, trigger_enter_scene_id, trigger_exit_scene_id } = req.body;

    if (!mac_address || !nome) {
      return res.status(400).json({ error: 'MAC address e nome sono richiesti' });
    }

    // Verifica accesso all'impianto
    const [impianti]: any = await query(
      `SELECT i.* FROM impianti i
       LEFT JOIN condivisioni_impianto c ON i.id = c.impianto_id AND c.stato = 'accettato'
       WHERE i.id = ? AND (i.utente_id = ? OR c.utente_id = ?)`,
      [impiantoId, req.user!.userId, req.user!.userId]
    );

    if (impianti.length === 0) {
      return res.status(404).json({ error: 'Impianto non trovato' });
    }

    const deviceId = await addTrackedDevice({
      impianto_id: parseInt(impiantoId),
      mac_address,
      nome,
      device_type: device_type || 'phone',
      utente_id,
      trigger_enter_scene_id,
      trigger_exit_scene_id,
      enabled: true
    });

    if (!deviceId) {
      return res.status(500).json({ error: 'Errore durante l\'aggiunta del dispositivo' });
    }

    const [devices]: any = await query('SELECT * FROM tracked_devices WHERE id = ?', [deviceId]);

    res.status(201).json(devices[0]);
  } catch (error) {
    console.error('Errore add device:', error);
    res.status(500).json({ error: 'Errore durante l\'aggiunta del dispositivo' });
  }
};

// PUT aggiorna dispositivo
export const updateDevice = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Verifica accesso
    const [devices]: any = await query(
      `SELECT td.* FROM tracked_devices td
       JOIN impianti i ON td.impianto_id = i.id
       LEFT JOIN condivisioni_impianto c ON i.id = c.impianto_id AND c.stato = 'accettato'
       WHERE td.id = ? AND (i.utente_id = ? OR c.utente_id = ?)`,
      [id, req.user!.userId, req.user!.userId]
    );

    if (devices.length === 0) {
      return res.status(404).json({ error: 'Dispositivo non trovato' });
    }

    const success = await updateTrackedDevice(parseInt(id), req.body);

    if (!success) {
      return res.status(500).json({ error: 'Errore durante l\'aggiornamento' });
    }

    const [updated]: any = await query('SELECT * FROM tracked_devices WHERE id = ?', [id]);

    res.json(updated[0]);
  } catch (error) {
    console.error('Errore update device:', error);
    res.status(500).json({ error: 'Errore durante l\'aggiornamento del dispositivo' });
  }
};

// DELETE elimina dispositivo
export const removeDevice = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Verifica accesso
    const [devices]: any = await query(
      `SELECT td.* FROM tracked_devices td
       JOIN impianti i ON td.impianto_id = i.id
       LEFT JOIN condivisioni_impianto c ON i.id = c.impianto_id AND c.stato = 'accettato'
       WHERE td.id = ? AND (i.utente_id = ? OR c.utente_id = ?)`,
      [id, req.user!.userId, req.user!.userId]
    );

    if (devices.length === 0) {
      return res.status(404).json({ error: 'Dispositivo non trovato' });
    }

    const success = await deleteTrackedDevice(parseInt(id));

    if (!success) {
      return res.status(500).json({ error: 'Errore durante l\'eliminazione' });
    }

    res.json({ message: 'Dispositivo rimosso con successo' });
  } catch (error) {
    console.error('Errore delete device:', error);
    res.status(500).json({ error: 'Errore durante l\'eliminazione del dispositivo' });
  }
};

// GET stato presenza attuale
export const getStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { impiantoId } = req.params;

    // Verifica accesso all'impianto
    const [impianti]: any = await query(
      `SELECT i.* FROM impianti i
       LEFT JOIN condivisioni_impianto c ON i.id = c.impianto_id AND c.stato = 'accettato'
       WHERE i.id = ? AND (i.utente_id = ? OR c.utente_id = ?)`,
      [impiantoId, req.user!.userId, req.user!.userId]
    );

    if (impianti.length === 0) {
      return res.status(404).json({ error: 'Impianto non trovato' });
    }

    const presence = await getCurrentPresence(parseInt(impiantoId));

    res.json(presence);
  } catch (error) {
    console.error('Errore get presence status:', error);
    res.status(500).json({ error: 'Errore durante il recupero dello stato presenza' });
  }
};

// GET cronologia presenza
export const getHistory = async (req: AuthRequest, res: Response) => {
  try {
    const { impiantoId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;

    // Verifica accesso all'impianto
    const [impianti]: any = await query(
      `SELECT i.* FROM impianti i
       LEFT JOIN condivisioni_impianto c ON i.id = c.impianto_id AND c.stato = 'accettato'
       WHERE i.id = ? AND (i.utente_id = ? OR c.utente_id = ?)`,
      [impiantoId, req.user!.userId, req.user!.userId]
    );

    if (impianti.length === 0) {
      return res.status(404).json({ error: 'Impianto non trovato' });
    }

    const history = await getPresenceHistory(parseInt(impiantoId), Math.min(limit, 100));

    res.json(history);
  } catch (error) {
    console.error('Errore get presence history:', error);
    res.status(500).json({ error: 'Errore durante il recupero della cronologia' });
  }
};

// POST scopri dispositivi sulla rete
export const discover = async (req: AuthRequest, res: Response) => {
  try {
    const { subnet } = req.body;

    const devices = await discoverDevices(subnet || '192.168.1');

    res.json({
      count: devices.length,
      devices
    });
  } catch (error) {
    console.error('Errore discover devices:', error);
    res.status(500).json({ error: 'Errore durante la scansione della rete' });
  }
};
