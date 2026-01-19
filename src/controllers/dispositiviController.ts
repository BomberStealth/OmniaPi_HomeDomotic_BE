import { Request, Response } from 'express';
import { query } from '../config/database';
import { tasmotaCommand } from '../config/mqtt';
import { TipoDispositivo } from '../types';
import { RowDataPacket } from 'mysql2';
import { AuthRequest } from '../middleware/auth';
import { getNode, getLedState } from '../services/omniapiState';

// ============================================
// CONTROLLER DISPOSITIVI
// ============================================

/**
 * GET /api/impianti/:impiantoId/dispositivi/all
 * Restituisce TUTTI i dispositivi di un impianto (Tasmota + OmniaPi)
 * Usato per Scene e Stanze
 */
export const getAllDispositivi = async (req: AuthRequest, res: Response) => {
  try {
    const { impiantoId } = req.params;

    // Verifica accesso all'impianto
    const impianti: any = await query(
      `SELECT i.* FROM impianti i
       LEFT JOIN impianti_condivisi ic ON i.id = ic.impianto_id
       WHERE i.id = ? AND (i.utente_id = ? OR ic.utente_id = ?)`,
      [impiantoId, req.user!.userId, req.user!.userId]
    );

    if (impianti.length === 0) {
      return res.status(404).json({ error: 'Impianto non trovato' });
    }

    // Recupera TUTTI i dispositivi (senza filtro device_type)
    const dispositivi: any = await query(
      `SELECT d.*, s.nome as stanza_nome
       FROM dispositivi d
       LEFT JOIN stanze s ON d.stanza_id = s.id
       WHERE d.impianto_id = ?
       ORDER BY d.nome ASC`,
      [impiantoId]
    );

    // Arricchisci i nodi OmniaPi con stato real-time
    const dispositiviEnriched = (dispositivi || []).map((d: any) => {
      // Nodi relay OmniaPi
      if (d.device_type === 'omniapi_node' && d.mac_address) {
        const liveNode = getNode(d.mac_address);
        return {
          ...d,
          mac: d.mac_address,
          online: liveNode?.online ?? false,
          relay1: liveNode?.relay1 ?? false,
          relay2: liveNode?.relay2 ?? false,
        };
      }
      // LED Strip OmniaPi - arricchisci con stato real-time
      if (d.device_type === 'omniapi_led' && d.mac_address) {
        const liveLed = getLedState(d.mac_address);
        if (liveLed) {
          return {
            ...d,
            mac: d.mac_address,
            online: liveLed.online ?? true,
            led_power: liveLed.power ?? false,
            power_state: liveLed.power ?? false,
            led_r: liveLed.r ?? 255,
            led_g: liveLed.g ?? 255,
            led_b: liveLed.b ?? 255,
            led_brightness: liveLed.brightness ?? 255,
            led_effect: liveLed.effect ?? 0,
            stato: liveLed.online !== false ? 'online' : 'offline',
          };
        }
      }
      return d;
    });

    res.json(dispositiviEnriched);
  } catch (error) {
    console.error('Errore getAllDispositivi:', error);
    res.status(500).json({ error: 'Errore durante il recupero dei dispositivi' });
  }
};

// Ottieni dispositivi di una stanza
export const getDispositivi = async (req: Request, res: Response) => {
  try {
    const { stanzaId } = req.params;

    const dispositivi = await query(
      'SELECT * FROM dispositivi WHERE stanza_id = ?',
      [stanzaId]
    );

    res.json({
      success: true,
      data: dispositivi
    });
  } catch (error) {
    console.error('Errore get dispositivi:', error);
    res.status(500).json({
      success: false,
      error: 'Errore durante il recupero dei dispositivi'
    });
  }
};

// Crea nuovo dispositivo (installatore/admin)
export const createDispositivo = async (req: Request, res: Response) => {
  try {
    const { stanza_id, tipo, nome, topic_mqtt, configurazione } = req.body;

    if (!stanza_id || !tipo || !nome || !topic_mqtt) {
      return res.status(400).json({
        success: false,
        error: 'Campi obbligatori mancanti'
      });
    }

    const config = configurazione || getDefaultConfig(tipo);

    const result: any = await query(
      'INSERT INTO dispositivi (stanza_id, tipo, nome, topic_mqtt, configurazione) VALUES (?, ?, ?, ?, ?)',
      [stanza_id, tipo, nome, topic_mqtt, JSON.stringify(config)]
    );

    res.status(201).json({
      success: true,
      data: { id: result.insertId }
    });
  } catch (error) {
    console.error('Errore create dispositivo:', error);
    res.status(500).json({
      success: false,
      error: 'Errore durante la creazione del dispositivo'
    });
  }
};

