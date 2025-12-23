import { query } from '../config/database';
import { RowDataPacket } from 'mysql2';
import logger from '../config/logger';
import { getSunTimesForImpianto, isSunConditionMet } from './sunCalculator';

// ============================================
// CONDITIONS ENGINE SERVICE
// Con supporto per alba/tramonto
// ============================================

interface Condition {
  type: 'time' | 'weekday' | 'date' | 'sun';
  operator?: 'before' | 'after' | 'between' | 'equals';
  value?: string | number;
  value2?: string | number; // Per operator 'between'
  sunCondition?: 'sunrise' | 'sunset' | 'day' | 'night' | 'golden_hour';
  sunOffset?: number; // Offset in minuti (es. -30 = 30 minuti prima)
}

interface ConditionalScene {
  conditions: Condition[];
  mode: 'all' | 'any'; // all = AND, any = OR
  impiantoId?: number; // Necessario per condizioni basate sul sole
}

// Cache per i sun times (per evitare query ripetute)
let sunTimesCache: Map<number, { times: any; timestamp: number }> = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 ora

// Ottieni sun times con cache
const getCachedSunTimes = async (impiantoId: number) => {
  const cached = sunTimesCache.get(impiantoId);
  const now = Date.now();

  if (cached && (now - cached.timestamp) < CACHE_TTL) {
    return cached.times;
  }

  const times = await getSunTimesForImpianto(impiantoId);
  if (times) {
    sunTimesCache.set(impiantoId, { times, timestamp: now });
  }
  return times;
};

// Valuta una singola condizione
const evaluateCondition = (condition: Condition): boolean => {
  const now = new Date();

  switch (condition.type) {
    case 'time': {
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

      if (condition.operator === 'before') {
        return currentTime < (condition.value as string);
      } else if (condition.operator === 'after') {
        return currentTime > (condition.value as string);
      } else if (condition.operator === 'between' && condition.value2) {
        return currentTime >= (condition.value as string) && currentTime <= (condition.value2 as string);
      } else if (condition.operator === 'equals') {
        return currentTime === (condition.value as string);
      }
      return false;
    }

    case 'weekday': {
      const currentDay = now.getDay(); // 0-6 (domenica = 0)

      if (condition.operator === 'equals') {
        return currentDay === (condition.value as number);
      }
      return false;
    }

    case 'date': {
      const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD

      if (condition.operator === 'equals') {
        return currentDate === (condition.value as string);
      } else if (condition.operator === 'before') {
        return currentDate < (condition.value as string);
      } else if (condition.operator === 'after') {
        return currentDate > (condition.value as string);
      }
      return false;
    }

    // Sun condition viene gestita separatamente con async
    case 'sun':
      return false; // Placeholder, gestito in evaluateSunCondition

    default:
      return false;
  }
};

// Valuta condizione basata sul sole (async)
const evaluateSunCondition = async (condition: Condition, impiantoId: number): Promise<boolean> => {
  if (condition.type !== 'sun' || !condition.sunCondition) {
    return false;
  }

  const sunTimes = await getCachedSunTimes(impiantoId);
  if (!sunTimes) {
    logger.warn(`Sun times non disponibili per impianto ${impiantoId}`);
    return false;
  }

  return isSunConditionMet(sunTimes, condition.sunCondition, condition.sunOffset || 0);
};

// Valuta tutte le condizioni di una scena (versione sync - senza sun)
export const evaluateConditions = (config: ConditionalScene): boolean => {
  if (!config.conditions || config.conditions.length === 0) {
    return false;
  }

  // Filtra le condizioni non-sun per valutazione sync
  const nonSunConditions = config.conditions.filter(c => c.type !== 'sun');
  const results = nonSunConditions.map(evaluateCondition);

  if (config.mode === 'all') {
    return results.every(r => r === true);
  } else {
    return results.some(r => r === true);
  }
};

// Valuta tutte le condizioni di una scena (versione async - con sun)
export const evaluateConditionsAsync = async (config: ConditionalScene): Promise<boolean> => {
  if (!config.conditions || config.conditions.length === 0) {
    return false;
  }

  const results: boolean[] = [];

  for (const condition of config.conditions) {
    if (condition.type === 'sun') {
      // Condizione sole - richiede impiantoId
      if (!config.impiantoId) {
        logger.warn('Condizione sun senza impiantoId');
        results.push(false);
      } else {
        const sunResult = await evaluateSunCondition(condition, config.impiantoId);
        results.push(sunResult);
      }
    } else {
      // Altre condizioni - valutazione sync
      results.push(evaluateCondition(condition));
    }
  }

  if (config.mode === 'all') {
    return results.every(r => r === true);
  } else {
    return results.some(r => r === true);
  }
};

// Esegui una scena
const executeScene = async (scenaId: number) => {
  try {
    const [scene]: any = await query('SELECT * FROM scene WHERE id = ?', [scenaId]);

    if (scene.length === 0) {
      logger.warn(`Scena ${scenaId} non trovata per esecuzione condizionale`);
      return;
    }

    const scena = scene[0];
    const azioni = JSON.parse(scena.azioni || '[]');

    logger.info(`Esecuzione scena condizionale: ${scena.nome} (${scenaId})`);

    // Esegui le azioni della scena
    const mqtt = require('../config/mqtt');

    for (const azione of azioni) {
      const topic = `${azione.topic}/cmnd/POWER`;
      const payload = azione.stato === 'ON' ? 'ON' : 'OFF';
      mqtt.client.publish(topic, payload);
      logger.info(`MQTT: ${topic} -> ${payload}`);
    }
  } catch (error: any) {
    logger.error(`Errore esecuzione scena condizionale ${scenaId}:`, error.message);
  }
};

// Controlla tutte le scene con condizioni (eseguito ogni minuto)
export const checkConditionalScenes = async () => {
  try {
    const [scene]: any = await query(
      'SELECT id, nome, impianto_id, conditions FROM scene WHERE conditions IS NOT NULL'
    );

    for (const scena of scene) {
      try {
        const config = JSON.parse(scena.conditions) as ConditionalScene;

        // Aggiungi impiantoId per supportare condizioni sun
        config.impiantoId = scena.impianto_id;

        // Usa la versione async per supportare condizioni sun
        const conditionsMet = await evaluateConditionsAsync(config);

        if (conditionsMet) {
          logger.info(`Condizioni soddisfatte per scena: ${scena.nome} (${scena.id})`);
          await executeScene(scena.id);
        }
      } catch (error: any) {
        logger.error(`Errore parsing conditions per scena ${scena.id}:`, error.message);
      }
    }
  } catch (error: any) {
    logger.error('Errore check conditional scenes:', error.message);
  }
};

export default {
  evaluateConditions,
  evaluateConditionsAsync,
  checkConditionalScenes
};
