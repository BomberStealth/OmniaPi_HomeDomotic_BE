import { Request, Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { reloadSchedule, getScheduleStats } from '../services/sceneScheduler';
import { canControlDeviceById, canControlDeviceByTopic } from '../services/deviceGuard';
import { omniapiCommand } from '../config/mqtt';
import { getSunTimesForImpianto, getUpcomingSunTimes, formatTime } from '../services/sunCalculator';
import * as notificationService from '../services/notificationService';
import { emitScenaUpdate, emitDispositivoUpdate, emitOmniapiNodeUpdate } from '../socket';
import { getNode } from '../services/omniapiState';

// ============================================
// SCENE CONTROLLER
// ============================================

// GET tutte le scene di un impianto
export const getScene = async (req: AuthRequest, res: Response) => {
  try {
    const { impiantoId } = req.params;

    // Verifica che l'utente abbia accesso all'impianto
    const [impianti]: any = await query(
      `SELECT i.* FROM impianti i
       LEFT JOIN impianti_condivisi ic ON i.id = ic.impianto_id
       WHERE i.id = ? AND (i.utente_id = ? OR ic.utente_id = ?)`,
      [impiantoId, req.user!.userId, req.user!.userId]
    );

    if (impianti.length === 0) {
      return res.status(404).json({ error: 'Impianto non trovato' });
    }

    const scene: any = await query(
      'SELECT * FROM scene WHERE impianto_id = ? ORDER BY is_base DESC, creato_il ASC',
      [impiantoId]
    );

    // La query ritorna già un array
    res.json(scene);
  } catch (error) {
    console.error('Errore get scene:', error);
    res.status(500).json({ error: 'Errore durante il recupero delle scene' });
  }
};

// POST crea nuova scena
export const createScena = async (req: AuthRequest, res: Response) => {
  try {
    const { impiantoId } = req.params;
    const { nome, icona, azioni, scheduling, conditions } = req.body;

    if (!nome || !azioni || !Array.isArray(azioni)) {
      return res.status(400).json({ error: 'Nome e azioni sono richiesti' });
    }

    // Verifica che l'utente abbia accesso all'impianto
    const [impianti]: any = await query(
      `SELECT i.* FROM impianti i
       LEFT JOIN impianti_condivisi ic ON i.id = ic.impianto_id
       WHERE i.id = ? AND (i.utente_id = ? OR ic.utente_id = ?)`,
      [impiantoId, req.user!.userId, req.user!.userId]
    );

    if (impianti.length === 0) {
      return res.status(404).json({ error: 'Impianto non trovato' });
    }

    const result: any = await query(
      'INSERT INTO scene (impianto_id, nome, icona, azioni, scheduling, conditions, is_base) VALUES (?, ?, ?, ?, ?, ?, FALSE)',
      [
        impiantoId,
        nome,
        icona || '⚡',
        JSON.stringify(azioni),
        scheduling ? JSON.stringify(scheduling) : null,
        conditions ? JSON.stringify(conditions) : null
      ]
    );

    const [scena]: any = await query('SELECT * FROM scene WHERE id = ?', [result.insertId]);

    // Ricarica lo scheduling se presente
    if (scheduling) {
      await reloadSchedule(result.insertId);
    }

    // Emit WebSocket event
    emitScenaUpdate(parseInt(impiantoId as string), scena[0], 'created');

    res.status(201).json(scena[0]);
  } catch (error) {
    console.error('Errore create scena:', error);
    res.status(500).json({ error: 'Errore durante la creazione della scena' });
  }
};

// PUT aggiorna scena
export const updateScena = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { nome, icona, azioni, scheduling, conditions } = req.body;

    // Verifica che la scena esista e che l'utente abbia accesso
    const scene: any = await query(
      `SELECT s.* FROM scene s
       JOIN impianti i ON s.impianto_id = i.id
       LEFT JOIN impianti_condivisi ic ON i.id = ic.impianto_id
       WHERE s.id = ? AND (i.utente_id = ? OR ic.utente_id = ?)`,
      [id, req.user!.userId, req.user!.userId]
    );

    if (scene.length === 0) {
      return res.status(404).json({ error: 'Scena non trovata' });
    }

    // Non permettere di modificare le scene base
    if (scene[0].is_base && nome && nome !== scene[0].nome) {
      return res.status(400).json({ error: 'Non puoi modificare il nome delle scene base' });
    }

    await query(
      'UPDATE scene SET nome = ?, icona = ?, azioni = ?, scheduling = ?, conditions = ? WHERE id = ?',
      [
        nome || scene[0].nome,
        icona || scene[0].icona,
        azioni ? JSON.stringify(azioni) : scene[0].azioni,
        scheduling !== undefined ? (scheduling ? JSON.stringify(scheduling) : null) : scene[0].scheduling,
        conditions !== undefined ? (conditions ? JSON.stringify(conditions) : null) : scene[0].conditions,
        id
      ]
    );

    // Ricarica lo scheduling
    await reloadSchedule(parseInt(id));

    const scenaAggiornata: any = await query('SELECT * FROM scene WHERE id = ?', [id]);

    // Emit WebSocket event
    emitScenaUpdate(scenaAggiornata[0].impianto_id, scenaAggiornata[0], 'updated');

    res.json(scenaAggiornata[0]);
  } catch (error) {
    console.error('Errore update scena:', error);
    res.status(500).json({ error: 'Errore durante l\'aggiornamento della scena' });
  }
};