// Controlla dispositivo (tutti i ruoli possono controllare)
export const controlDispositivo = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { comando } = req.body;

    // Ottieni dispositivo
    const dispositivi = await query(
      'SELECT * FROM dispositivi WHERE id = ?',
      [id]
    ) as RowDataPacket[];

    if (dispositivi.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Dispositivo non trovato'
      });
    }

    const dispositivo = dispositivi[0];

    // Invia comando MQTT in base al tipo
    switch (dispositivo.tipo) {
      case TipoDispositivo.LUCE:
        handleLuceCommand(dispositivo, comando);
        break;
      case TipoDispositivo.TAPPARELLA:
        handleTapparellaCommand(dispositivo, comando);
        break;
      case TipoDispositivo.TERMOSTATO:
        handleTermostatoCommand(dispositivo, comando);
        break;
    }

    // Aggiorna configurazione
    await query(
      'UPDATE dispositivi SET configurazione = ? WHERE id = ?',
      [JSON.stringify(comando.newConfig), id]
    );

    res.json({
      success: true,
      message: 'Comando inviato con successo'
    });
  } catch (error) {
    console.error('Errore control dispositivo:', error);
    res.status(500).json({
      success: false,
      error: 'Errore durante il controllo del dispositivo'
    });
  }
};

// Elimina dispositivo
export const deleteDispositivo = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deviceId = parseInt(id);

    // 1. Trova il dispositivo per ottenere impianto_id
    const dispositivi: any = await query(
      'SELECT id, impianto_id, nome FROM dispositivi WHERE id = ?',
      [deviceId]
    );

    if (dispositivi.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Dispositivo non trovato'
      });
    }

    const dispositivo = dispositivi[0];

    // 2. Rimuovi il dispositivo dalle azioni delle scene
    const scene: any = await query(
      'SELECT id, azioni FROM scene WHERE impianto_id = ?',
      [dispositivo.impianto_id]
    );

    for (const scena of scene) {
      if (scena.azioni && Array.isArray(scena.azioni)) {
        const azioniAggiornate = scena.azioni.filter(
          (azione: any) => azione.dispositivo_id !== deviceId
        );

        if (azioniAggiornate.length !== scena.azioni.length) {
          await query(
            'UPDATE scene SET azioni = ? WHERE id = ?',
            [JSON.stringify(azioniAggiornate), scena.id]
          );
          console.log(`📝 Dispositivo ${dispositivo.nome} rimosso dalla scena ${scena.id}`);
        }
      }
    }

    // 3. Elimina il dispositivo
    await query('DELETE FROM dispositivi WHERE id = ?', [deviceId]);

    res.json({
      success: true,
      message: 'Dispositivo eliminato con successo'
    });
  } catch (error) {
    console.error('Errore delete dispositivo:', error);
    res.status(500).json({
      success: false,
      error: "Errore durante l'eliminazione del dispositivo"
    });
  }
};

// ============================================
// HELPER FUNCTIONS
// ============================================

function getDefaultConfig(tipo: TipoDispositivo) {
  switch (tipo) {
    case TipoDispositivo.LUCE:
      return { dimmerabile: false, accesa: false };
    case TipoDispositivo.TAPPARELLA:
      return { posizione_corrente: 0, in_movimento: false };
    case TipoDispositivo.TERMOSTATO:
      return {
        temperatura_corrente: 20,
        temperatura_target: 20,
        modalita: 'auto',
        acceso: false
      };
    default:
      return {};
  }
}

function handleLuceCommand(dispositivo: any, comando: any) {
  const { accesa, livello } = comando;

  if (accesa !== undefined) {
    tasmotaCommand(dispositivo.topic_mqtt, 'POWER', accesa ? 'ON' : 'OFF');
  }

  if (livello !== undefined) {
    tasmotaCommand(dispositivo.topic_mqtt, 'Dimmer', livello);
  }
}

function handleTapparellaCommand(dispositivo: any, comando: any) {
  const { azione, posizione } = comando;

  if (azione === 'apri') {
    tasmotaCommand(dispositivo.topic_mqtt, 'ShutterOpen', '');
  } else if (azione === 'chiudi') {
    tasmotaCommand(dispositivo.topic_mqtt, 'ShutterClose', '');
  } else if (azione === 'stop') {
    tasmotaCommand(dispositivo.topic_mqtt, 'ShutterStop', '');
  } else if (posizione !== undefined) {
    tasmotaCommand(dispositivo.topic_mqtt, 'ShutterPosition', posizione);
  }
}

function handleTermostatoCommand(dispositivo: any, comando: any) {
  const { temperatura_target, modalita, acceso } = comando;

  if (temperatura_target !== undefined) {
    tasmotaCommand(dispositivo.topic_mqtt, 'SetTemp', temperatura_target);
  }

  if (modalita) {
    tasmotaCommand(dispositivo.topic_mqtt, 'Mode', modalita);
  }

  if (acceso !== undefined) {
    tasmotaCommand(dispositivo.topic_mqtt, 'POWER', acceso ? 'ON' : 'OFF');
  }
}
