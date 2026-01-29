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

    // TUTTI gli utenti (incluso admin) vedono solo:
    // 1. I propri impianti (utente_id = userId)
    // 2. Gli impianti condivisi con loro (dalla tabella condivisioni_impianto con stato='accettato')
    // L'admin accede ad ALTRI impianti tramite "Gestione Admin" → ricerca
    const propri = await query(
      'SELECT * FROM impianti WHERE utente_id = ? ORDER BY creato_il DESC',
      [userId]
    ) as RowDataPacket[];

    // Query sulla tabella corretta: condivisioni_impianto con stato='accettato'
    const condivisi = await query(
      `SELECT i.* FROM impianti i
       INNER JOIN condivisioni_impianto c ON i.id = c.impianto_id
       WHERE c.utente_id = ? AND c.stato = 'accettato'
       ORDER BY i.creato_il DESC`,
      [userId]
    ) as RowDataPacket[];

    // Unisci senza duplicati
    const impiantiMap = new Map();
    [...propri, ...condivisi].forEach(imp => {
      impiantiMap.set(imp.id, imp);
    });
    impianti = Array.from(impiantiMap.values());

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

    // Verifica accesso - include condivisioni
    // Admin può sempre accedere
    if (ruolo !== UserRole.ADMIN) {
      // Proprietario originale o installatore originale possono accedere
      const isOwner = impianto.utente_id === userId;
      const isInstaller = impianto.installatore_id === userId;

      if (!isOwner && !isInstaller) {
        // Controlla se ha una condivisione accettata
        const condivisioni = await query(
          'SELECT id FROM condivisioni_impianto WHERE impianto_id = ? AND utente_id = ? AND stato = ?',
          [id, userId, 'accettato']
        ) as RowDataPacket[];

        if (condivisioni.length === 0) {
          return res.status(403).json({
            success: false,
            error: 'Accesso negato'
          });
        }
      }
    }

    // Ottieni tutto con una sola query JOIN (fix N+1 problem)
    const allData = await query(
      `SELECT
        p.id as piano_id, p.nome as piano_nome, p.ordine as piano_ordine,
        s.id as stanza_id, s.nome as stanza_nome, s.ordine as stanza_ordine, s.icona as stanza_icona,
        d.id as dispositivo_id, d.nome as dispositivo_nome, d.tipo, d.stato, d.power_state,
        d.topic_mqtt, d.ip_address, d.mac_address, d.bloccato, d.configurazione
      FROM piani p
      LEFT JOIN stanze s ON s.piano_id = p.id
      LEFT JOIN dispositivi d ON d.stanza_id = s.id
      WHERE p.impianto_id = ?
      ORDER BY p.ordine, s.ordine, d.nome`,
      [id]
    ) as RowDataPacket[];

    // Ricostruisci struttura gerarchica in memoria (O(n) invece di O(n³))
    const pianiMap = new Map<number, any>();
    const stanzeMap = new Map<number, any>();

    for (const row of allData) {
      // Aggiungi piano se non esiste
      if (row.piano_id && !pianiMap.has(row.piano_id)) {
        pianiMap.set(row.piano_id, {
          id: row.piano_id,
          nome: row.piano_nome,
          ordine: row.piano_ordine,
          stanze: []
        });
      }

      // Aggiungi stanza se non esiste
      if (row.stanza_id && !stanzeMap.has(row.stanza_id)) {
        const stanza = {
          id: row.stanza_id,
          nome: row.stanza_nome,
          ordine: row.stanza_ordine,
          icona: row.stanza_icona,
          dispositivi: []
        };
        stanzeMap.set(row.stanza_id, stanza);

        // Collega stanza al piano
        const piano = pianiMap.get(row.piano_id);
        if (piano) {
          piano.stanze.push(stanza);
        }
      }

      // Aggiungi dispositivo alla stanza
      if (row.dispositivo_id && row.stanza_id) {
        const stanza = stanzeMap.get(row.stanza_id);
        if (stanza) {
          stanza.dispositivi.push({
            id: row.dispositivo_id,
            nome: row.dispositivo_nome,
            tipo: row.tipo,
            stato: row.stato,
            power_state: row.power_state,
            topic_mqtt: row.topic_mqtt,
            ip_address: row.ip_address,
            mac_address: row.mac_address,
            bloccato: row.bloccato,
            configurazione: row.configurazione
          });
        }
      }
    }

    const piani = Array.from(pianiMap.values());

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
    const ruolo = req.user?.ruolo;

    // Solo ADMIN e INSTALLATORE possono creare impianti
    // PROPRIETARIO può solo gestire impianti esistenti (invitato da altri)
    if (ruolo === UserRole.PROPRIETARIO) {
      return res.status(403).json({
        success: false,
        error: 'I proprietari non possono creare nuovi impianti. Contatta un installatore.'
      });
    }

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

    // Prima resetta i gateway associati a questo impianto
    await query(
      `UPDATE gateways SET impianto_id = NULL, status = 'pending' WHERE impianto_id = ?`,
      [id]
    );

    // Poi elimina l'impianto (le FK ON DELETE CASCADE gestiranno le altre tabelle)
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

    // Ottieni condivisioni attive (dalla tabella condivisioni_impianto)
    const condivisioni = await query(
      `SELECT
       c.id,
       c.email_invitato as email,
       c.accesso_completo,
       c.stato,
       c.creato_il
       FROM condivisioni_impianto c
       WHERE c.impianto_id = ? AND c.stato = 'accettato'
       ORDER BY c.creato_il DESC`,
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
      `SELECT c.id, i.utente_id
       FROM condivisioni_impianto c
       INNER JOIN impianti i ON c.impianto_id = i.id
       WHERE c.id = ?`,
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
    await query('DELETE FROM condivisioni_impianto WHERE id = ?', [id]);

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

    // Verifica se l'utente ha già accesso (condivisione accettata)
    const existing = await query(
      `SELECT id FROM condivisioni_impianto
       WHERE impianto_id = ? AND utente_id = ? AND stato = 'accettato'`,
      [impianto.id, utente_id]
    ) as RowDataPacket[];

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Hai già accesso a questo impianto'
      });
    }

    // Crea condivisione diretta (già accettata perché tramite codice)
    // accesso_completo = FALSE per codice condivisione (ospite)
    await query(
      `INSERT INTO condivisioni_impianto
       (impianto_id, utente_id, email_invitato, accesso_completo, stato, invitato_da, accettato_il,
        puo_controllare_dispositivi, puo_vedere_stato)
       VALUES (?, ?, ?, FALSE, 'accettato', ?, NOW(), TRUE, TRUE)`,
      [impianto.id, utente_id, email_utente, utente_id]
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
