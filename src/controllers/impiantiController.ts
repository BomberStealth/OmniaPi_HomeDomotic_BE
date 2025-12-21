import { Request, Response } from 'express';
import { query } from '../config/database';
import { UserRole } from '../types';
import { RowDataPacket } from 'mysql2';
import crypto from 'crypto';

// ============================================
// CONTROLLER IMPIANTI
// ============================================

// Genera codice condivisione univoco
const generateCodiceCondivisione = (): string => {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
};

// Geocoding semplificato (OpenStreetMap Nominatim)
const geocodeAddress = async (indirizzo: string, citta: string, cap: string): Promise<{ lat: number; lon: number } | null> => {
  try {
    const query = `${indirizzo}, ${citta}, ${cap}, Italy`;
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
      {
        headers: {
          'User-Agent': 'OmniaPi-HomeDomotic/1.0'
        }
      }
    );

    const data = await response.json() as any[];

    if (data && Array.isArray(data) && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon)
      };
    }

    return null;
  } catch (error) {
    console.error('Errore geocoding:', error);
    return null;
  }
};

// Ottieni tutti gli impianti (filtrati per ruolo e condivisioni)
export const getImpianti = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const ruolo = req.user?.ruolo;

    let impianti: RowDataPacket[] = [];

    if (ruolo === UserRole.ADMIN) {
      // Admin vede tutti gli impianti
      impianti = await query('SELECT * FROM impianti ORDER BY creato_il DESC') as RowDataPacket[];
    } else {
      // Tutti gli utenti vedono:
      // 1. I propri impianti (utente_id = userId)
      // 2. Gli impianti condivisi con loro
      const propri = await query(
        'SELECT * FROM impianti WHERE utente_id = ? ORDER BY creato_il DESC',
        [userId]
      ) as RowDataPacket[];

      const condivisi = await query(
        `SELECT i.* FROM impianti i
         INNER JOIN impianti_condivisi ic ON i.id = ic.impianto_id
         WHERE ic.utente_id = ?
         ORDER BY i.creato_il DESC`,
        [userId]
      ) as RowDataPacket[];

      // Unisci senza duplicati
      const impiantiMap = new Map();
      [...propri, ...condivisi].forEach(imp => {
        impiantiMap.set(imp.id, imp);
      });
      impianti = Array.from(impiantiMap.values());
    }

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

