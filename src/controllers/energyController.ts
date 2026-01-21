import { Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import {
  getLatestEnergy,
  getPowerHistory,
  getEnergySummary,
  getHourlyPowerData,
  getDailyEnergyData,
  getImpiantoEnergySummary
} from '../services/energyService';

// ============================================
// ENERGY CONTROLLER
// ============================================

// GET riepilogo energetico per impianto
export const getImpiantoEnergy = async (req: AuthRequest, res: Response) => {
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

    const summary = await getImpiantoEnergySummary(parseInt(impiantoId));

    res.json(summary);
  } catch (error) {
    console.error('Errore get impianto energy:', error);
    res.status(500).json({ error: 'Errore durante il recupero dei dati energetici' });
  }
};

// GET lettura corrente per un dispositivo
export const getDeviceEnergy = async (req: AuthRequest, res: Response) => {
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

    const latest = await getLatestEnergy(parseInt(id));
    const summary = await getEnergySummary(parseInt(id));

    res.json({
      dispositivo: dispositivi[0],
      current: latest,
      summary
    });
  } catch (error) {
    console.error('Errore get device energy:', error);
    res.status(500).json({ error: 'Errore durante il recupero dei dati energetici' });
  }
};

// GET storico potenza
export const getPowerHistoryData = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const hours = parseInt(req.query.hours as string) || 24;

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

    const history = await getPowerHistory(parseInt(id), Math.min(hours, 168)); // Max 1 week

    res.json(history);
  } catch (error) {
    console.error('Errore get power history:', error);
    res.status(500).json({ error: 'Errore durante il recupero dello storico' });
  }
};

// GET dati per grafico orario
export const getHourlyChart = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const days = parseInt(req.query.days as string) || 7;

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

    const data = await getHourlyPowerData(parseInt(id), Math.min(days, 30));

    res.json(data);
  } catch (error) {
    console.error('Errore get hourly chart:', error);
    res.status(500).json({ error: 'Errore durante il recupero dei dati' });
  }
};

// GET dati per grafico giornaliero
export const getDailyChart = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const days = parseInt(req.query.days as string) || 30;

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

    const data = await getDailyEnergyData(parseInt(id), Math.min(days, 365));

    res.json(data);
  } catch (error) {
    console.error('Errore get daily chart:', error);
    res.status(500).json({ error: 'Errore durante il recupero dei dati' });
  }
};

// GET riepilogo per dashboard
export const getEnergyDashboard = async (req: AuthRequest, res: Response) => {
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

    const summary = await getImpiantoEnergySummary(parseInt(impiantoId));

    // Aggiungi indicatori di confronto
    const comparison = {
      todayVsYesterday: summary.totals.yesterday > 0
        ? ((summary.totals.today - summary.totals.yesterday) / summary.totals.yesterday * 100).toFixed(1)
        : 0,
    };

    res.json({
      ...summary,
      comparison,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Errore get energy dashboard:', error);
    res.status(500).json({ error: 'Errore durante il recupero della dashboard' });
  }
};
