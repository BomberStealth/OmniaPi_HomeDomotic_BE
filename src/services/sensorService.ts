import { query } from '../config/database';
import logger from '../config/logger';

// ============================================
// SENSOR SERVICE
// Gestisce sensori DHT22, temperatura, umidità
// ============================================

export interface SensorReading {
  id?: number;
  dispositivo_id: number;
  sensor_type: 'temperature' | 'humidity' | 'pressure' | 'battery' | 'energy';
  value: number;
  unit: string;
  timestamp?: Date;
}

export interface SensorStats {
  min: number;
  max: number;
  avg: number;
  count: number;
}

/**
 * Salva una lettura del sensore
 */
export const saveSensorReading = async (reading: SensorReading): Promise<number | null> => {
  try {
    const result: any = await query(
      `INSERT INTO sensor_readings (dispositivo_id, sensor_type, value, unit, created_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [reading.dispositivo_id, reading.sensor_type, reading.value, reading.unit]
    );
    return result.insertId;
  } catch (error) {
    logger.error('Errore salvataggio lettura sensore:', error);
    return null;
  }
};

/**
 * Salva multiple letture (es. temperatura + umidità da DHT22)
 */
export const saveSensorReadings = async (readings: SensorReading[]): Promise<boolean> => {
  try {
    for (const reading of readings) {
      await saveSensorReading(reading);
    }
    return true;
  } catch (error) {
    logger.error('Errore salvataggio letture sensori:', error);
    return false;
  }
};

/**
 * Ottieni ultime letture per un dispositivo
 */
export const getLatestReadings = async (dispositivoId: number): Promise<SensorReading[]> => {
  try {
    const [readings]: any = await query(
      `SELECT sr.*, d.nome as dispositivo_nome
       FROM sensor_readings sr
       JOIN dispositivi d ON sr.dispositivo_id = d.id
       WHERE sr.dispositivo_id = ?
       AND sr.id IN (
         SELECT MAX(id) FROM sensor_readings
         WHERE dispositivo_id = ?
         GROUP BY sensor_type
       )`,
      [dispositivoId, dispositivoId]
    );
    return readings;
  } catch (error) {
    logger.error('Errore recupero letture sensore:', error);
    return [];
  }
};

/**
 * Ottieni storico letture per un dispositivo e tipo sensore
 */
export const getSensorHistory = async (
  dispositivoId: number,
  sensorType: string,
  hours: number = 24
): Promise<SensorReading[]> => {
  try {
    const [readings]: any = await query(
      `SELECT * FROM sensor_readings
       WHERE dispositivo_id = ? AND sensor_type = ?
       AND created_at > DATE_SUB(NOW(), INTERVAL ? HOUR)
       ORDER BY created_at ASC`,
      [dispositivoId, sensorType, hours]
    );
    return readings;
  } catch (error) {
    logger.error('Errore recupero storico sensore:', error);
    return [];
  }
};

/**
 * Ottieni statistiche per un sensore in un periodo
 */
export const getSensorStats = async (
  dispositivoId: number,
  sensorType: string,
  hours: number = 24
): Promise<SensorStats | null> => {
  try {
    const [result]: any = await query(
      `SELECT
         MIN(value) as min,
         MAX(value) as max,
         AVG(value) as avg,
         COUNT(*) as count
       FROM sensor_readings
       WHERE dispositivo_id = ? AND sensor_type = ?
       AND created_at > DATE_SUB(NOW(), INTERVAL ? HOUR)`,
      [dispositivoId, sensorType, hours]
    );

    if (result.length === 0 || result[0].count === 0) {
      return null;
    }

    return {
      min: parseFloat(result[0].min),
      max: parseFloat(result[0].max),
      avg: parseFloat(result[0].avg),
      count: result[0].count
    };
  } catch (error) {
    logger.error('Errore recupero statistiche sensore:', error);
    return null;
  }
};

/**
 * Ottieni tutti i sensori di un impianto con le ultime letture
 */
export const getImpiantoSensors = async (impiantoId: number): Promise<any[]> => {
  try {
    const [dispositivi]: any = await query(
      `SELECT d.*, s.nome as stanza_nome
       FROM dispositivi d
       LEFT JOIN stanze s ON d.stanza_id = s.id
       WHERE d.impianto_id = ? AND d.tipo_dispositivo IN ('sensor', 'dht22', 'dht11', 'bme280', 'bmp280')`,
      [impiantoId]
    );

    const sensorsWithReadings = await Promise.all(
      dispositivi.map(async (d: any) => {
        const readings = await getLatestReadings(d.id);
        return {
          ...d,
          readings
        };
      })
    );

    return sensorsWithReadings;
  } catch (error) {
    logger.error('Errore recupero sensori impianto:', error);
    return [];
  }
};

/**
 * Ottieni dati aggregati per grafici (media oraria)
 */
export const getHourlyAggregates = async (
  dispositivoId: number,
  sensorType: string,
  days: number = 7
): Promise<any[]> => {
  try {
    const [data]: any = await query(
      `SELECT
         DATE(created_at) as date,
         HOUR(created_at) as hour,
         AVG(value) as avg_value,
         MIN(value) as min_value,
         MAX(value) as max_value
       FROM sensor_readings
       WHERE dispositivo_id = ? AND sensor_type = ?
       AND created_at > DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY DATE(created_at), HOUR(created_at)
       ORDER BY date ASC, hour ASC`,
      [dispositivoId, sensorType, days]
    );
    return data;
  } catch (error) {
    logger.error('Errore recupero aggregati orari:', error);
    return [];
  }
};

/**
 * Ottieni dati aggregati giornalieri
 */
export const getDailyAggregates = async (
  dispositivoId: number,
  sensorType: string,
  days: number = 30
): Promise<any[]> => {
  try {
    const [data]: any = await query(
      `SELECT
         DATE(created_at) as date,
         AVG(value) as avg_value,
         MIN(value) as min_value,
         MAX(value) as max_value,
         COUNT(*) as readings_count
       FROM sensor_readings
       WHERE dispositivo_id = ? AND sensor_type = ?
       AND created_at > DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      [dispositivoId, sensorType, days]
    );
    return data;
  } catch (error) {
    logger.error('Errore recupero aggregati giornalieri:', error);
    return [];
  }
};

