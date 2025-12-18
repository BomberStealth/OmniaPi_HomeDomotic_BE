import { Request, Response } from 'express';
import { query } from '../config/database';
import { tasmotaCommand } from '../config/mqtt';
import { TipoDispositivo } from '../types';
import { RowDataPacket } from 'mysql2';

// ============================================
// CONTROLLER DISPOSITIVI
// ============================================

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

    await query('DELETE FROM dispositivi WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'Dispositivo eliminato con successo'
    });
  } catch (error) {
    console.error('Errore delete dispositivo:', error);
    res.status(500).json({
      success: false,
      error: 'Errore durante l\'eliminazione del dispositivo'
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
