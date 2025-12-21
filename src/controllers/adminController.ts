import { Request, Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { UserRole } from '../types';

// ============================================
// ADMIN CONTROLLER
// ============================================

// GET cerca utenti (solo admin)
export const searchUsers = async (req: AuthRequest, res: Response) => {
  try {
    const { q } = req.query;

    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: 'Query di ricerca richiesta' });
    }

    const [utenti]: any = await query(
      `SELECT id, email, nome, cognome, ruolo, creato_il
       FROM utenti
       WHERE email LIKE ? OR nome LIKE ? OR cognome LIKE ?
       ORDER BY email ASC
       LIMIT 50`,
      [`%${q}%`, `%${q}%`, `%${q}%`]
    );

    res.json(utenti);
  } catch (error) {
    console.error('Errore search users:', error);
    res.status(500).json({ error: 'Errore durante la ricerca utenti' });
  }
};

// GET permessi di un utente (solo admin)
export const getUserPermissions = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;

    // Verifica che l'utente esista
    const [utenti]: any = await query('SELECT * FROM utenti WHERE id = ?', [userId]);

    if (utenti.length === 0) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }

    const [permessi]: any = await query(
      'SELECT permesso, valore FROM permessi_utenti WHERE utente_id = ?',
      [userId]
    );

    // Permessi standard
    const permessiDefault = [
      'visualizza_impianti',
      'modifica_impianti',
      'elimina_impianti',
      'gestisci_utenti',
      'gestisci_dispositivi',
      'gestisci_scene'
    ];

    // Crea oggetto permessi con valori di default
    const permessiObj: any = {};
    permessiDefault.forEach(p => {
      const found = permessi.find((perm: any) => perm.permesso === p);
      permessiObj[p] = found ? found.valore : false;
    });

    res.json({
      utente: utenti[0],
      permessi: permessiObj
    });
  } catch (error) {
    console.error('Errore get user permissions:', error);
    res.status(500).json({ error: 'Errore durante il recupero dei permessi' });
  }
};

// PUT aggiorna permessi di un utente (solo admin)
export const updateUserPermissions = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { permessi } = req.body;

    if (!permessi || typeof permessi !== 'object') {
      return res.status(400).json({ error: 'Permessi richiesti' });
    }

    // Verifica che l'utente esista
    const [utenti]: any = await query('SELECT * FROM utenti WHERE id = ?', [userId]);

    if (utenti.length === 0) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }

    // Non permettere di modificare i permessi di un admin
    if (utenti[0].ruolo === UserRole.ADMIN) {
      return res.status(400).json({ error: 'Non puoi modificare i permessi di un admin' });
    }

    // Aggiorna ogni permesso
    for (const [permesso, valore] of Object.entries(permessi)) {
      await query(
        `INSERT INTO permessi_utenti (utente_id, permesso, valore)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE valore = ?`,
        [userId, permesso, valore, valore]
      );
    }

    res.json({ message: 'Permessi aggiornati con successo' });
  } catch (error) {
    console.error('Errore update user permissions:', error);
    res.status(500).json({ error: 'Errore durante l\'aggiornamento dei permessi' });
  }
};

// GET tutti gli utenti (solo admin)
export const getAllUsers = async (req: AuthRequest, res: Response) => {
  try {
    const [utenti]: any = await query(
      `SELECT id, email, nome, cognome, ruolo, creato_il, aggiornato_il
       FROM utenti
       ORDER BY creato_il DESC`
    );

    res.json(utenti);
  } catch (error) {
    console.error('Errore get all users:', error);
    res.status(500).json({ error: 'Errore durante il recupero degli utenti' });
  }
};

// PUT aggiorna ruolo utente (solo admin)
export const updateUserRole = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { ruolo } = req.body;

    if (!ruolo || !Object.values(UserRole).includes(ruolo)) {
      return res.status(400).json({ error: 'Ruolo non valido' });
    }

    // Verifica che l'utente esista
    const [utenti]: any = await query('SELECT * FROM utenti WHERE id = ?', [userId]);

    if (utenti.length === 0) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }

    // Non permettere di modificare il proprio ruolo
    if (utenti[0].id === req.user!.userId) {
      return res.status(400).json({ error: 'Non puoi modificare il tuo stesso ruolo' });
    }

    await query('UPDATE utenti SET ruolo = ? WHERE id = ?', [ruolo, userId]);

    res.json({ message: 'Ruolo aggiornato con successo' });
  } catch (error) {
    console.error('Errore update user role:', error);
    res.status(500).json({ error: 'Errore durante l\'aggiornamento del ruolo' });
  }
};

// DELETE elimina utente (solo admin)
export const deleteUser = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;

    // Verifica che l'utente esista
    const [utenti]: any = await query('SELECT * FROM utenti WHERE id = ?', [userId]);

    if (utenti.length === 0) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }

    // Non permettere di eliminare se stesso
    if (utenti[0].id === req.user!.userId) {
      return res.status(400).json({ error: 'Non puoi eliminare te stesso' });
    }

    // Non permettere di eliminare un admin
    if (utenti[0].ruolo === UserRole.ADMIN) {
      return res.status(400).json({ error: 'Non puoi eliminare un admin' });
    }

    await query('DELETE FROM utenti WHERE id = ?', [userId]);

    res.json({ message: 'Utente eliminato con successo' });
  } catch (error) {
    console.error('Errore delete user:', error);
    res.status(500).json({ error: 'Errore durante l\'eliminazione dell\'utente' });
  }
};
