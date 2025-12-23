import * as cron from 'node-cron';
import { query } from '../config/database';
import { RowDataPacket } from 'mysql2';
import logger from '../config/logger';
import { getSunTimesForImpianto, formatTime } from './sunCalculator';

// ============================================
// SCENE SCHEDULER SERVICE
// Con supporto per alba/tramonto
// ============================================

interface ScheduleConfig {
  enabled: boolean;
  time?: string; // HH:mm format (es. "18:30") - opzionale per mode sun
  days?: number[]; // 0-6 (domenica-sabato)
  mode?: 'daily' | 'weekly' | 'once' | 'sunrise' | 'sunset';
  date?: string; // YYYY-MM-DD per mode='once'
  sunOffset?: number; // Offset in minuti per sunrise/sunset (es. -30 = 30 min prima)
}

// Map per tenere traccia dei cron jobs attivi
const activeJobs = new Map<number, ReturnType<typeof cron.schedule>>();

// Map per scene con scheduling alba/tramonto (richiedono ricalcolo giornaliero)
const sunJobs = new Map<number, { config: ScheduleConfig; impiantoId: number; timeoutId?: NodeJS.Timeout }>();

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

// Schedula una scena per alba/tramonto
const scheduleSunScene = async (scenaId: number, config: ScheduleConfig, impiantoId: number) => {
  // Cancella timeout esistente
  const existing = sunJobs.get(scenaId);
  if (existing?.timeoutId) {
    clearTimeout(existing.timeoutId);
  }

  if (!config.enabled) {
    sunJobs.delete(scenaId);
    logger.info(`Scheduling sole disabilitato per scena ${scenaId}`);
    return;
  }

  // Ottieni orari alba/tramonto per oggi
  const sunTimes = await getSunTimesForImpianto(impiantoId);
  if (!sunTimes) {
    logger.warn(`Impossibile ottenere orari sole per impianto ${impiantoId}`);
    return;
  }

  // Calcola l'orario target
  const now = new Date();
  let targetTime: Date;

  if (config.mode === 'sunrise') {
    targetTime = new Date(sunTimes.sunrise);
  } else if (config.mode === 'sunset') {
    targetTime = new Date(sunTimes.sunset);
  } else {
    return;
  }

  // Applica offset
  if (config.sunOffset) {
    targetTime.setMinutes(targetTime.getMinutes() + config.sunOffset);
  }

  // Se il giorno non è incluso, non schedulare
  if (config.days && config.days.length > 0) {
    const currentDay = now.getDay();
    if (!config.days.includes(currentDay)) {
      logger.info(`Scena ${scenaId} non schedulata oggi (giorno ${currentDay} non incluso)`);
      // Schedula per domani a mezzanotte per ricalcolare
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 1, 0, 0);
      const msUntilTomorrow = tomorrow.getTime() - now.getTime();

      const timeoutId = setTimeout(() => {
        scheduleSunScene(scenaId, config, impiantoId);
      }, msUntilTomorrow);

      sunJobs.set(scenaId, { config, impiantoId, timeoutId });
      return;
    }
  }

  // Calcola ms fino all'orario target
  const msUntilTarget = targetTime.getTime() - now.getTime();

  if (msUntilTarget < 0) {
    // L'orario è già passato oggi, schedula per domani
    logger.info(`Scena ${scenaId}: ${config.mode} già passato oggi (${formatTime(targetTime)})`);

    // Ricalcola domani a mezzanotte
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 1, 0, 0);
    const msUntilTomorrow = tomorrow.getTime() - now.getTime();

    const timeoutId = setTimeout(() => {
      scheduleSunScene(scenaId, config, impiantoId);
    }, msUntilTomorrow);

    sunJobs.set(scenaId, { config, impiantoId, timeoutId });
    return;
  }

  // Schedula l'esecuzione
  logger.info(`Scena ${scenaId} schedulata per ${config.mode} alle ${formatTime(targetTime)} (tra ${Math.round(msUntilTarget / 60000)} min)`);

  const timeoutId = setTimeout(async () => {
    logger.info(`Trigger scena ${config.mode}: ${scenaId}`);
    await executeScene(scenaId);

    // Ricalcola per domani
    const nextDay = new Date();
    nextDay.setDate(nextDay.getDate() + 1);
    nextDay.setHours(0, 1, 0, 0);
    const msUntilNextDay = nextDay.getTime() - Date.now();

    setTimeout(() => {
      scheduleSunScene(scenaId, config, impiantoId);
    }, msUntilNextDay);
  }, msUntilTarget);

  sunJobs.set(scenaId, { config, impiantoId, timeoutId });
};