// DELETE elimina scena
export const deleteScena = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Verifica che la scena esista e che l'utente abbia accesso
    const scene: any = await query(
      `SELECT s.* FROM scene s
       JOIN impianti i ON s.impianto_id = i.id
       LEFT JOIN impianti_condivisi ic ON i.id = ic.impianto_id
       WHERE s.id = ? AND (i.utente_id = ? OR ic.utente_id = ?)`,
      [id, req.user!.userId, req.user!.userId]
    );

    if (scene.length === 0) {
      return res.status(404).json({ error: 'Scena non trovata' });
    }

    // Non permettere di eliminare le scene base
    if (scene[0].is_base) {
      return res.status(400).json({ error: 'Non puoi eliminare le scene base' });
    }

    const scenaToDelete = scene[0];
    await query('DELETE FROM scene WHERE id = ?', [id]);

    // Emit WebSocket event
    emitScenaUpdate(scenaToDelete.impianto_id, { id: parseInt(id as string), ...scenaToDelete }, 'deleted');

    res.json({ message: 'Scena eliminata con successo' });
  } catch (error) {
    console.error('Errore delete scena:', error);
    res.status(500).json({ error: 'Errore durante l\'eliminazione della scena' });
  }
};

// PUT toggle shortcut
export const toggleShortcut = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { is_shortcut } = req.body;

    // Verifica che la scena esista e che l'utente abbia accesso
    const scene: any = await query(
      `SELECT s.* FROM scene s
       JOIN impianti i ON s.impianto_id = i.id
       LEFT JOIN impianti_condivisi ic ON i.id = ic.impianto_id
       WHERE s.id = ? AND (i.utente_id = ? OR ic.utente_id = ?)`,
      [id, req.user!.userId, req.user!.userId]
    );

    if (scene.length === 0) {
      return res.status(404).json({ error: 'Scena non trovata' });
    }

    await query(
      'UPDATE scene SET is_shortcut = ? WHERE id = ?',
      [is_shortcut, id]
    );

    res.json({ success: true, is_shortcut });
  } catch (error) {
    console.error('Errore toggle shortcut:', error);
    res.status(500).json({ error: 'Errore durante l\'aggiornamento' });
  }
};

