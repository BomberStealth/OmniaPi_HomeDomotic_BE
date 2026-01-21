import { Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import {
  getLatestReadings,
  getSensorHistory,
  getSensorStats,
  getImpiantoSensors,
  getHourlyAggregates,
  getDailyAggregates
} from '../services/sensorService';

// ============================================
// SENSOR CONTROLLER
// ============================================

// GET tutti i sensori di un impianto
export const getSensors = async (req: AuthRequest, res: Response) => {
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

    const sensors = await getImpiantoSensors(parseInt(impiantoId));

    res.json(sensors);
  } catch (error) {
    console.error('Errore get sensors:', error);
    res.status(500).json({ error: 'Errore durante il recupero dei sensori' });
  }
};

// GET ultime letture per un dispositivo
export const getDeviceReadings = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Verifica accesso al dispositivo
    const [dispositivi]: any = await query(
      `SELECT d.* FROM dispositivi d
       JOIN impianti i ON d.impianto_id = i.id
       LEFT JOIN condivisioni_impianto c ON i.id = c.impianto_id AND c.stato = 'accettato'
       WHERE d.id = ? AND (i.utente_id = ? OR c.utente_id = ?)`,
      [id, req.user!.userId, req.user!.userId]
    );

    if (dispositivi.length === 0) {
      return res.status(404).json({ error: 'Dispositivo non trovato' });
    }

    const readings = await getLatestReadings(parseInt(id));

    res.json({
      dispositivo: dispositivi[0],
      readings
    });
  } catch (error) {
    console.error('Errore get device readings:', error);
    res.status(500).json({ error: 'Errore durante il recupero delle letture' });
  }
};

// GET storico letture
export const getHistory = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { type, hours } = req.query;

    if (!type) {
      return res.status(400).json({ error: 'Tipo sensore richiesto (type=temperature|humidity|...)' });
    }

    // Verifica accesso al dispositivo
    const [dispositivi]: any = await query(
      `SELECT d.* FROM dispositivi d
       JOIN impianti i ON d.impianto_id = i.id
       LEFT JOIN condivisioni_impianto c ON i.id = c.impianto_id AND c.stato = 'accettato'
       WHERE d.id = ? AND (i.utente_id = ? OR c.utente_id = ?)`,
      [id, req.user!.userId, req.user!.userId]
    );

    if (dispositivi.length === 0) {
      return res.status(404).json({ error: 'Dispositivo non trovato' });
    }

    const history = await getSensorHistory(
      parseInt(id),
      type as string,
      parseInt(hours as string) || 24
    );

    res.json(history);
  } catch (error) {
    console.error('Errore get sensor history:', error);
    res.status(500).json({ error: 'Errore durante il recupero dello storico' });
  }
};

// GET statistiche sensore
export const getStats = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { type, hours } = req.query;

    if (!type) {
      return res.status(400).json({ error: 'Tipo sensore richiesto' });
    }

    // Verifica accesso al dispositivo
    const [dispositivi]: any = await query(
      `SELECT d.* FROM dispositivi d
       JOIN impianti i ON d.impianto_id = i.id
       LEFT JOIN condivisioni_impianto c ON i.id = c.impianto_id AND c.stato = 'accettato'
       WHERE d.id = ? AND (i.utente_id = ? OR c.utente_id = ?)`,
      [id, req.user!.userId, req.user!.userId]
    );

    if (dispositivi.length === 0) {
      return res.status(404).json({ error: 'Dispositivo non trovato' });
    }

    const stats = await getSensorStats(
      parseInt(id),
      type as string,
      parseInt(hours as string) || 24
    );

    res.json(stats);
  } catch (error) {
    console.error('Errore get sensor stats:', error);
    res.status(500).json({ error: 'Errore durante il recupero delle statistiche' });
  }
};

// GET dati aggregati per grafici
export const getChartData = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { type, period, days } = req.query;

    if (!type) {
      return res.status(400).json({ error: 'Tipo sensore richiesto' });
    }

    // Verifica accesso al dispositivo
    const [dispositivi]: any = await query(
      `SELECT d.* FROM dispositivi d
       JOIN impianti i ON d.impianto_id = i.id
       LEFT JOIN condivisioni_impianto c ON i.id = c.impianto_id AND c.stato = 'accettato'
       WHERE d.id = ? AND (i.utente_id = ? OR c.utente_id = ?)`,
      [id, req.user!.userId, req.user!.userId]
    );

    if (dispositivi.length === 0) {
      return res.status(404).json({ error: 'Dispositivo non trovato' });
    }

    const daysNum = parseInt(days as string) || 7;

    let data;
    if (period === 'daily') {
      data = await getDailyAggregates(parseInt(id), type as string, daysNum);
    } else {
      data = await getHourlyAggregates(parseInt(id), type as string, daysNum);
    }

    res.json(data);
  } catch (error) {
    console.error('Errore get chart data:', error);
    res.status(500).json({ error: 'Errore durante il recupero dei dati' });
  }
};

// GET dashboard sensori (riassunto per impianto)
export const getSensorDashboard = async (req: AuthRequest, res: Response) => {
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

    const sensors = await getImpiantoSensors(parseInt(impiantoId));

    // Calcola medie per tipo sensore
    const avgByType: { [key: string]: { sum: number; count: number; unit: string } } = {};

    for (const sensor of sensors) {
      for (const reading of sensor.readings || []) {
        if (!avgByType[reading.sensor_type]) {
          avgByType[reading.sensor_type] = { sum: 0, count: 0, unit: reading.unit };
        }
        avgByType[reading.sensor_type].sum += reading.value;
        avgByType[reading.sensor_type].count++;
      }
    }

    const averages = Object.entries(avgByType).map(([type, data]) => ({
      type,
      average: Math.round((data.sum / data.count) * 10) / 10,
      unit: data.unit
    }));

    res.json({
      sensors,
      averages,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Errore get sensor dashboard:', error);
    res.status(500).json({ error: 'Errore durante il recupero della dashboard' });
  }
};