// Carica e schedula una singola scena
const scheduleScene = async (scenaId: number, config: ScheduleConfig, impiantoId?: number) => {
  // Ferma il job esistente se presente
  if (activeJobs.has(scenaId)) {
    activeJobs.get(scenaId)!.stop();
    activeJobs.delete(scenaId);
  }

  // Cancella sun job esistente
  const existingSun = sunJobs.get(scenaId);
  if (existingSun?.timeoutId) {
    clearTimeout(existingSun.timeoutId);
    sunJobs.delete(scenaId);
  }

  if (!config.enabled) {
    logger.info(`Scheduling disabilitato per scena ${scenaId}`);
    return;
  }

  // Gestisci mode sunrise/sunset
  if (config.mode === 'sunrise' || config.mode === 'sunset') {
    if (!impiantoId) {
      logger.warn(`Scena ${scenaId}: scheduling sunrise/sunset richiede impiantoId`);
      return;
    }
    await scheduleSunScene(scenaId, config, impiantoId);
    return;
  }

  // Mode standard: richiede time
  if (!config.time) {
    logger.warn(`Configurazione scheduling non valida per scena ${scenaId}: time richiesto`);
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
      'SELECT id, nome, impianto_id, scheduling FROM scene WHERE scheduling IS NOT NULL'
    );

    logger.info(`Caricamento ${scene.length} scene con scheduling attivo`);

    for (const scena of scene) {
      try {
        const config = JSON.parse(scena.scheduling) as ScheduleConfig;
        await scheduleScene(scena.id, config, scena.impianto_id);
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
      'SELECT impianto_id, scheduling FROM scene WHERE id = ?',
      [scenaId]
    );

    if (scene.length === 0 || !scene[0].scheduling) {
      // Ferma il job se non c'è più scheduling
      if (activeJobs.has(scenaId)) {
        activeJobs.get(scenaId)!.stop();
        activeJobs.delete(scenaId);
        logger.info(`Scheduling rimosso per scena ${scenaId}`);
      }
      // Ferma anche sun job se presente
      const sunJob = sunJobs.get(scenaId);
      if (sunJob?.timeoutId) {
        clearTimeout(sunJob.timeoutId);
        sunJobs.delete(scenaId);
        logger.info(`Sun scheduling rimosso per scena ${scenaId}`);
      }
      return;
    }

    const config = JSON.parse(scene[0].scheduling) as ScheduleConfig;
    await scheduleScene(scenaId, config, scene[0].impianto_id);
  } catch (error: any) {
    logger.error(`Errore reload schedule per scena ${scenaId}:`, error.message);
  }
};

// Ferma tutti i jobs
export const stopAllSchedules = () => {
  // Ferma cron jobs
  activeJobs.forEach((task, scenaId) => {
    task.stop();
    logger.info(`Job fermato per scena ${scenaId}`);
  });
  activeJobs.clear();

  // Ferma sun timeouts
  sunJobs.forEach((job, scenaId) => {
    if (job.timeoutId) {
      clearTimeout(job.timeoutId);
      logger.info(`Sun job fermato per scena ${scenaId}`);
    }
  });
  sunJobs.clear();
};

// Ottieni statistiche sugli scheduling attivi
export const getScheduleStats = () => {
  return {
    cronJobs: activeJobs.size,
    sunJobs: sunJobs.size,
    total: activeJobs.size + sunJobs.size
  };
};

export default {
  loadAllSchedules,
  reloadSchedule,
  stopAllSchedules,
  getScheduleStats
};
