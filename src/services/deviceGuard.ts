import { query } from '../config/database';

// ============================================
// DEVICE GUARD SERVICE
// Servizio centralizzato per proteggere i dispositivi
// TUTTE le richieste di controllo devono passare da qui
// ============================================

export interface DeviceGuardResult {
  allowed: boolean;
  reason?: string;
  device?: any;
}

/**
 * Verifica se un dispositivo può essere controllato (per ID)
 */
export const canControlDeviceById = async (deviceId: number): Promise<DeviceGuardResult> => {
  try {
    const dispositivi: any = await query(
      'SELECT id, nome, bloccato, stato, topic_mqtt FROM dispositivi WHERE id = ?',
      [deviceId]
    );

    if (dispositivi.length === 0) {
      return {
        allowed: false,
        reason: 'Dispositivo non trovato'
      };
    }

    const device = dispositivi[0];

    // CHECK 1: Dispositivo bloccato
    if (device.bloccato) {
      console.log(`🔒 GUARD: Device ${device.nome} (ID: ${deviceId}) è BLOCCATO - comando rifiutato`);
      return {
        allowed: false,
        reason: `Dispositivo "${device.nome}" è bloccato. Sbloccalo prima di poterlo controllare.`,
        device
      };
    }

    // CHECK 2: Dispositivo offline (opzionale - potrebbe comunque ricevere comandi)
    // if (device.stato !== 'online') {
    //   return {
    //     allowed: false,
    //     reason: `Dispositivo "${device.nome}" è offline`,
    //     device
    //   };
    // }

    console.log(`✅ GUARD: Device ${device.nome} (ID: ${deviceId}) - comando autorizzato`);
    return {
      allowed: true,
      device
    };
  } catch (error) {
    console.error('❌ GUARD Error:', error);
    return {
      allowed: false,
      reason: 'Errore durante la verifica del dispositivo'
    };
  }
};

/**
 * Verifica se un dispositivo può essere controllato (per MQTT Topic)
 */
export const canControlDeviceByTopic = async (topicMqtt: string): Promise<DeviceGuardResult> => {
  try {
    const dispositivi: any = await query(
      'SELECT id, nome, bloccato, stato, topic_mqtt FROM dispositivi WHERE topic_mqtt = ?',
      [topicMqtt]
    );

    if (dispositivi.length === 0) {
      // Device non trovato nel DB - potrebbe essere un device non registrato
      // In questo caso permettiamo il comando (backward compatibility)
      console.log(`⚠️ GUARD: Device con topic ${topicMqtt} non trovato nel DB - permesso per compatibilità`);
      return {
        allowed: true,
        reason: 'Device non registrato'
      };
    }

    const device = dispositivi[0];

    // CHECK 1: Dispositivo bloccato
    if (device.bloccato) {
      console.log(`🔒 GUARD: Device ${device.nome} (Topic: ${topicMqtt}) è BLOCCATO - comando rifiutato`);
      return {
        allowed: false,
        reason: `Dispositivo "${device.nome}" è bloccato`,
        device
      };
    }

    console.log(`✅ GUARD: Device ${device.nome} (Topic: ${topicMqtt}) - comando autorizzato`);
    return {
      allowed: true,
      device
    };
  } catch (error) {
    console.error('❌ GUARD Error:', error);
    return {
      allowed: false,
      reason: 'Errore durante la verifica del dispositivo'
    };
  }
};

/**
 * Esegue un comando su un dispositivo (con guard integrato)
 * Questa è la funzione PRINCIPALE che deve essere usata ovunque
 */
export const executeDeviceCommand = async (
  deviceId: number | null,
  topicMqtt: string | null,
  comando: 'ON' | 'OFF' | 'TOGGLE'
): Promise<{ success: boolean; message: string; blocked?: boolean; device?: any }> => {

  // Verifica tramite guard
  let guardResult: DeviceGuardResult;

  if (deviceId) {
    guardResult = await canControlDeviceById(deviceId);
  } else if (topicMqtt) {
    guardResult = await canControlDeviceByTopic(topicMqtt);
  } else {
    return {
      success: false,
      message: 'ID dispositivo o topic MQTT richiesto'
    };
  }

  // Se non autorizzato, ritorna errore
  if (!guardResult.allowed) {
    return {
      success: false,
      message: guardResult.reason || 'Controllo non autorizzato',
      blocked: true,
      device: guardResult.device
    };
  }

  // Dispositivo autorizzato - procedi con il comando
  return {
    success: true,
    message: 'Comando autorizzato',
    device: guardResult.device
  };
};