// POST esegui scena
export const executeScena = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Verifica che la scena esista e che l'utente abbia accesso
    const scene: any = await query(
      `SELECT s.* FROM scene s
       JOIN impianti i ON s.impianto_id = i.id
       LEFT JOIN impianti_condivisi ic ON i.id = ic.impianto_id
       WHERE s.id = ? AND (i.utente_id = ? OR ic.utente_id = ?)`,
      [id, req.user!.userId, req.user!.userId]
    );

    if (scene.length === 0) {
      return res.status(404).json({ error: 'Scena non trovata' });
    }

    const scena = scene[0];

    // Handle azioni - could be string, object, null, or empty
    let azioni = [];
    try {
      if (typeof scena.azioni === 'string' && scena.azioni.trim()) {
        azioni = JSON.parse(scena.azioni);
      } else if (Array.isArray(scena.azioni)) {
        azioni = scena.azioni;
      }
    } catch (e) {
      console.error('Errore parsing azioni:', e);
      azioni = [];
    }

    if (!Array.isArray(azioni) || azioni.length === 0) {
      return res.json({ message: 'Scena eseguita (nessuna azione configurata)', azioni: 0 });
    }

    // Esegui le azioni della scena (invio comandi MQTT)
    const { getMQTTClient } = require('../config/mqtt');

    let azioniEseguite = 0;
    let azioniBloccate = 0;

    try {
      const mqttClient = getMQTTClient();
      for (const azione of azioni) {
        // ========================================
        // DEVICE GUARD - Verifica centralizzata
        // Preferisce dispositivo_id (più affidabile) o fallback su topic
        // ========================================
        let guardResult;
        let deviceId = azione.dispositivo_id;
        let deviceTopic = azione.topic;

        if (deviceId) {
          // Usa ID dispositivo (più affidabile)
          guardResult = await canControlDeviceById(deviceId);
          // Se abbiamo l'ID, recupera anche il topic_mqtt dal device
          if (guardResult.allowed && guardResult.device) {
            deviceTopic = guardResult.device.topic_mqtt;
          }
        } else if (deviceTopic) {
          // Fallback su topic (legacy)
          guardResult = await canControlDeviceByTopic(deviceTopic);
        } else {
          console.log(`⚠️ GUARD: Azione senza dispositivo_id o topic - saltata`);
          continue;
        }

        if (!guardResult.allowed) {
          console.log(`🔒 GUARD: Device ${deviceId || deviceTopic} - ${guardResult.reason}`);
          azioniBloccate++;
          continue; // Salta questo dispositivo
        }

        const device = guardResult.device;
        const newPowerState = azione.stato === 'ON';

        // Gestisci dispositivi OmniaPi (ESP-NOW)
        if (device?.device_type === 'omniapi_node' && device?.mac_address) {
          const action = newPowerState ? 'on' : 'off';
          omniapiCommand(device.mac_address, 1, action);
          console.log(`📡 Scene OmniaPi: ${device.mac_address} ch1 ${action}`);
          await query('UPDATE dispositivi SET power_state = ? WHERE id = ?', [newPowerState, deviceId]);

          // Emit WebSocket update per OmniaPi node
          const liveNode = getNode(device.mac_address);
          if (liveNode) {
            emitOmniapiNodeUpdate({
              ...liveNode,
              relay1: newPowerState,
            });
          }

          azioniEseguite++;
          continue;
        }

        // Dispositivi Tasmota
        if (!deviceTopic) {
          console.log(`⚠️ GUARD: Topic non trovato per dispositivo ${deviceId} - saltato`);
          continue;
        }

        const topic = `cmnd/${deviceTopic}/POWER`;
        const payload = azione.stato === 'ON' ? 'ON' : 'OFF';
        mqttClient.publish(topic, payload);
        console.log(`📤 Scene MQTT: ${topic} -> ${payload}`);

        // Aggiorna lo stato nel database per sincronizzare l'UI
        if (deviceId) {
          await query(
            'UPDATE dispositivi SET power_state = ? WHERE id = ?',
            [newPowerState, deviceId]
          );
          // Emit WebSocket update per Tasmota
          emitDispositivoUpdate(scena.impianto_id, {
            id: deviceId,
            power_state: newPowerState,
          }, 'state-changed');
        } else {
          await query(
            'UPDATE dispositivi SET power_state = ? WHERE topic_mqtt = ?',
            [newPowerState, deviceTopic]
          );
        }
        console.log(`💾 DB Updated: Device ${deviceId || deviceTopic} -> ${newPowerState}`);
        azioniEseguite++;
      }
    } catch (mqttError) {
      console.error('MQTT non disponibile:', mqttError);
      // Continua comunque - restituisce successo ma senza MQTT
    }

    const message = azioniBloccate > 0
      ? `Scena eseguita (${azioniBloccate} dispositiv${azioniBloccate === 1 ? 'o' : 'i'} bloccat${azioniBloccate === 1 ? 'o' : 'i'})`
      : 'Scena eseguita con successo';

    // Invia notifica push per esecuzione scena
    // excludeUserId: chi ha eseguito la scena NON riceve la notifica (sa già cosa ha fatto)
    if (azioniEseguite > 0) {
      notificationService.sendAndSave({
        impiantoId: scena.impianto_id,
        userId: req.user!.userId,
        excludeUserId: req.user!.userId, // Non notificare chi ha eseguito l'azione
        type: 'scene_executed',
        title: `🎬 Scena "${scena.nome}" eseguita`,
        body: `${azioniEseguite} azione${azioniEseguite > 1 ? 'i' : ''} eseguita${azioniEseguite > 1 ? 'e' : ''}`,
        data: {
          sceneId: scena.id,
          sceneName: scena.nome,
          actionsExecuted: azioniEseguite,
          actionsBlocked: azioniBloccate
        }
      }).catch(err => console.error('Error sending scene notification:', err));

      // Emit WebSocket event for scene execution
      emitScenaUpdate(scena.impianto_id, { ...scena, lastExecuted: new Date().toISOString() }, 'executed');
    }

    res.json({ message, azioni: azioniEseguite, bloccati: azioniBloccate });
  } catch (error) {
    console.error('Errore execute scena:', error);
    res.status(500).json({ error: 'Errore durante l\'esecuzione della scena' });
  }
};

