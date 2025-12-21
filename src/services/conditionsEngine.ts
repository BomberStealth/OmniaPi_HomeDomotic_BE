import { query } from '../config/database';
import { RowDataPacket } from 'mysql2';
import logger from '../config/logger';

// ============================================
// CONDITIONS ENGINE SERVICE
// ============================================

interface Condition {
  type: 'time' | 'weekday' | 'date';
  operator?: 'before' | 'after' | 'between' | 'equals';
  value?: string | number;
  value2?: string | number; // Per operator 'between'
}

interface ConditionalScene {
  conditions: Condition[];
  mode: 'all' | 'any'; // all = AND, any = OR
}

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

    default:
      return false;
  }
};

// Valuta tutte le condizioni di una scena
export const evaluateConditions = (config: ConditionalScene): boolean => {
  if (!config.conditions || config.conditions.length === 0) {
    return false;
  }

  const results = config.conditions.map(evaluateCondition);

  if (config.mode === 'all') {
    // AND: tutte le condizioni devono essere vere
    return results.every(r => r === true);
  } else {
    // OR: almeno una condizione deve essere vera
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
      'SELECT id, nome, conditions FROM scene WHERE conditions IS NOT NULL'
    );

    for (const scena of scene) {
      try {
        const config = JSON.parse(scena.conditions) as ConditionalScene;

        if (evaluateConditions(config)) {
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
  checkConditionalScenes
};
