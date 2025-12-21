import * as cron from 'node-cron';
import { query } from '../config/database';
import { RowDataPacket } from 'mysql2';
import logger from '../config/logger';

// ============================================
// SCENE SCHEDULER SERVICE
// ============================================

interface ScheduleConfig {
  enabled: boolean;
  time: string; // HH:mm format (es. "18:30")
  days?: number[]; // 0-6 (domenica-sabato)
  mode?: 'daily' | 'weekly' | 'once';
  date?: string; // YYYY-MM-DD per mode='once'
}

// Map per tenere traccia dei cron jobs attivi
const activeJobs = new Map<number, ReturnType<typeof cron.schedule>>();

// Esegui una scena
const executeScene = async (scenaId: number) => {
  try {
    const [scene]: any = await query('SELECT * FROM scene WHERE id = ?', [scenaId]);

    if (scene.length === 0) {
      logger.warn(`Scena ${scenaId} non trovata per scheduling`);
      return;
    }

    const scena = scene[0];
    const azioni = JSON.parse(scena.azioni || '[]');

    logger.info(`Esecuzione scena schedulata: ${scena.nome} (${scenaId})`);

    // Esegui le azioni della scena
    const mqtt = require('../config/mqtt');

    for (const azione of azioni) {
      const topic = `${azione.topic}/cmnd/POWER`;
      const payload = azione.stato === 'ON' ? 'ON' : 'OFF';
      mqtt.client.publish(topic, payload);
      logger.info(`MQTT: ${topic} -> ${payload}`);
    }
  } catch (error: any) {
    logger.error(`Errore esecuzione scena schedulata ${scenaId}:`, error.message);
  }
};

// Carica e schedula una singola scena
const scheduleScene = (scenaId: number, config: ScheduleConfig) => {
  // Ferma il job esistente se presente
  if (activeJobs.has(scenaId)) {
    activeJobs.get(scenaId)!.stop();
    activeJobs.delete(scenaId);
  }

  if (!config.enabled) {
    logger.info(`Scheduling disabilitato per scena ${scenaId}`);
    return;
  }

  // Converti HH:mm in cron format
  const [hour, minute] = config.time.split(':');

  let cronExpression = '';

  if (config.mode === 'daily') {
    // Ogni giorno alla stessa ora
    cronExpression = `${minute} ${hour} * * *`;
  } else if (config.mode === 'weekly') {
    // Giorni specifici della settimana
    const days = config.days?.join(',') || '*';
    cronExpression = `${minute} ${hour} * * ${days}`;
  } else if (config.mode === 'once' && config.date) {
    // Una tantum a una data specifica
    const [year, month, day] = config.date.split('-');
    cronExpression = `${minute} ${hour} ${day} ${month} *`;
  } else {
    logger.warn(`Configurazione scheduling non valida per scena ${scenaId}`);
    return;
  }

  // Valida cron expression
  if (!cron.validate(cronExpression)) {
    logger.error(`Cron expression non valida: ${cronExpression}`);
    return;
  }

  // Crea il job
  const task = cron.schedule(cronExpression, () => {
    logger.info(`Trigger scena schedulata: ${scenaId}`);
    executeScene(scenaId);
  });

  activeJobs.set(scenaId, task);
  logger.info(`Scena ${scenaId} schedulata: ${cronExpression}`);
};

// Carica tutti gli scheduling dal database
export const loadAllSchedules = async () => {
  try {
    const [scene]: any = await query(
      'SELECT id, nome, scheduling FROM scene WHERE scheduling IS NOT NULL'
    );

    logger.info(`Caricamento ${scene.length} scene con scheduling attivo`);

    for (const scena of scene) {
      try {
        const config = JSON.parse(scena.scheduling) as ScheduleConfig;
        scheduleScene(scena.id, config);
      } catch (error: any) {
        logger.error(`Errore parsing scheduling per scena ${scena.id}:`, error.message);
      }
    }
  } catch (error: any) {
    logger.error('Errore caricamento schedules:', error.message);
  }
};

// Ricarica lo scheduling per una scena specifica
export const reloadSchedule = async (scenaId: number) => {
  try {
    const [scene]: any = await query(
      'SELECT scheduling FROM scene WHERE id = ?',
      [scenaId]
    );

    if (scene.length === 0 || !scene[0].scheduling) {
      // Ferma il job se non c'è più scheduling
      if (activeJobs.has(scenaId)) {
        activeJobs.get(scenaId)!.stop();
        activeJobs.delete(scenaId);
        logger.info(`Scheduling rimosso per scena ${scenaId}`);
      }
      return;
    }

    const config = JSON.parse(scene[0].scheduling) as ScheduleConfig;
    scheduleScene(scenaId, config);
  } catch (error: any) {
    logger.error(`Errore reload schedule per scena ${scenaId}:`, error.message);
  }
};

// Ferma tutti i jobs
export const stopAllSchedules = () => {
  activeJobs.forEach((task, scenaId) => {
    task.stop();
    logger.info(`Job fermato per scena ${scenaId}`);
  });
  activeJobs.clear();
};

export default {
  loadAllSchedules,
  reloadSchedule,
  stopAllSchedules
};