// ============================================
// SUN TIMES API
// ============================================

// GET orari alba/tramonto per un impianto
export const getSunTimes = async (req: AuthRequest, res: Response) => {
  try {
    const { impiantoId } = req.params;

    // Verifica accesso all'impianto
    const [impianti]: any = await query(
      `SELECT i.* FROM impianti i
       LEFT JOIN impianti_condivisi ic ON i.id = ic.impianto_id
       WHERE i.id = ? AND (i.utente_id = ? OR ic.utente_id = ?)`,
      [impiantoId, req.user!.userId, req.user!.userId]
    );

    if (impianti.length === 0) {
      return res.status(404).json({ error: 'Impianto non trovato' });
    }

    const sunTimes = await getSunTimesForImpianto(parseInt(impiantoId));

    if (!sunTimes) {
      return res.status(400).json({
        error: 'Coordinate GPS non configurate per questo impianto',
        hint: 'Imposta latitudine e longitudine nelle impostazioni dell\'impianto'
      });
    }

    res.json({
      date: new Date().toISOString().split('T')[0],
      sunrise: formatTime(sunTimes.sunrise),
      sunset: formatTime(sunTimes.sunset),
      solarNoon: formatTime(sunTimes.solarNoon),
      civilDawn: formatTime(sunTimes.civilDawn),
      civilDusk: formatTime(sunTimes.civilDusk),
      goldenHourStart: formatTime(sunTimes.goldenHourStart),
      goldenHourEnd: formatTime(sunTimes.goldenHourEnd),
      raw: {
        sunrise: sunTimes.sunrise,
        sunset: sunTimes.sunset
      }
    });
  } catch (error) {
    console.error('Errore get sun times:', error);
    res.status(500).json({ error: 'Errore durante il recupero degli orari solari' });
  }
};

// GET orari alba/tramonto per i prossimi giorni
export const getUpcomingSun = async (req: AuthRequest, res: Response) => {
  try {
    const { impiantoId } = req.params;
    const days = parseInt(req.query.days as string) || 7;

    // Verifica accesso all'impianto
    const [impianti]: any = await query(
      `SELECT i.* FROM impianti i
       LEFT JOIN impianti_condivisi ic ON i.id = ic.impianto_id
       WHERE i.id = ? AND (i.utente_id = ? OR ic.utente_id = ?)`,
      [impiantoId, req.user!.userId, req.user!.userId]
    );

    if (impianti.length === 0) {
      return res.status(404).json({ error: 'Impianto non trovato' });
    }

    const upcoming = await getUpcomingSunTimes(parseInt(impiantoId), Math.min(days, 30));

    if (upcoming.length === 0) {
      return res.status(400).json({
        error: 'Coordinate GPS non configurate per questo impianto'
      });
    }

    res.json(upcoming);
  } catch (error) {
    console.error('Errore get upcoming sun times:', error);
    res.status(500).json({ error: 'Errore durante il recupero degli orari solari' });
  }
};

// GET statistiche scheduling
export const getSchedulingStats = async (req: AuthRequest, res: Response) => {
  try {
    const stats = getScheduleStats();
    res.json(stats);
  } catch (error) {
    console.error('Errore get scheduling stats:', error);
    res.status(500).json({ error: 'Errore durante il recupero delle statistiche' });
  }
};

