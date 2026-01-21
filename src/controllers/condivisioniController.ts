import { Request, Response } from 'express';
import { query } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { UserRole } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { sendInviteEmail } from '../services/emailService';
import { emitNotificationToUser } from '../socket';

// ============================================
// CONTROLLER CONDIVISIONI IMPIANTO
// Sistema di inviti e permessi
// ============================================

interface Condivisione extends RowDataPacket {
  id: number;
  impianto_id: number;
  utente_id: number | null;
  email_invitato: string;
  ruolo_condivisione: 'installatore' | 'ospite' | 'proprietario';
  stato: 'pendente' | 'accettato' | 'rifiutato';
  puo_controllare_dispositivi: boolean;
  puo_vedere_stato: boolean;
  stanze_abilitate: number[] | null;
  invitato_da: number;
  token_invito: string | null;
  token_scadenza: Date | null;
  creato_il: Date;
  accettato_il: Date | null;
}

// ============================================
// HELPER: Verifica permessi GESTIONE su impianto
// (invitare, rimuovere, modificare condivisioni)
// ============================================
const canManageCondivisioni = async (
  userId: number,
  ruolo: UserRole,
  impiantoId: number
): Promise<boolean> => {
  // Admin può tutto
  if (ruolo === UserRole.ADMIN) return true;

  // Cerca l'impianto
  const impianti = await query(
    'SELECT utente_id, installatore_id FROM impianti WHERE id = ?',
    [impiantoId]
  ) as RowDataPacket[];

  if (impianti.length === 0) return false;

  const impianto = impianti[0];

  // Proprietario ORIGINALE può gestire
  if (impianto.utente_id === userId) return true;

  // Installatore ORIGINALE dell'impianto può gestire
  if (ruolo === UserRole.INSTALLATORE && impianto.installatore_id === userId) return true;

  return false;
};

// ============================================
// HELPER: Verifica permessi VISUALIZZAZIONE condivisioni
// (tutti quelli che hanno accesso all'impianto possono vedere)
// ============================================
const canViewCondivisioni = async (
  userId: number,
  ruolo: UserRole,
  impiantoId: number
): Promise<boolean> => {
  // Admin può sempre vedere
  if (ruolo === UserRole.ADMIN) return true;

  // Cerca l'impianto
  const impianti = await query(
    'SELECT utente_id, installatore_id FROM impianti WHERE id = ?',
    [impiantoId]
  ) as RowDataPacket[];

  if (impianti.length === 0) return false;

  const impianto = impianti[0];

  // Proprietario ORIGINALE può vedere
  if (impianto.utente_id === userId) return true;

  // Installatore ORIGINALE può vedere
  if (impianto.installatore_id === userId) return true;

  // Utenti CONDIVISI (proprietari condivisi, installatori condivisi, ospiti) possono vedere
  const condivisioni = await query(
    'SELECT id FROM condivisioni_impianto WHERE impianto_id = ? AND utente_id = ? AND stato = ?',
    [impiantoId, userId, 'accettato']
  ) as RowDataPacket[];

  return condivisioni.length > 0;
};

// ============================================
// GET /api/impianti/:id/condivisioni
// Lista condivisioni di un impianto
// Tutti gli utenti con accesso all'impianto possono vedere
// ============================================
export const getCondivisioni = async (req: Request, res: Response) => {
  try {
    const { id: impiantoId } = req.params;
    const userId = req.user!.userId;
    const ruolo = req.user!.ruolo;

    // Verifica permessi di VISUALIZZAZIONE (non gestione)
    const canView = await canViewCondivisioni(userId, ruolo, parseInt(impiantoId));
    if (!canView) {
      return res.status(403).json({
        success: false,
        error: 'Non hai i permessi per visualizzare le condivisioni di questo impianto'
      });
    }

    // Ottieni condivisioni con info utente
    const condivisioni = await query(`
      SELECT
        c.*,
        u.nome as utente_nome,
        u.cognome as utente_cognome,
        inv.nome as invitato_da_nome,
        inv.cognome as invitato_da_cognome
      FROM condivisioni_impianto c
      LEFT JOIN utenti u ON c.utente_id = u.id
      LEFT JOIN utenti inv ON c.invitato_da = inv.id
      WHERE c.impianto_id = ?
      ORDER BY c.creato_il DESC
    `, [impiantoId]) as RowDataPacket[];

    res.json({
      success: true,
      data: condivisioni
    });
  } catch (error) {
    console.error('Errore getCondivisioni:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nel recupero delle condivisioni'
    });
  }
};

