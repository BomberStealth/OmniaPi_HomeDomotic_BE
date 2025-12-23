import { query } from '../config/database';
import logger from '../config/logger';

// ============================================
// ENERGY MONITORING SERVICE
// Supporto per Shelly EM, Shelly 3EM, e altri meter
// ============================================

export interface EnergyReading {
  id?: number;
  dispositivo_id: number;
  power: number;        // Watt istantanei
  voltage?: number;     // Volt
  current?: number;     // Ampere
  power_factor?: number; // Fattore di potenza
  energy_today?: number; // kWh oggi
  energy_total?: number; // kWh totali
  timestamp?: Date;
}

export interface EnergySummary {
  today: number;        // kWh oggi
  yesterday: number;    // kWh ieri
  thisMonth: number;    // kWh questo mese
  lastMonth: number;    // kWh mese scorso
  total: number;        // kWh totali
  currentPower: number; // Watt attuali
  maxPower: number;     // Picco di potenza
  avgPower: number;     // Media potenza
}

/**
 * Salva una lettura energetica
 */
export const saveEnergyReading = async (reading: EnergyReading): Promise<number | null> => {
  try {
    const result: any = await query(
      `INSERT INTO energy_readings
       (dispositivo_id, power, voltage, current, power_factor, energy_today, energy_total, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        reading.dispositivo_id,
        reading.power,
        reading.voltage || null,
        reading.current || null,
        reading.power_factor || null,
        reading.energy_today || null,
        reading.energy_total || null
      ]
    );
    return result.insertId;
  } catch (error) {
    logger.error('Errore salvataggio lettura energia:', error);
    return null;
  }
};

/**
 * Ottieni ultima lettura per un dispositivo
 */
export const getLatestEnergy = async (dispositivoId: number): Promise<EnergyReading | null> => {
  try {
    const [readings]: any = await query(
      `SELECT * FROM energy_readings
       WHERE dispositivo_id = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      [dispositivoId]
    );
    return readings.length > 0 ? readings[0] : null;
  } catch (error) {
    logger.error('Errore recupero lettura energia:', error);
    return null;
  }
};

/**
 * Ottieni storico potenza
 */
export const getPowerHistory = async (
  dispositivoId: number,
  hours: number = 24
): Promise<EnergyReading[]> => {
  try {
    const [readings]: any = await query(
      `SELECT * FROM energy_readings
       WHERE dispositivo_id = ?
       AND created_at > DATE_SUB(NOW(), INTERVAL ? HOUR)
       ORDER BY created_at ASC`,
      [dispositivoId, hours]
    );
    return readings;
  } catch (error) {
    logger.error('Errore recupero storico energia:', error);
    return [];
  }
};

/**
 * Calcola consumo in un periodo
 */
export const getEnergyConsumption = async (
  dispositivoId: number,
  startDate: Date,
  endDate: Date
): Promise<number> => {
  try {
    // Metodo 1: Usa energy_total se disponibile
    const [readings]: any = await query(
      `SELECT
         MIN(energy_total) as start_total,
         MAX(energy_total) as end_total
       FROM energy_readings
       WHERE dispositivo_id = ?
       AND created_at BETWEEN ? AND ?
       AND energy_total IS NOT NULL`,
      [dispositivoId, startDate, endDate]
    );

    if (readings[0].start_total !== null && readings[0].end_total !== null) {
      return readings[0].end_total - readings[0].start_total;
    }

    // Metodo 2: Stima dal power medio (meno preciso)
    const [avgResult]: any = await query(
      `SELECT AVG(power) as avg_power, COUNT(*) as samples
       FROM energy_readings
       WHERE dispositivo_id = ?
       AND created_at BETWEEN ? AND ?`,
      [dispositivoId, startDate, endDate]
    );

    if (avgResult[0].avg_power && avgResult[0].samples > 0) {
      const hours = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);
      return (avgResult[0].avg_power * hours) / 1000; // Wh to kWh
    }

    return 0;
  } catch (error) {
    logger.error('Errore calcolo consumo:', error);
    return 0;
  }
};

/**
 * Ottieni riepilogo energetico per un dispositivo
 */
export const getEnergySummary = async (dispositivoId: number): Promise<EnergySummary> => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    // Parallelize queries
    const [todayResult, yesterdayResult, thisMonthResult, lastMonthResult, currentResult, statsResult]: any = await Promise.all([
      getEnergyConsumption(dispositivoId, todayStart, now),
      getEnergyConsumption(dispositivoId, yesterdayStart, todayStart),
      getEnergyConsumption(dispositivoId, monthStart, now),
      getEnergyConsumption(dispositivoId, lastMonthStart, lastMonthEnd),
      getLatestEnergy(dispositivoId),
      query(
        `SELECT
           MAX(power) as max_power,
           AVG(power) as avg_power,
           MAX(energy_total) as total
         FROM energy_readings
         WHERE dispositivo_id = ?`,
        [dispositivoId]
      )
    ]);

    const stats = statsResult[0][0] || {};

    return {
      today: todayResult || 0,
      yesterday: yesterdayResult || 0,
      thisMonth: thisMonthResult || 0,
      lastMonth: lastMonthResult || 0,
      total: stats.total || 0,
      currentPower: currentResult?.power || 0,
      maxPower: stats.max_power || 0,
      avgPower: stats.avg_power || 0
    };
  } catch (error) {
    logger.error('Errore calcolo riepilogo energia:', error);
    return {
      today: 0, yesterday: 0, thisMonth: 0, lastMonth: 0,
      total: 0, currentPower: 0, maxPower: 0, avgPower: 0
    };
  }
};

/**
 * Ottieni dati aggregati orari per grafici
 */