/**
 * Pulizia vecchie letture (retention policy)
 */
export const cleanOldReadings = async (retentionDays: number = 90): Promise<number> => {
  try {
    const result: any = await query(
      `DELETE FROM sensor_readings
       WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [retentionDays]
    );
    logger.info(`Pulizia sensori: ${result.affectedRows} letture rimosse`);
    return result.affectedRows;
  } catch (error) {
    logger.error('Errore pulizia letture sensore:', error);
    return 0;
  }
};

/**
 * Processa dati telemetry da Tasmota (DHT22, BME280, etc.)
 */
export const processTasmotaTelemetry = async (topic: string, payload: any): Promise<void> => {
  try {
    // Estrai nome dispositivo dal topic (es. tele/device_name/SENSOR -> device_name)
    const topicParts = topic.split('/');
    if (topicParts.length < 3 || topicParts[0] !== 'tele') {
      return;
    }

    const deviceTopic = topicParts[1];

    // Trova il dispositivo
    const [dispositivi]: any = await query(
      'SELECT id FROM dispositivi WHERE topic_mqtt = ?',
      [deviceTopic]
    );

    if (dispositivi.length === 0) {
      logger.debug(`Dispositivo non trovato per topic: ${deviceTopic}`);
      return;
    }

    const dispositivoId = dispositivi[0].id;

    // Processa i dati del sensore
    const readings: SensorReading[] = [];

    // DHT22 / DHT11
    if (payload.DHT22 || payload.DHT11 || payload.AM2301) {
      const dht = payload.DHT22 || payload.DHT11 || payload.AM2301;
      if (dht.Temperature !== undefined) {
        readings.push({
          dispositivo_id: dispositivoId,
          sensor_type: 'temperature',
          value: dht.Temperature,
          unit: '°C'
        });
      }
      if (dht.Humidity !== undefined) {
        readings.push({
          dispositivo_id: dispositivoId,
          sensor_type: 'humidity',
          value: dht.Humidity,
          unit: '%'
        });
      }
    }

    // BME280 / BMP280
    if (payload.BME280 || payload.BMP280) {
      const bme = payload.BME280 || payload.BMP280;
      if (bme.Temperature !== undefined) {
        readings.push({
          dispositivo_id: dispositivoId,
          sensor_type: 'temperature',
          value: bme.Temperature,
          unit: '°C'
        });
      }
      if (bme.Humidity !== undefined) {
        readings.push({
          dispositivo_id: dispositivoId,
          sensor_type: 'humidity',
          value: bme.Humidity,
          unit: '%'
        });
      }
      if (bme.Pressure !== undefined) {
        readings.push({
          dispositivo_id: dispositivoId,
          sensor_type: 'pressure',
          value: bme.Pressure,
          unit: 'hPa'
        });
      }
    }

    // DS18B20 (Temperature only)
    if (payload.DS18B20) {
      if (payload.DS18B20.Temperature !== undefined) {
        readings.push({
          dispositivo_id: dispositivoId,
          sensor_type: 'temperature',
          value: payload.DS18B20.Temperature,
          unit: '°C'
        });
      }
    }

    // Salva le letture
    if (readings.length > 0) {
      await saveSensorReadings(readings);
      logger.debug(`Salvate ${readings.length} letture per ${deviceTopic}`);
    }
  } catch (error) {
    logger.error('Errore processamento telemetry:', error);
  }
};

export default {
  saveSensorReading,
  saveSensorReadings,
  getLatestReadings,
  getSensorHistory,
  getSensorStats,
  getImpiantoSensors,
  getHourlyAggregates,
  getDailyAggregates,
  cleanOldReadings,
  processTasmotaTelemetry
};
