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
 * Verifica se un dispositivo è raggiungibile via HTTP
 * Timeout aumentato a 5 secondi per dispositivi lenti
 * Ritorna anche lo stato power se disponibile
 */
interface ReachabilityResult {
  reachable: boolean;
  powerState?: boolean;
}

const checkDeviceReachable = async (ipAddress: string): Promise<ReachabilityResult> => {
  if (!ipAddress) return { reachable: false };

  try {
    const response = await fetch(`http://${ipAddress}/cm?cmnd=Status%200`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000) // 5 secondi timeout
    });

    if (!response.ok) {
      return { reachable: false };
    }

    // Prova a leggere lo stato power dalla risposta
    try {
      const data: any = await response.json();
      const powerState = data?.Status?.Power === 1 ||
                        data?.StatusSTS?.POWER === 'ON' ||
                        data?.StatusSTS?.POWER1 === 'ON';
      return { reachable: true, powerState };
    } catch {
      return { reachable: true };
    }
  } catch (error) {
    // Dispositivo non raggiungibile
    return { reachable: false };
  }
};

/**
 * Aggiorna lo stato del dispositivo nel database
 */
const updateDeviceStatus = async (deviceId: number, stato: 'online' | 'offline'): Promise<void> => {
  try {
    await query('UPDATE dispositivi SET stato = ? WHERE id = ?', [stato, deviceId]);
  } catch (error) {
    console.error('Errore aggiornamento stato dispositivo:', error);
  }
};

/**
 * Verifica se un dispositivo può essere controllato (per ID)
 */
export const canControlDeviceById = async (deviceId: number): Promise<DeviceGuardResult> => {
  try {
    const dispositivi: any = await query(
      'SELECT id, nome, bloccato, stato, topic_mqtt, ip_address FROM dispositivi WHERE id = ?',
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

    // CHECK 2: Verifica raggiungibilità REALE via HTTP (se ha IP)
    if (device.ip_address) {
      const reachability = await checkDeviceReachable(device.ip_address);
      if (!reachability.reachable) {
        // Aggiorna stato nel DB
        await updateDeviceStatus(deviceId, 'offline');
        console.log(`🔒 GUARD: Device ${device.nome} (ID: ${deviceId}) non raggiungibile (IP: ${device.ip_address}) - comando rifiutato`);
        return {
          allowed: false,
          reason: `Dispositivo "${device.nome}" non raggiungibile`,
          device: { ...device, stato: 'offline' }
        };
      }
      // Se raggiungibile, aggiorna stato a online e power_state se disponibile
      if (device.stato !== 'online') {
        await updateDeviceStatus(deviceId, 'online');
      }
      // Aggiorna power_state se abbiamo il dato
      if (reachability.powerState !== undefined) {
        await query('UPDATE dispositivi SET power_state = ? WHERE id = ?', [reachability.powerState, deviceId]);
        device.power_state = reachability.powerState;
      }
    }
    // NOTA: Se non ha IP, permettiamo comunque il comando (potrebbe usare MQTT)

    console.log(`✅ GUARD: Device ${device.nome} (ID: ${deviceId}) - comando autorizzato`);
    return {
      allowed: true,
      device: { ...device, stato: 'online' }
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
      'SELECT id, nome, bloccato, stato, topic_mqtt, ip_address FROM dispositivi WHERE topic_mqtt = ?',
      [topicMqtt]
    );

    if (dispositivi.length === 0) {
      // Device non trovato nel DB - blocca per sicurezza
      console.log(`🔒 GUARD: Device con topic ${topicMqtt} non trovato nel DB - comando rifiutato`);
      return {
        allowed: false,
        reason: 'Dispositivo non trovato nel database'
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

    // CHECK 2: Verifica raggiungibilità REALE via HTTP (se ha IP)
    if (device.ip_address) {
      const reachability = await checkDeviceReachable(device.ip_address);
      if (!reachability.reachable) {
        // Aggiorna stato nel DB
        await updateDeviceStatus(device.id, 'offline');
        console.log(`🔒 GUARD: Device ${device.nome} (Topic: ${topicMqtt}) non raggiungibile (IP: ${device.ip_address}) - comando rifiutato`);
        return {
          allowed: false,
          reason: `Dispositivo "${device.nome}" non raggiungibile`,
          device: { ...device, stato: 'offline' }
        };
      }
      // Se raggiungibile, aggiorna stato a online e power_state se disponibile
      if (device.stato !== 'online') {
        await updateDeviceStatus(device.id, 'online');
      }
      if (reachability.powerState !== undefined) {
        await query('UPDATE dispositivi SET power_state = ? WHERE id = ?', [reachability.powerState, device.id]);
        device.power_state = reachability.powerState;
      }
    }
    // NOTA: Se non ha IP, permettiamo comunque il comando (potrebbe usare MQTT)

    console.log(`✅ GUARD: Device ${device.nome} (Topic: ${topicMqtt}) - comando autorizzato`);
    return {
      allowed: true,
      device: { ...device, stato: 'online' }
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