export const getHourlyPowerData = async (
  dispositivoId: number,
  days: number = 7
): Promise<any[]> => {
  try {
    const [data]: any = await query(
      `SELECT
         DATE(created_at) as date,
         HOUR(created_at) as hour,
         AVG(power) as avg_power,
         MAX(power) as max_power,
         MIN(power) as min_power
       FROM energy_readings
       WHERE dispositivo_id = ?
       AND created_at > DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY DATE(created_at), HOUR(created_at)
       ORDER BY date ASC, hour ASC`,
      [dispositivoId, days]
    );
    return data;
  } catch (error) {
    logger.error('Errore recupero dati orari energia:', error);
    return [];
  }
};

/**
 * Ottieni dati aggregati giornalieri
 */
export const getDailyEnergyData = async (
  dispositivoId: number,
  days: number = 30
): Promise<any[]> => {
  try {
    const [data]: any = await query(
      `SELECT
         DATE(created_at) as date,
         MAX(energy_today) as energy_kwh,
         AVG(power) as avg_power,
         MAX(power) as max_power
       FROM energy_readings
       WHERE dispositivo_id = ?
       AND created_at > DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      [dispositivoId, days]
    );
    return data;
  } catch (error) {
    logger.error('Errore recupero dati giornalieri energia:', error);
    return [];
  }
};

/**
 * Ottieni riepilogo energetico per impianto
 */
export const getImpiantoEnergySummary = async (impiantoId: number): Promise<any> => {
  try {
    // Trova tutti i meter energetici dell'impianto
    const [meters]: any = await query(
      `SELECT d.id, d.nome, d.topic_mqtt
       FROM dispositivi d
       WHERE d.impianto_id = ?
       AND (d.tipo_dispositivo IN ('energy_meter', 'shelly_em', 'shelly_3em') OR d.nome LIKE '%EM%')`,
      [impiantoId]
    );

    const summaries = await Promise.all(
      meters.map(async (m: any) => ({
        dispositivo: m,
        summary: await getEnergySummary(m.id)
      }))
    );

    // Calcola totali
    const totals = summaries.reduce((acc, s) => ({
      today: acc.today + s.summary.today,
      yesterday: acc.yesterday + s.summary.yesterday,
      thisMonth: acc.thisMonth + s.summary.thisMonth,
      currentPower: acc.currentPower + s.summary.currentPower
    }), { today: 0, yesterday: 0, thisMonth: 0, currentPower: 0 });

    return {
      meters: summaries,
      totals,
      timestamp: new Date()
    };
  } catch (error) {
    logger.error('Errore riepilogo energia impianto:', error);
    return { meters: [], totals: { today: 0, yesterday: 0, thisMonth: 0, currentPower: 0 } };
  }
};

/**
 * Processa dati Shelly EM da MQTT
 * Topic: shellies/shellyem-XXXXXX/emeter/0/power (potenza istantanea)
 * Topic: shellies/shellyem-XXXXXX/emeter/0/energy (energia contatore)
 */
export const processShellyEnergyData = async (topic: string, payload: any): Promise<void> => {
  try {
    // Parse topic per Shelly EM: shellies/shellyem-XXXXXX/emeter/0/power
    const parts = topic.split('/');
    if (parts[0] !== 'shellies') return;

    const deviceName = parts[1]; // es. shellyem-XXXXXX
    const channel = parts[3]; // 0 o 1

    // Trova dispositivo
    const [dispositivi]: any = await query(
      'SELECT id FROM dispositivi WHERE topic_mqtt = ? OR topic_mqtt = ?',
      [deviceName, `${deviceName}_${channel}`]
    );

    if (dispositivi.length === 0) {
      logger.debug(`Shelly EM device non trovato: ${deviceName}`);
      return;
    }

    const dispositivoId = dispositivi[0].id;
    const metric = parts[4]; // power, energy, voltage, current, pf

    // Aggiorna o crea lettura
    const latest = await getLatestEnergy(dispositivoId);
    const reading: EnergyReading = {
      dispositivo_id: dispositivoId,
      power: latest?.power || 0,
      voltage: latest?.voltage,
      current: latest?.current,
      power_factor: latest?.power_factor,
      energy_today: latest?.energy_today,
      energy_total: latest?.energy_total
    };

    // Aggiorna campo specifico
    const value = parseFloat(payload.toString());
    switch (metric) {
      case 'power':
        reading.power = value;
        break;
      case 'voltage':
        reading.voltage = value;
        break;
      case 'current':
        reading.current = value;
        break;
      case 'pf':
        reading.power_factor = value;
        break;
      case 'energy':
        reading.energy_total = value / 60000; // Wmin to kWh
        break;
    }

    await saveEnergyReading(reading);
    logger.debug(`Energy update: ${deviceName} ${metric}=${value}`);
  } catch (error) {
    logger.error('Errore processamento Shelly EM:', error);
  }
};

/**
 * Pulizia vecchie letture energetiche
 */
export const cleanOldEnergyReadings = async (retentionDays: number = 365): Promise<number> => {
  try {
    const result: any = await query(
      `DELETE FROM energy_readings
       WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [retentionDays]
    );
    logger.info(`Pulizia energia: ${result.affectedRows} letture rimosse`);
    return result.affectedRows;
  } catch (error) {
    logger.error('Errore pulizia letture energia:', error);
    return 0;
  }
};

export default {
  saveEnergyReading,
  getLatestEnergy,
  getPowerHistory,
  getEnergyConsumption,
  getEnergySummary,
  getHourlyPowerData,
  getDailyEnergyData,
  getImpiantoEnergySummary,
  processShellyEnergyData,
  cleanOldEnergyReadings
};