// POST auto-popola scene Entra/Esci con tutti i dispositivi
export const autoPopulateDefaultScenes = async (req: AuthRequest, res: Response) => {
  console.log('\n[auto-populate] ======================================');
  console.log('[auto-populate] INIZIO AUTO-POPULATE SCENE');
  console.log('[auto-populate] ======================================');

  try {
    const { impiantoId } = req.params;
    console.log('[auto-populate] Impianto ID ricevuto:', impiantoId);
    console.log('[auto-populate] User ID:', req.user!.userId);

    // Verifica accesso all'impianto
    const impianti: any = await query(
      `SELECT i.* FROM impianti i
       LEFT JOIN impianti_condivisi ic ON i.id = ic.impianto_id
       WHERE i.id = ? AND (i.utente_id = ? OR ic.utente_id = ?)`,
      [impiantoId, req.user!.userId, req.user!.userId]
    );

    console.log('[auto-populate] Impianti trovati:', impianti.length);

    if (impianti.length === 0) {
      console.log('[auto-populate] ERRORE: Impianto non trovato o accesso negato');
      return res.status(404).json({ error: 'Impianto non trovato' });
    }

    // Ottieni tutti i dispositivi dell'impianto (query diretta su impianto_id)
    const dispositivi: any = await query(
      `SELECT id, nome, topic_mqtt, mac_address, device_type
       FROM dispositivi
       WHERE impianto_id = ?`,
      [impiantoId]
    );

    console.log('[auto-populate] Dispositivi trovati:', dispositivi.length);
    if (dispositivi.length > 0) {
      console.log('[auto-populate] Lista dispositivi:', dispositivi.map((d: any) => ({
        id: d.id,
        nome: d.nome,
        mac: d.mac_address,
        type: d.device_type
      })));
    }

    if (dispositivi.length === 0) {
      console.log('[auto-populate] Nessun dispositivo - ritorno early');
      return res.json({
        message: 'Nessun dispositivo trovato per popolare le scene',
        populated: 0
      });
    }

    // Trova le scene Entra e Esci
    const scene: any = await query(
      `SELECT id, nome FROM scene WHERE impianto_id = ? AND nome IN ('Entra', 'Esci')`,
      [impiantoId]
    );

    console.log('[auto-populate] Scene trovate:', scene.length);
    console.log('[auto-populate] Scene dettaglio:', scene.map((s: any) => ({ id: s.id, nome: s.nome })));

    const scenaEntra = scene.find((s: any) => s.nome === 'Entra');
    const scenaEsci = scene.find((s: any) => s.nome === 'Esci');

    console.log('[auto-populate] Scena Entra:', scenaEntra ? `ID ${scenaEntra.id}` : 'NON TROVATA');
    console.log('[auto-populate] Scena Esci:', scenaEsci ? `ID ${scenaEsci.id}` : 'NON TROVATA');

    if (!scenaEntra && !scenaEsci) {
      console.log('[auto-populate] ERRORE: Nessuna scena Entra/Esci trovata!');
      return res.status(404).json({ error: 'Scene Entra/Esci non trovate' });
    }

    // Costruisci le azioni per ogni dispositivo
    const azioniEntra = dispositivi.map((d: any) => ({
      dispositivo_id: d.id,
      topic: d.topic_mqtt,
      nome: d.nome,
      stato: 'ON'
    }));

    const azioniEsci = dispositivi.map((d: any) => ({
      dispositivo_id: d.id,
      topic: d.topic_mqtt,
      nome: d.nome,
      stato: 'OFF'
    }));

    console.log('[auto-populate] Azioni Entra da salvare:', JSON.stringify(azioniEntra));
    console.log('[auto-populate] Azioni Esci da salvare:', JSON.stringify(azioniEsci));

    // Aggiorna le scene
    if (scenaEntra) {
      console.log('[auto-populate] Aggiornando scena Entra ID:', scenaEntra.id);
      await query(
        'UPDATE scene SET azioni = ? WHERE id = ?',
        [JSON.stringify(azioniEntra), scenaEntra.id]
      );
      console.log('[auto-populate] Scena Entra aggiornata OK');
    }

    if (scenaEsci) {
      console.log('[auto-populate] Aggiornando scena Esci ID:', scenaEsci.id);
      await query(
        'UPDATE scene SET azioni = ? WHERE id = ?',
        [JSON.stringify(azioniEsci), scenaEsci.id]
      );
      console.log('[auto-populate] Scena Esci aggiornata OK');
    }

    console.log('[auto-populate] ======================================');
    console.log(`[auto-populate] ✅ SUCCESSO: ${dispositivi.length} dispositivi aggiunti alle scene`);
    console.log('[auto-populate] ======================================\n');

    res.json({
      message: 'Scene auto-popolate con successo',
      populated: dispositivi.length,
      scenes: {
        entra: scenaEntra ? azioniEntra.length : 0,
        esci: scenaEsci ? azioniEsci.length : 0
      }
    });
  } catch (error) {
    console.error('[auto-populate] ❌ ERRORE:', error);
    res.status(500).json({ error: 'Errore durante l\'auto-popolamento delle scene' });
  }
};