// ============================================
// POST /api/impianti/:id/condivisioni
// Invita utente all'impianto
// ============================================
export const invitaUtente = async (req: Request, res: Response) => {
  try {
    const { id: impiantoId } = req.params;
    const userId = req.user!.userId;
    const ruolo = req.user!.ruolo;
    const {
      email,
      ruolo_condivisione,
      puo_controllare_dispositivi = true,
      puo_vedere_stato = true,
      stanze_abilitate = null
    } = req.body;

    // Validazione
    if (!email || !ruolo_condivisione) {
      return res.status(400).json({
        success: false,
        error: 'Email e ruolo sono obbligatori'
      });
    }

    // Admin può invitare anche 'proprietario', altri solo 'installatore' o 'ospite'
    const ruoliConsentiti = ruolo === UserRole.ADMIN
      ? ['installatore', 'ospite', 'proprietario']
      : ['installatore', 'ospite'];

    if (!ruoliConsentiti.includes(ruolo_condivisione)) {
      return res.status(400).json({
        success: false,
        error: ruolo === UserRole.ADMIN
          ? 'Ruolo non valido. Deve essere "installatore", "ospite" o "proprietario"'
          : 'Ruolo non valido. Deve essere "installatore" o "ospite"'
      });
    }

    // Verifica permessi
    const canManage = await canManageCondivisioni(userId, ruolo, parseInt(impiantoId));
    if (!canManage) {
      return res.status(403).json({
        success: false,
        error: 'Non hai i permessi per invitare utenti a questo impianto'
      });
    }

    // Verifica che l'impianto esista
    const impianti = await query(
      'SELECT id, nome FROM impianti WHERE id = ?',
      [impiantoId]
    ) as RowDataPacket[];

    if (impianti.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Impianto non trovato'
      });
    }

    const impiantoNome = impianti[0].nome;

    // Verifica che non esista già una condivisione per questa email
    const esistenti = await query(
      'SELECT id FROM condivisioni_impianto WHERE impianto_id = ? AND email_invitato = ?',
      [impiantoId, email.toLowerCase()]
    ) as RowDataPacket[];

    if (esistenti.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Questo utente è già stato invitato a questo impianto'
      });
    }

    // Cerca se l'utente esiste già
    const utenti = await query(
      'SELECT id, nome FROM utenti WHERE email = ?',
      [email.toLowerCase()]
    ) as RowDataPacket[];

    const utenteEsistente = utenti.length > 0 ? utenti[0] : null;
    let tokenInvito: string | null = null;
    let tokenScadenza: Date | null = null;

    // Se utente non esiste, genera token per invito via email
    if (!utenteEsistente) {
      tokenInvito = uuidv4();
      tokenScadenza = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 giorni
    }

    // Crea condivisione
    const result = await query(`
      INSERT INTO condivisioni_impianto (
        impianto_id, utente_id, email_invitato, ruolo_condivisione,
        puo_controllare_dispositivi, puo_vedere_stato, stanze_abilitate,
        invitato_da, token_invito, token_scadenza
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      impiantoId,
      utenteEsistente?.id || null,
      email.toLowerCase(),
      ruolo_condivisione,
      puo_controllare_dispositivi,
      puo_vedere_stato,
      stanze_abilitate ? JSON.stringify(stanze_abilitate) : null,
      userId,
      tokenInvito,
      tokenScadenza
    ]) as ResultSetHeader;

    const condivisioneId = result.insertId;

    // Se utente esiste, crea notifica in-app
    if (utenteEsistente) {
      // Crea notifica nel database
      await query(`
        INSERT INTO notifiche (utente_id, tipo, titolo, messaggio, letta)
        VALUES (?, 'info', ?, ?, false)
      `, [
        utenteEsistente.id,
        'Nuovo invito impianto',
        `Sei stato invitato a gestire l'impianto "${impiantoNome}" come ${ruolo_condivisione}`
      ]);

      // Emit notifica via WebSocket
      emitNotificationToUser(utenteEsistente.id, {
        tipo: 'invito',
        titolo: 'Nuovo invito impianto',
        messaggio: `Sei stato invitato a gestire l'impianto "${impiantoNome}"`,
        condivisione_id: condivisioneId
      });
    } else {
      // Invia email di invito
      try {
        await sendInviteEmail(
          email.toLowerCase(),
          impiantoNome,
          ruolo_condivisione,
          tokenInvito!
        );
        console.log(`📧 Email invito inviata a: ${email}`);
      } catch (emailError) {
        console.error('Errore invio email invito:', emailError);
        // Non blocchiamo - l'invito è stato creato
      }
    }

    // Recupera condivisione creata
    const nuovaCondivisione = await query(`
      SELECT c.*, u.nome as utente_nome, u.cognome as utente_cognome
      FROM condivisioni_impianto c
      LEFT JOIN utenti u ON c.utente_id = u.id
      WHERE c.id = ?
    `, [condivisioneId]) as RowDataPacket[];

    console.log(`✅ Invito creato: ${email} -> impianto ${impiantoId} (${ruolo_condivisione})`);

    res.status(201).json({
      success: true,
      data: nuovaCondivisione[0],
      message: utenteEsistente
        ? 'Invito inviato. L\'utente riceverà una notifica.'
        : 'Invito inviato via email. L\'utente dovrà registrarsi per accettare.'
    });
  } catch (error: any) {
    console.error('Errore invitaUtente:', error);

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        success: false,
        error: 'Questo utente è già stato invitato a questo impianto'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Errore durante l\'invio dell\'invito'
    });
  }
};

