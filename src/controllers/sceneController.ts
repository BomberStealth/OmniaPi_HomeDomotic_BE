import { Request, Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { reloadSchedule } from '../services/sceneScheduler';

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

    await query('DELETE FROM scene WHERE id = ?', [id]);

    res.json({ message: 'Scena eliminata con successo' });
  } catch (error) {
    console.error('Errore delete scena:', error);
    res.status(500).json({ error: 'Errore durante l\'eliminazione della scena' });
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
    const azioni = JSON.parse(scena.azioni);

    // Esegui le azioni della scena (invio comandi MQTT)
    const mqtt = require('../config/mqtt');

    for (const azione of azioni) {
      const topic = `${azione.topic}/cmnd/POWER`;
      const payload = azione.stato === 'ON' ? 'ON' : 'OFF';
      mqtt.client.publish(topic, payload);
    }

    res.json({ message: 'Scena eseguita con successo', azioni: azioni.length });
  } catch (error) {
    console.error('Errore execute scena:', error);
    res.status(500).json({ error: 'Errore durante l\'esecuzione della scena' });
  }
};
