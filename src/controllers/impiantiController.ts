import { Request, Response } from 'express';
import { query } from '../config/database';
import { UserRole } from '../types';
import { RowDataPacket } from 'mysql2';

// ============================================
// CONTROLLER IMPIANTI
// ============================================

// Ottieni tutti gli impianti (filtrati per ruolo)
export const getImpianti = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const ruolo = req.user?.ruolo;

    let sql = '';
    let params: any[] = [];

    if (ruolo === UserRole.ADMIN) {
      // Admin vede tutti gli impianti
      sql = 'SELECT * FROM impianti ORDER BY creato_il DESC';
    } else if (ruolo === UserRole.INSTALLATORE) {
      // Installatore vede solo i suoi impianti
      sql = 'SELECT * FROM impianti WHERE installatore_id = ? ORDER BY creato_il DESC';
      params = [userId];
    } else {
      // Cliente vede solo i suoi impianti
      sql = 'SELECT * FROM impianti WHERE cliente_id = ? ORDER BY creato_il DESC';
      params = [userId];
    }

    const impianti = await query(sql, params);

    res.json({
      success: true,
      data: impianti
    });
  } catch (error) {
    console.error('Errore get impianti:', error);
    res.status(500).json({
      success: false,
      error: 'Errore durante il recupero degli impianti'
    });
  }
};

// Ottieni singolo impianto con dettagli
export const getImpianto = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const ruolo = req.user?.ruolo;

    // Verifica permessi
    const impianti = await query(
      'SELECT * FROM impianti WHERE id = ?',
      [id]
    ) as RowDataPacket[];

    if (impianti.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Impianto non trovato'
      });
    }

    const impianto = impianti[0];

    // Verifica accesso
    if (ruolo === UserRole.CLIENTE && impianto.cliente_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Accesso negato'
      });
    }

    if (ruolo === UserRole.INSTALLATORE && impianto.installatore_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Accesso negato'
      });
    }

    // Ottieni piani, stanze e dispositivi
    const piani = await query(
      'SELECT * FROM piani WHERE impianto_id = ? ORDER BY ordine',
      [id]
    ) as RowDataPacket[];

    for (const piano of piani) {
      const stanze = await query(
        'SELECT * FROM stanze WHERE piano_id = ? ORDER BY ordine',
        [piano.id]
      ) as RowDataPacket[];

      for (const stanza of stanze) {
        const dispositivi = await query(
          'SELECT * FROM dispositivi WHERE stanza_id = ?',
          [stanza.id]
        ) as RowDataPacket[];

        stanza.dispositivi = dispositivi;
      }

      piano.stanze = stanze;
    }

    res.json({
      success: true,
      data: {
        ...impianto,
        piani
      }
    });
  } catch (error) {
    console.error('Errore get impianto:', error);
    res.status(500).json({
      success: false,
      error: 'Errore durante il recupero dell\'impianto'
    });
  }
};

// Crea nuovo impianto (solo installatore e admin)
export const createImpianto = async (req: Request, res: Response) => {
  try {
    const { nome, indirizzo, citta, cap, cliente_id } = req.body;
    const installatore_id = req.user?.userId;

    if (!nome || !cliente_id) {
      return res.status(400).json({
        success: false,
        error: 'Nome e cliente sono richiesti'
      });
    }

    const result: any = await query(
      'INSERT INTO impianti (nome, indirizzo, citta, cap, cliente_id, installatore_id) VALUES (?, ?, ?, ?, ?, ?)',
      [nome, indirizzo, citta, cap, cliente_id, installatore_id]
    );

    res.status(201).json({
      success: true,
      data: { id: result.insertId }
    });
  } catch (error) {
    console.error('Errore create impianto:', error);
    res.status(500).json({
      success: false,
      error: 'Errore durante la creazione dell\'impianto'
    });
  }
};

// Aggiorna impianto
export const updateImpianto = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { nome, indirizzo, citta, cap } = req.body;

    await query(
      'UPDATE impianti SET nome = ?, indirizzo = ?, citta = ?, cap = ? WHERE id = ?',
      [nome, indirizzo, citta, cap, id]
    );

    res.json({
      success: true,
      message: 'Impianto aggiornato con successo'
    });
  } catch (error) {
    console.error('Errore update impianto:', error);
    res.status(500).json({
      success: false,
      error: 'Errore durante l\'aggiornamento dell\'impianto'
    });
  }
};

// Elimina impianto
export const deleteImpianto = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await query('DELETE FROM impianti WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'Impianto eliminato con successo'
    });
  } catch (error) {
    console.error('Errore delete impianto:', error);
    res.status(500).json({
      success: false,
      error: 'Errore durante l\'eliminazione dell\'impianto'
    });
  }
};
