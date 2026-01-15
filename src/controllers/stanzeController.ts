import { Request, Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { emitStanzaUpdate } from '../socket';

// ============================================
// STANZE CONTROLLER
// ============================================

// GET tutte le stanze di un impianto
export const getStanze = async (req: AuthRequest, res: Response) => {
  try {
    const { impiantoId } = req.params;

    // Verifica che l'utente abbia accesso all'impianto
    const impianti: any = await query(
      `SELECT i.* FROM impianti i
       LEFT JOIN impianti_condivisi ic ON i.id = ic.impianto_id
       WHERE i.id = ? AND (i.utente_id = ? OR ic.utente_id = ?)`,
      [impiantoId, req.user!.userId, req.user!.userId]
    );

    if (!impianti || impianti.length === 0) {
      return res.status(404).json({ error: 'Impianto non trovato' });
    }

    // Ottieni stanze con conteggio dispositivi
    const stanze: any = await query(
      `SELECT s.*,
        (SELECT COUNT(*) FROM dispositivi d WHERE d.stanza_id = s.id) as dispositivi_count
       FROM stanze s
       WHERE s.impianto_id = ?
       ORDER BY s.ordine ASC, s.creato_il ASC`,
      [impiantoId]
    );

    // Assicurati che sia sempre un array valido
    const stanzeArray = Array.isArray(stanze) ? stanze.filter((s: any) => s !== null && s !== undefined) : [];
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
    const impianti: any = await query(
      `SELECT i.* FROM impianti i
       LEFT JOIN impianti_condivisi ic ON i.id = ic.impianto_id
       WHERE i.id = ? AND (i.utente_id = ? OR ic.utente_id = ?)`,
      [impiantoId, req.user!.userId, req.user!.userId]
    );

    if (!impianti || impianti.length === 0) {
      return res.status(404).json({ error: 'Impianto non trovato' });
    }

    // Validazione nome duplicato
    const esistente: any = await query(
      'SELECT id FROM stanze WHERE LOWER(nome) = LOWER(?) AND impianto_id = ?',
      [nome.trim(), impiantoId]
    );
    if (esistente && esistente.length > 0) {
      return res.status(400).json({ error: 'Esiste già una stanza con questo nome' });
    }

    // Ottieni l'ordine massimo corrente
    const maxOrdineResult: any = await query(
      'SELECT MAX(ordine) as max_ordine FROM stanze WHERE impianto_id = ?',
      [impiantoId]
    );

    const nuovoOrdine = (maxOrdineResult && maxOrdineResult[0] && maxOrdineResult[0].max_ordine)
      ? maxOrdineResult[0].max_ordine + 1
      : 1;

    const result: any = await query(
      'INSERT INTO stanze (impianto_id, piano_id, nome, icona, ordine) VALUES (?, NULL, ?, ?, ?)',
      [impiantoId, nome, icona || '🚪', nuovoOrdine]
    );

    const stanza: any = await query('SELECT * FROM stanze WHERE id = ?', [result.insertId]);

    // Emit WebSocket event
    emitStanzaUpdate(parseInt(impiantoId as string), stanza[0], 'created');

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
    const stanze: any = await query(
      `SELECT s.* FROM stanze s
       JOIN impianti i ON s.impianto_id = i.id
       LEFT JOIN impianti_condivisi ic ON i.id = ic.impianto_id
       WHERE s.id = ? AND (i.utente_id = ? OR ic.utente_id = ?)`,
      [id, req.user!.userId, req.user!.userId]
    );

    if (!stanze || stanze.length === 0) {
      return res.status(404).json({ error: 'Stanza non trovata' });
    }

    // Validazione nome duplicato (escludendo la stanza corrente)
    if (nome) {
      const esistente: any = await query(
        'SELECT id FROM stanze WHERE LOWER(nome) = LOWER(?) AND impianto_id = ? AND id != ?',
        [nome.trim(), stanze[0].impianto_id, id]
      );
      if (esistente && esistente.length > 0) {
        return res.status(400).json({ error: 'Esiste già una stanza con questo nome' });
      }
    }

    await query(
      'UPDATE stanze SET nome = ?, icona = ? WHERE id = ?',
      [nome || stanze[0].nome, icona || stanze[0].icona, id]
    );

    const stanzaAggiornata: any = await query('SELECT * FROM stanze WHERE id = ?', [id]);

    // Emit WebSocket event
    emitStanzaUpdate(stanzaAggiornata[0].impianto_id, stanzaAggiornata[0], 'updated');

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
    const stanze: any = await query(
      `SELECT s.* FROM stanze s
       JOIN impianti i ON s.impianto_id = i.id
       LEFT JOIN impianti_condivisi ic ON i.id = ic.impianto_id
       WHERE s.id = ? AND (i.utente_id = ? OR ic.utente_id = ?)`,
      [id, req.user!.userId, req.user!.userId]
    );

    if (!stanze || stanze.length === 0) {
      return res.status(404).json({ error: 'Stanza non trovata' });
    }

    const stanza = stanze[0];

    // 1. Trova tutti i dispositivi in questa stanza
    const dispositivi: any = await query(
      'SELECT id FROM dispositivi WHERE stanza_id = ?',
      [id]
    );
    const deviceIds = dispositivi.map((d: any) => d.id);

    if (deviceIds.length > 0) {
      // 2. Rimuovi i dispositivi dalle azioni delle scene
      const scene: any = await query(
        'SELECT id, azioni FROM scene WHERE impianto_id = ?',
        [stanza.impianto_id]
      );

      for (const scena of scene) {
        if (scena.azioni && Array.isArray(scena.azioni)) {
          // Filtra le azioni rimuovendo quelle dei dispositivi eliminati
          const azioniAggiornate = scena.azioni.filter(
            (azione: any) => !deviceIds.includes(azione.dispositivo_id)
          );

          // Aggiorna solo se ci sono state modifiche
          if (azioniAggiornate.length !== scena.azioni.length) {
            await query(
              'UPDATE scene SET azioni = ? WHERE id = ?',
              [JSON.stringify(azioniAggiornate), scena.id]
            );
            console.log(`📝 Rimossi dispositivi dalla scena "${scena.id}": ${scena.azioni.length - azioniAggiornate.length} azioni`);
          }
        }
      }

      // 3. Imposta stanza_id = NULL per i dispositivi (tornano a "Non assegnati")
      await query(
        'UPDATE dispositivi SET stanza_id = NULL WHERE stanza_id = ?',
        [id]
      );
      console.log(`📝 ${deviceIds.length} dispositivi spostati in "Non assegnati"`);
    }

    // 4. Elimina la stanza
    await query('DELETE FROM stanze WHERE id = ?', [id]);

    // Emit WebSocket event
    emitStanzaUpdate(stanza.impianto_id, { id: parseInt(id as string), ...stanza }, 'deleted');

    res.json({
      message: 'Stanza eliminata con successo',
      devicesUnassigned: deviceIds.length
    });
  } catch (error) {
    console.error('Errore delete stanza:', error);
    res.status(500).json({ error: 'Errore durante l\'eliminazione della stanza' });
  }
};
