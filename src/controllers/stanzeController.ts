import { Request, Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';

// ============================================
// STANZE CONTROLLER
// ============================================

// GET tutte le stanze di un impianto
export const getStanze = async (req: AuthRequest, res: Response) => {
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

    // Ottieni stanze con conteggio dispositivi
    const [stanze]: any = await query(
      `SELECT s.*, COUNT(d.id) as dispositivi_count
       FROM stanze s
       LEFT JOIN dispositivi d ON s.id = d.stanza_id
       WHERE s.impianto_id = ?
       GROUP BY s.id
       ORDER BY s.ordine ASC, s.creato_il ASC`,
      [impiantoId]
    );

    // Assicurati che sia sempre un array
    const stanzeArray = Array.isArray(stanze) ? stanze : [stanze];
    res.json(stanzeArray);
  } catch (error) {
    console.error('Errore get stanze:', error);
    res.status(500).json({ error: 'Errore durante il recupero delle stanze' });
  }
};

// POST crea nuova stanza
export const createStanza = async (req: AuthRequest, res: Response) => {
  try {
    const { impiantoId } = req.params;
    const { nome, icona } = req.body;

    if (!nome) {
      return res.status(400).json({ error: 'Nome è richiesto' });
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

    // Ottieni l'ordine massimo corrente
    const [maxOrdine]: any = await query(
      'SELECT MAX(ordine) as max_ordine FROM stanze WHERE impianto_id = ?',
      [impiantoId]
    );

    const nuovoOrdine = (maxOrdine && maxOrdine[0] && maxOrdine[0].max_ordine) ? maxOrdine[0].max_ordine + 1 : 1;

    const result: any = await query(
      'INSERT INTO stanze (impianto_id, piano_id, nome, icona, ordine) VALUES (?, NULL, ?, ?, ?)',
      [impiantoId, nome, icona || '🚪', nuovoOrdine]
    );

    const [stanza]: any = await query('SELECT * FROM stanze WHERE id = ?', [result.insertId]);

    res.status(201).json(stanza[0]);
  } catch (error) {
    console.error('Errore create stanza:', error);
    res.status(500).json({ error: 'Errore durante la creazione della stanza' });
  }
};

// PUT aggiorna stanza
export const updateStanza = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { nome, icona } = req.body;

    // Verifica che la stanza esista e che l'utente abbia accesso
    const [stanze]: any = await query(
      `SELECT s.* FROM stanze s
       JOIN impianti i ON s.impianto_id = i.id
       LEFT JOIN impianti_condivisi ic ON i.id = ic.impianto_id
       WHERE s.id = ? AND (i.utente_id = ? OR ic.utente_id = ?)`,
      [id, req.user!.userId, req.user!.userId]
    );

    if (stanze.length === 0) {
      return res.status(404).json({ error: 'Stanza non trovata' });
    }

    await query(
      'UPDATE stanze SET nome = ?, icona = ? WHERE id = ?',
      [nome || stanze[0].nome, icona || stanze[0].icona, id]
    );

    const [stanzaAggiornata]: any = await query('SELECT * FROM stanze WHERE id = ?', [id]);

    res.json(stanzaAggiornata[0]);
  } catch (error) {
    console.error('Errore update stanza:', error);
    res.status(500).json({ error: 'Errore durante l\'aggiornamento della stanza' });
  }
};

// DELETE elimina stanza
export const deleteStanza = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Verifica che la stanza esista e che l'utente abbia accesso
    const [stanze]: any = await query(
      `SELECT s.* FROM stanze s
       JOIN impianti i ON s.impianto_id = i.id
       LEFT JOIN impianti_condivisi ic ON i.id = ic.impianto_id
       WHERE s.id = ? AND (i.utente_id = ? OR ic.utente_id = ?)`,
      [id, req.user!.userId, req.user!.userId]
    );

    if (stanze.length === 0) {
      return res.status(404).json({ error: 'Stanza non trovata' });
    }

    await query('DELETE FROM stanze WHERE id = ?', [id]);

    res.json({ message: 'Stanza eliminata con successo' });
  } catch (error) {
    console.error('Errore delete stanza:', error);
    res.status(500).json({ error: 'Errore durante l\'eliminazione della stanza' });
  }
};