// Crea nuovo impianto
export const createImpianto = async (req: Request, res: Response) => {
  try {
    const { nome, indirizzo, citta, cap, ha_fotovoltaico, fotovoltaico_potenza } = req.body;
    const utente_id = req.user?.userId;
    const email_proprietario = req.user?.email;

    if (!nome || !indirizzo || !citta || !cap) {
      return res.status(400).json({
        success: false,
        error: 'Nome, indirizzo, città e CAP sono richiesti'
      });
    }

    // Genera codice condivisione univoco
    let codiceCondivisione = generateCodiceCondivisione();
    let isUnique = false;

    // Assicurati che sia univoco
    while (!isUnique) {
      const existing = await query(
        'SELECT id FROM impianti WHERE codice_condivisione = ?',
        [codiceCondivisione]
      ) as RowDataPacket[];

      if (existing.length === 0) {
        isUnique = true;
      } else {
        codiceCondivisione = generateCodiceCondivisione();
      }
    }

    // Ottieni coordinate GPS da indirizzo
    const coordinates = await geocodeAddress(indirizzo, citta, cap);

    const result: any = await query(
      `INSERT INTO impianti
       (nome, indirizzo, citta, cap, utente_id, email_proprietario, codice_condivisione,
        ha_fotovoltaico, fotovoltaico_potenza, latitudine, longitudine, cliente_id, installatore_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nome,
        indirizzo,
        citta,
        cap,
        utente_id,
        email_proprietario,
        codiceCondivisione,
        ha_fotovoltaico || false,
        fotovoltaico_potenza || null,
        coordinates?.lat || null,
        coordinates?.lon || null,
        utente_id, // cliente_id per compatibilità
        utente_id  // installatore_id per compatibilità
      ]
    );

    // Crea scene base per il nuovo impianto
    const sceneBase = [
      { nome: 'Giorno', icona: '☀️', azioni: JSON.stringify([]) },
      { nome: 'Notte', icona: '🌙', azioni: JSON.stringify([]) },
      { nome: 'Entra', icona: '🚪', azioni: JSON.stringify([]) },
      { nome: 'Esci', icona: '👋', azioni: JSON.stringify([]) }
    ];

    for (const scena of sceneBase) {
      await query(
        'INSERT INTO scene (impianto_id, nome, icona, azioni, is_base) VALUES (?, ?, ?, ?, TRUE)',
        [result.insertId, scena.nome, scena.icona, scena.azioni]
      );
    }

    res.status(201).json({
      success: true,
      data: {
        id: result.insertId,
        codice_condivisione: codiceCondivisione
      },
      message: 'Impianto creato con successo con scene base'
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
    const {
      nome,
      indirizzo,
      citta,
      cap,
      latitudine,
      longitudine,
      ha_fotovoltaico,
      fotovoltaico_potenza
    } = req.body;

    await query(
      `UPDATE impianti SET
       nome = ?,
       indirizzo = ?,
       citta = ?,
       cap = ?,
       latitudine = ?,
       longitudine = ?,
       ha_fotovoltaico = ?,
       fotovoltaico_potenza = ?
       WHERE id = ?`,
      [
        nome,
        indirizzo,
        citta,
        cap,
        latitudine || null,
        longitudine || null,
        ha_fotovoltaico || false,
        fotovoltaico_potenza || null,
        id
      ]
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

// Rigenera codice condivisione
export const regenerateCode = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    // Verifica che l'utente sia il proprietario
    const impianti = await query(
      'SELECT utente_id FROM impianti WHERE id = ?',
      [id]
    ) as RowDataPacket[];

    if (impianti.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Impianto non trovato'
      });
    }

    if (impianti[0].utente_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Solo il proprietario può rigenerare il codice'
      });
    }

    // Genera nuovo codice univoco
    let codiceCondivisione = generateCodiceCondivisione();
    let isUnique = false;

    while (!isUnique) {
      const existing = await query(
        'SELECT id FROM impianti WHERE codice_condivisione = ?',
        [codiceCondivisione]
      ) as RowDataPacket[];

      if (existing.length === 0) {
        isUnique = true;
      } else {
        codiceCondivisione = generateCodiceCondivisione();
      }
    }

    // Aggiorna impianto
    await query(
      'UPDATE impianti SET codice_condivisione = ? WHERE id = ?',
      [codiceCondivisione, id]
    );

    res.json({
      success: true,
      data: {
        codice_condivisione: codiceCondivisione
      },
      message: 'Codice rigenerato con successo'
    });
  } catch (error) {
    console.error('Errore regenerate code:', error);
    res.status(500).json({
      success: false,
      error: 'Errore durante la rigenerazione del codice'
    });
  }
};

// Ottieni condivisioni attive per un impianto
export const getCondivisioni = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    // Verifica che l'utente sia il proprietario
    const impianti = await query(
      'SELECT utente_id FROM impianti WHERE id = ?',
      [id]
    ) as RowDataPacket[];

    if (impianti.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Impianto non trovato'
      });
    }

    if (impianti[0].utente_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Solo il proprietario può vedere le condivisioni'
      });
    }

    // Ottieni condivisioni attive
    const condivisioni = await query(
      `SELECT
       ic.id,
       ic.email_utente as email,
       ic.ruolo_condivisione as ruolo,
       ic.creato_il
       FROM impianti_condivisi ic
       WHERE ic.impianto_id = ?
       ORDER BY ic.creato_il DESC`,
      [id]
    ) as RowDataPacket[];

    res.json({
      success: true,
      data: condivisioni
    });
  } catch (error) {
    console.error('Errore get condivisioni:', error);
    res.status(500).json({
      success: false,
      error: 'Errore durante il recupero delle condivisioni'
    });
  }
};

// Revoca accesso condivisione
export const revokeCondivisione = async (req: Request, res: Response) => {
  try {
    const { id } = req.params; // ID condivisione
    const userId = req.user?.userId;

    // Verifica che l'utente sia il proprietario dell'impianto
    const condivisioni = await query(
      `SELECT ic.id, i.utente_id
       FROM impianti_condivisi ic
       INNER JOIN impianti i ON ic.impianto_id = i.id
       WHERE ic.id = ?`,
      [id]
    ) as RowDataPacket[];

    if (condivisioni.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Condivisione non trovata'
      });
    }

    if (condivisioni[0].utente_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Solo il proprietario può revocare condivisioni'
      });
    }

    // Elimina condivisione
    await query('DELETE FROM impianti_condivisi WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'Accesso revocato con successo'
    });
  } catch (error) {
    console.error('Errore revoke condivisione:', error);
    res.status(500).json({
      success: false,
      error: 'Errore durante la revoca dell\'accesso'
    });
  }
};

// Connetti ad impianto esistente tramite codice condivisione
export const connectImpianto = async (req: Request, res: Response) => {
  try {
    const { codice_condivisione } = req.body;
    const utente_id = req.user?.userId;
    const email_utente = req.user?.email;

    if (!codice_condivisione) {
      return res.status(400).json({
        success: false,
        error: 'Codice condivisione richiesto'
      });
    }

    // Verifica che l'impianto esista
    const impianti = await query(
      'SELECT id, nome FROM impianti WHERE codice_condivisione = ?',
      [codice_condivisione.toUpperCase()]
    ) as RowDataPacket[];

    if (impianti.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Codice condivisione non valido'
      });
    }

    const impianto = impianti[0];

    // Verifica se l'utente ha già accesso
    const existing = await query(
      'SELECT id FROM impianti_condivisi WHERE impianto_id = ? AND utente_id = ?',
      [impianto.id, utente_id]
    ) as RowDataPacket[];

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Hai già accesso a questo impianto'
      });
    }

    // Crea condivisione
    await query(
      'INSERT INTO impianti_condivisi (impianto_id, utente_id, email_utente, ruolo_condivisione) VALUES (?, ?, ?, ?)',
      [impianto.id, utente_id, email_utente, 'controllore']
    );

    res.json({
      success: true,
      message: `Connesso con successo all'impianto "${impianto.nome}"`,
      data: {
        impianto_id: impianto.id,
        nome: impianto.nome
      }
    });
  } catch (error) {
    console.error('Errore connect impianto:', error);
    res.status(500).json({
      success: false,
      error: 'Errore durante la connessione all\'impianto'
    });
  }
};