// ============================================
// PUT /api/condivisioni/:id
// Modifica permessi condivisione
// ============================================
export const modificaPermessi = async (req: Request, res: Response) => {
  try {
    const { id: condivisioneId } = req.params;
    const userId = req.user!.userId;
    const ruolo = req.user!.ruolo;
    const {
      puo_controllare_dispositivi,
      puo_vedere_stato,
      stanze_abilitate,
      ruolo_condivisione
    } = req.body;

    console.log(`📝 modificaPermessi chiamato: condivisioneId=${condivisioneId}, body=`, req.body);

    // Ottieni condivisione
    const condivisioni = await query(
      'SELECT * FROM condivisioni_impianto WHERE id = ?',
      [condivisioneId]
    ) as Condivisione[];

    if (condivisioni.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Condivisione non trovata'
      });
    }

    const condivisione = condivisioni[0];

    // Verifica permessi con gerarchia (chi può modificare chi)
    const { canModify, reason } = await canModifyCondivisione(userId, ruolo, condivisione);
    if (!canModify) {
      return res.status(403).json({
        success: false,
        error: reason || 'Non hai i permessi per modificare questa condivisione'
      });
    }

    // Costruisci query di update
    const updates: string[] = [];
    const values: any[] = [];

    if (puo_controllare_dispositivi !== undefined) {
      updates.push('puo_controllare_dispositivi = ?');
      values.push(puo_controllare_dispositivi);
    }
    if (puo_vedere_stato !== undefined) {
      updates.push('puo_vedere_stato = ?');
      values.push(puo_vedere_stato);
    }
    if (stanze_abilitate !== undefined) {
      updates.push('stanze_abilitate = ?');
      values.push(stanze_abilitate ? JSON.stringify(stanze_abilitate) : null);
    }
    if (ruolo_condivisione !== undefined && ['installatore', 'ospite'].includes(ruolo_condivisione)) {
      updates.push('ruolo_condivisione = ?');
      values.push(ruolo_condivisione);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Nessun campo da aggiornare'
      });
    }

    values.push(condivisioneId);

    await query(
      `UPDATE condivisioni_impianto SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    // Recupera condivisione aggiornata
    const aggiornata = await query(
      'SELECT * FROM condivisioni_impianto WHERE id = ?',
      [condivisioneId]
    ) as RowDataPacket[];

    // Emetti evento WebSocket all'utente interessato per aggiornamento real-time
    if (condivisione.utente_id) {
      emitNotificationToUser(condivisione.utente_id, {
        tipo: 'permessi-aggiornati',
        impianto_id: condivisione.impianto_id,
        puo_controllare_dispositivi: aggiornata[0].puo_controllare_dispositivi,
        puo_vedere_stato: aggiornata[0].puo_vedere_stato,
        stanze_abilitate: aggiornata[0].stanze_abilitate
      });
      console.log(`📡 Permessi aggiornati inviati a user ${condivisione.utente_id}`);
    }

    res.json({
      success: true,
      data: aggiornata[0],
      message: 'Permessi aggiornati con successo'
    });
  } catch (error) {
    console.error('Errore modificaPermessi:', error);
    res.status(500).json({
      success: false,
      error: 'Errore durante la modifica dei permessi'
    });
  }
};

// ============================================
// DELETE /api/condivisioni/:id
// Rimuovi condivisione
// ============================================
export const rimuoviCondivisione = async (req: Request, res: Response) => {
  try {
    const { id: condivisioneId } = req.params;
    const userId = req.user!.userId;
    const ruolo = req.user!.ruolo;

    // Ottieni condivisione
    const condivisioni = await query(
      'SELECT * FROM condivisioni_impianto WHERE id = ?',
      [condivisioneId]
    ) as Condivisione[];

    if (condivisioni.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Condivisione non trovata'
      });
    }

    const condivisione = condivisioni[0];

    // L'utente può sempre rimuovere la propria condivisione (lasciare impianto)
    const isOwnShare = condivisione.utente_id === userId;

    if (!isOwnShare) {
      // Verifica permessi con gerarchia (chi può modificare/rimuovere chi)
      const { canModify, reason } = await canModifyCondivisione(userId, ruolo, condivisione);
      if (!canModify) {
        return res.status(403).json({
          success: false,
          error: reason || 'Non hai i permessi per rimuovere questa condivisione'
        });
      }
    }

    await query('DELETE FROM condivisioni_impianto WHERE id = ?', [condivisioneId]);

    // Emetti evento WebSocket all'utente che ha perso l'accesso
    if (condivisione.utente_id) {
      emitNotificationToUser(condivisione.utente_id, {
        tipo: 'condivisione-rimossa',
        impianto_id: condivisione.impianto_id
      });
      console.log(`📡 Condivisione rimossa inviata a user ${condivisione.utente_id}`);
    }

    console.log(`🗑️ Condivisione ${condivisioneId} rimossa`);

    res.json({
      success: true,
      message: 'Condivisione rimossa con successo'
    });
  } catch (error) {
    console.error('Errore rimuoviCondivisione:', error);
    res.status(500).json({
      success: false,
      error: 'Errore durante la rimozione della condivisione'
    });
  }
};

// ============================================
// POST /api/condivisioni/:id/accetta
// Accetta invito
// ============================================
export const accettaInvito = async (req: Request, res: Response) => {
  try {
    const { id: condivisioneId } = req.params;
    const userId = req.user!.userId;
    const userEmail = req.user!.email;

    // Ottieni condivisione
    const condivisioni = await query(
      'SELECT * FROM condivisioni_impianto WHERE id = ?',
      [condivisioneId]
    ) as Condivisione[];

    if (condivisioni.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Invito non trovato'
      });
    }

    const condivisione = condivisioni[0];

    // Verifica che l'invito sia per questo utente
    if (condivisione.email_invitato !== userEmail.toLowerCase()) {
      return res.status(403).json({
        success: false,
        error: 'Questo invito non è per te'
      });
    }

    // Verifica stato
    if (condivisione.stato !== 'pendente') {
      return res.status(400).json({
        success: false,
        error: `Questo invito è già stato ${condivisione.stato}`
      });
    }

    // Accetta invito
    await query(`
      UPDATE condivisioni_impianto
      SET stato = 'accettato', utente_id = ?, accettato_il = NOW()
      WHERE id = ?
    `, [userId, condivisioneId]);

    // Recupera info impianto
    const impianti = await query(
      'SELECT nome FROM impianti WHERE id = ?',
      [condivisione.impianto_id]
    ) as RowDataPacket[];

    console.log(`✅ Invito ${condivisioneId} accettato da user ${userId}`);

    res.json({
      success: true,
      message: `Hai accettato l'invito per l'impianto "${impianti[0]?.nome}"`,
      data: {
        impianto_id: condivisione.impianto_id,
        ruolo_condivisione: condivisione.ruolo_condivisione
      }
    });
  } catch (error) {
    console.error('Errore accettaInvito:', error);
    res.status(500).json({
      success: false,
      error: 'Errore durante l\'accettazione dell\'invito'
    });
  }
};

// ============================================
// POST /api/condivisioni/:id/rifiuta
// Rifiuta invito
// ============================================
export const rifiutaInvito = async (req: Request, res: Response) => {
  try {
    const { id: condivisioneId } = req.params;
    const userId = req.user!.userId;
    const userEmail = req.user!.email;

    // Ottieni condivisione
    const condivisioni = await query(
      'SELECT * FROM condivisioni_impianto WHERE id = ?',
      [condivisioneId]
    ) as Condivisione[];

    if (condivisioni.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Invito non trovato'
      });
    }

    const condivisione = condivisioni[0];

    // Verifica che l'invito sia per questo utente
    if (condivisione.email_invitato !== userEmail.toLowerCase()) {
      return res.status(403).json({
        success: false,
        error: 'Questo invito non è per te'
      });
    }

    // Verifica stato
    if (condivisione.stato !== 'pendente') {
      return res.status(400).json({
        success: false,
        error: `Questo invito è già stato ${condivisione.stato}`
      });
    }

    // Rifiuta invito
    await query(`
      UPDATE condivisioni_impianto
      SET stato = 'rifiutato', utente_id = ?
      WHERE id = ?
    `, [userId, condivisioneId]);

    console.log(`❌ Invito ${condivisioneId} rifiutato da user ${userId}`);

    res.json({
      success: true,
      message: 'Invito rifiutato'
    });
  } catch (error) {
    console.error('Errore rifiutaInvito:', error);
    res.status(500).json({
      success: false,
      error: 'Errore durante il rifiuto dell\'invito'
    });
  }
};

// ============================================
// GET /api/inviti/pendenti
// Lista inviti pendenti per l'utente loggato
// ============================================
export const getInvitiPendenti = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const userEmail = req.user!.email;

    const inviti = await query(`
      SELECT
        c.*,
        i.nome as impianto_nome,
        i.indirizzo as impianto_indirizzo,
        i.citta as impianto_citta,
        inv.nome as invitato_da_nome,
        inv.cognome as invitato_da_cognome
      FROM condivisioni_impianto c
      JOIN impianti i ON c.impianto_id = i.id
      JOIN utenti inv ON c.invitato_da = inv.id
      WHERE c.email_invitato = ? AND c.stato = 'pendente'
      ORDER BY c.creato_il DESC
    `, [userEmail.toLowerCase()]) as RowDataPacket[];

    res.json({
      success: true,
      data: inviti
    });
  } catch (error) {
    console.error('Errore getInvitiPendenti:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nel recupero degli inviti pendenti'
    });
  }
};

// ============================================
// GET /api/impianti/:id/miei-permessi
// Ottieni i propri permessi su un impianto
// ============================================
export const getMieiPermessi = async (req: Request, res: Response) => {
  try {
    const { id: impiantoId } = req.params;
    const userId = req.user!.userId;
    const ruolo = req.user!.ruolo;

    const { hasAccess, permissions } = await hasAccessToImpianto(
      userId,
      ruolo,
      parseInt(impiantoId)
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'Non hai accesso a questo impianto'
      });
    }

    res.json({
      success: true,
      data: permissions
    });
  } catch (error) {
    console.error('Errore getMieiPermessi:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nel recupero dei permessi'
    });
  }
};

// ============================================
// HELPER: Collega inviti pendenti a nuovo utente
// Chiamato dopo la registrazione
// ============================================
export const linkPendingInvites = async (userId: number, email: string): Promise<number> => {
  try {
    const result = await query(`
      UPDATE condivisioni_impianto
      SET utente_id = ?
      WHERE email_invitato = ? AND utente_id IS NULL AND stato = 'pendente'
    `, [userId, email.toLowerCase()]) as ResultSetHeader;

    if (result.affectedRows > 0) {
      console.log(`🔗 ${result.affectedRows} inviti pendenti collegati a user ${userId}`);
    }

    return result.affectedRows;
  } catch (error) {
    console.error('Errore linkPendingInvites:', error);
    return 0;
  }
};

// ============================================
// HELPER: Verifica se utente ha accesso a impianto
// LOGICA:
// - Admin → sempre accesso completo
// - Proprietario ORIGINALE (impianto.utente_id) → sempre accesso completo
// - Installatore ORIGINALE (impianto.installatore_id) → sempre accesso completo
// - TUTTI GLI ALTRI (proprietari condivisi, installatori condivisi, ospiti) → legge dal DB
// ============================================
export const hasAccessToImpianto = async (
  userId: number,
  ruolo: UserRole,
  impiantoId: number
): Promise<{ hasAccess: boolean; permissions: any }> => {
  // Admin ha sempre accesso completo
  if (ruolo === UserRole.ADMIN) {
    return {
      hasAccess: true,
      permissions: {
        puo_controllare_dispositivi: true,
        puo_vedere_stato: true,
        stanze_abilitate: null, // null = tutte
        ruolo_condivisione: 'admin'
      }
    };
  }

  // Verifica se è proprietario o installatore ORIGINALE dell'impianto
  const impianti = await query(
    'SELECT utente_id, installatore_id FROM impianti WHERE id = ?',
    [impiantoId]
  ) as RowDataPacket[];

  if (impianti.length === 0) {
    return { hasAccess: false, permissions: null };
  }

  const impianto = impianti[0];

  // Proprietario ORIGINALE ha accesso completo (quello che ha creato l'impianto)
  if (impianto.utente_id === userId) {
    return {
      hasAccess: true,
      permissions: {
        puo_controllare_dispositivi: true,
        puo_vedere_stato: true,
        stanze_abilitate: null,
        ruolo_condivisione: 'proprietario_originale'
      }
    };
  }

  // Installatore ORIGINALE dell'impianto ha accesso completo
  if (impianto.installatore_id === userId) {
    return {
      hasAccess: true,
      permissions: {
        puo_controllare_dispositivi: true,
        puo_vedere_stato: true,
        stanze_abilitate: null,
        ruolo_condivisione: 'installatore_originale'
      }
    };
  }

  // TUTTI GLI ALTRI (proprietari condivisi, installatori condivisi, ospiti) → legge dal DB
  const condivisioni = await query(`
    SELECT * FROM condivisioni_impianto
    WHERE impianto_id = ? AND utente_id = ? AND stato = 'accettato'
  `, [impiantoId, userId]) as Condivisione[];

  if (condivisioni.length === 0) {
    return { hasAccess: false, permissions: null };
  }

  const condivisione = condivisioni[0];

  return {
    hasAccess: true,
    permissions: {
      puo_controllare_dispositivi: condivisione.puo_controllare_dispositivi,
      puo_vedere_stato: condivisione.puo_vedere_stato,
      stanze_abilitate: condivisione.stanze_abilitate,
      ruolo_condivisione: condivisione.ruolo_condivisione
    }
  };
};

// ============================================
// HELPER: Verifica gerarchia permessi (chi può modificare chi)
// - Admin può modificare: installatore, proprietario, ospite
// - Installatore ORIGINALE può modificare: proprietario condiviso, ospite
// - Proprietario ORIGINALE può modificare: ospite
// - Ospite non può modificare nessuno
// ============================================
type RuoloCondivisione = 'installatore' | 'proprietario' | 'ospite';

const GERARCHIA_RUOLI: Record<string, RuoloCondivisione[]> = {
  admin: ['installatore', 'proprietario', 'ospite'],
  installatore_originale: ['proprietario', 'ospite'],
  proprietario_originale: ['ospite'],
  // Utenti condivisi non possono modificare nessuno
  installatore: [],
  proprietario: [],
  ospite: []
};

export const canModifyCondivisione = async (
  modifierUserId: number,
  modifierRuolo: UserRole,
  condivisione: Condivisione
): Promise<{ canModify: boolean; reason?: string }> => {
  // Admin può tutto
  if (modifierRuolo === UserRole.ADMIN) {
    return { canModify: true };
  }

  // Ottieni info impianto
  const impianti = await query(
    'SELECT utente_id, installatore_id FROM impianti WHERE id = ?',
    [condivisione.impianto_id]
  ) as RowDataPacket[];

  if (impianti.length === 0) {
    return { canModify: false, reason: 'Impianto non trovato' };
  }

  const impianto = impianti[0];

  // Determina il ruolo del modifier
  let modifierRole: string;
  if (impianto.installatore_id === modifierUserId) {
    modifierRole = 'installatore_originale';
  } else if (impianto.utente_id === modifierUserId) {
    modifierRole = 'proprietario_originale';
  } else {
    // Cerca se è un utente condiviso
    const modifierCondivisione = await query(`
      SELECT ruolo_condivisione FROM condivisioni_impianto
      WHERE impianto_id = ? AND utente_id = ? AND stato = 'accettato'
    `, [condivisione.impianto_id, modifierUserId]) as RowDataPacket[];

    if (modifierCondivisione.length === 0) {
      return { canModify: false, reason: 'Non hai accesso a questo impianto' };
    }
    modifierRole = modifierCondivisione[0].ruolo_condivisione;
  }

  // Verifica se può modificare il ruolo target
  const ruoliModificabili = GERARCHIA_RUOLI[modifierRole] || [];
  const targetRuolo = condivisione.ruolo_condivisione;

  if (!ruoliModificabili.includes(targetRuolo)) {
    return {
      canModify: false,
      reason: `Un ${modifierRole.replace('_', ' ')} non può modificare un ${targetRuolo}`
    };
  }

  return { canModify: true };
};
