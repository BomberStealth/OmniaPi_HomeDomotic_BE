import { Request, Response } from 'express';
import { query } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { UserRole } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { sendInviteEmail } from '../services/emailService';
import { emitNotificationToUser, emitCondivisioneUpdate } from '../socket';

// ============================================
// CONTROLLER CONDIVISIONI IMPIANTO
// Sistema di inviti e permessi
// ============================================

interface Condivisione extends RowDataPacket {
  id: number;
  impianto_id: number;
  utente_id: number | null;
  email_invitato: string;
  accesso_completo: boolean;
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
// HELPER: Calcola ruolo visualizzato
// Basato su: tipo account invitato + accesso_completo
// ============================================
// | Account invitato | Accesso completo | Ruolo visualizzato    |
// |------------------|------------------|------------------------|
// | Installatore     | SÌ               | Installatore Secondario|
// | Installatore     | NO               | Ospite                 |
// | Proprietario     | SÌ               | Co-Proprietario        |
// | Proprietario     | NO               | Ospite                 |
// ============================================
type RuoloVisualizzato = 'installatore_secondario' | 'co_proprietario' | 'ospite';

const calcRuoloVisualizzato = (
  tipoAccountInvitato: UserRole | null,
  accessoCompleto: boolean
): RuoloVisualizzato => {
  if (!accessoCompleto) {
    return 'ospite';
  }

  if (tipoAccountInvitato === UserRole.INSTALLATORE) {
    return 'installatore_secondario';
  }

  // Proprietario o Admin con accesso completo
  return 'co_proprietario';
};

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

    // Ottieni condivisioni con info utente e tipo account
    const condivisioni = await query(`
      SELECT
        c.*,
        u.nome as utente_nome,
        u.cognome as utente_cognome,
        u.ruolo as utente_tipo_account,
        inv.nome as invitato_da_nome,
        inv.cognome as invitato_da_cognome
      FROM condivisioni_impianto c
      LEFT JOIN utenti u ON c.utente_id = u.id
      LEFT JOIN utenti inv ON c.invitato_da = inv.id
      WHERE c.impianto_id = ?
      ORDER BY c.creato_il DESC
    `, [impiantoId]) as RowDataPacket[];

    // Calcola ruolo_visualizzato per ogni condivisione
    const condivisioniConRuolo = condivisioni.map(c => ({
      ...c,
      ruolo_visualizzato: calcRuoloVisualizzato(
        c.utente_tipo_account as UserRole | null,
        c.accesso_completo
      )
    }));

    res.json({
      success: true,
      data: condivisioniConRuolo
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
      accesso_completo = false,
      stanze_abilitate = null
    } = req.body;

    // Validazione
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email è obbligatoria'
      });
    }

    // Se non ha accesso completo, deve specificare stanze
    // (può comunque essere null per invito in sospeso)
    // I permessi sono derivati da accesso_completo:
    // - accesso_completo=true → puo_controllare_dispositivi=true, puo_vedere_stato=true
    // - accesso_completo=false → puo_vedere_stato=true, puo_controllare_dispositivi dipende da stanze
    const puo_controllare_dispositivi = accesso_completo || (stanze_abilitate && stanze_abilitate.length > 0);
    const puo_vedere_stato = true; // Sempre abilitato

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

    // Verifica che l'utente non stia invitando se stesso
    const currentUser = await query(
      'SELECT email FROM utenti WHERE id = ?',
      [userId]
    ) as RowDataPacket[];

    if (currentUser.length > 0 && currentUser[0].email.toLowerCase() === email.toLowerCase()) {
      return res.status(400).json({
        success: false,
        error: 'Non puoi invitare te stesso'
      });
    }

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
        impianto_id, utente_id, email_invitato, accesso_completo,
        puo_controllare_dispositivi, puo_vedere_stato, stanze_abilitate,
        invitato_da, token_invito, token_scadenza
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      impiantoId,
      utenteEsistente?.id || null,
      email.toLowerCase(),
      accesso_completo,
      puo_controllare_dispositivi,
      puo_vedere_stato,
      stanze_abilitate ? JSON.stringify(stanze_abilitate) : null,
      userId,
      tokenInvito,
      tokenScadenza
    ]) as ResultSetHeader;

    const condivisioneId = result.insertId;

    // Determina il tipo di accesso per il messaggio
    const tipoAccesso = accesso_completo ? 'con accesso completo' : 'come ospite';

    // Se utente esiste, crea notifica in-app
    if (utenteEsistente) {
      // Crea notifica nel database
      await query(`
        INSERT INTO notifiche (utente_id, tipo, titolo, messaggio, letta)
        VALUES (?, 'info', ?, ?, false)
      `, [
        utenteEsistente.id,
        'Nuovo invito impianto',
        `Sei stato invitato all'impianto "${impiantoNome}" ${tipoAccesso}`
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
          tipoAccesso,
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

    console.log(`✅ Invito creato: ${email} -> impianto ${impiantoId} (${tipoAccesso})`);

    // Emit real-time update alla room dell'impianto
    emitCondivisioneUpdate(parseInt(impiantoId), nuovaCondivisione[0], 'created');

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
      accesso_completo
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
    if (accesso_completo !== undefined) {
      updates.push('accesso_completo = ?');
      values.push(accesso_completo);
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

    // Emit real-time update alla room dell'impianto (per aggiornare la lista condivisioni)
    emitCondivisioneUpdate(condivisione.impianto_id, condivisione, 'removed');

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

    // Recupera info impianto e utente
    const impianti = await query(
      'SELECT nome FROM impianti WHERE id = ?',
      [condivisione.impianto_id]
    ) as RowDataPacket[];

    const utenti = await query(
      'SELECT nome, cognome FROM utenti WHERE id = ?',
      [userId]
    ) as RowDataPacket[];

    const userName = utenti[0] ? `${utenti[0].nome} ${utenti[0].cognome}` : userEmail;
    const impiantoNome = impianti[0]?.nome || 'Impianto';

    console.log(`✅ Invito ${condivisioneId} accettato da user ${userId}`);

    // Recupera condivisione aggiornata per l'emit
    const condivisioneAggiornata = await query(`
      SELECT c.*, u.nome as utente_nome, u.cognome as utente_cognome, u.ruolo as utente_tipo_account
      FROM condivisioni_impianto c
      LEFT JOIN utenti u ON c.utente_id = u.id
      WHERE c.id = ?
    `, [condivisioneId]) as RowDataPacket[];

    // Emit real-time update alla room dell'impianto
    emitCondivisioneUpdate(condivisione.impianto_id, condivisioneAggiornata[0], 'accepted');

    // Notifica chi ha inviato l'invito
    emitNotificationToUser(condivisione.invitato_da, {
      type: 'invite_accepted',
      title: 'Invito accettato!',
      message: `${userName} ha accettato l'invito per "${impiantoNome}"`,
      impiantoId: condivisione.impianto_id,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: `Hai accettato l'invito per l'impianto "${impianti[0]?.nome}"`,
      data: {
        impianto_id: condivisione.impianto_id,
        accesso_completo: condivisione.accesso_completo
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

    // Recupera info impianto e utente per la notifica
    const impianti = await query(
      'SELECT nome FROM impianti WHERE id = ?',
      [condivisione.impianto_id]
    ) as RowDataPacket[];

    const utenti = await query(
      'SELECT nome, cognome FROM utenti WHERE id = ?',
      [userId]
    ) as RowDataPacket[];

    const userName = utenti[0] ? `${utenti[0].nome} ${utenti[0].cognome}` : userEmail;
    const impiantoNome = impianti[0]?.nome || 'Impianto';

    console.log(`❌ Invito ${condivisioneId} rifiutato da user ${userId}`);

    // Notifica chi ha inviato l'invito
    emitNotificationToUser(condivisione.invitato_da, {
      type: 'invite_rejected',
      title: 'Invito rifiutato',
      message: `${userName} ha rifiutato l'invito per "${impiantoNome}"`,
      impiantoId: condivisione.impianto_id,
      timestamp: new Date().toISOString()
    });

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

  // Parsa stanze_abilitate - MySQL lo salva come stringa JSON
  let stanzeAbilitate: number[] | null = null;
  if (condivisione.stanze_abilitate) {
    if (typeof condivisione.stanze_abilitate === 'string') {
      try {
        stanzeAbilitate = JSON.parse(condivisione.stanze_abilitate);
      } catch {
        stanzeAbilitate = null;
      }
    } else if (Array.isArray(condivisione.stanze_abilitate)) {
      stanzeAbilitate = condivisione.stanze_abilitate;
    }
  }

  return {
    hasAccess: true,
    permissions: {
      puo_controllare_dispositivi: condivisione.puo_controllare_dispositivi,
      puo_vedere_stato: condivisione.puo_vedere_stato,
      stanze_abilitate: stanzeAbilitate,
      accesso_completo: condivisione.accesso_completo
    }
  };
};

// ============================================
// HELPER: Verifica gerarchia permessi (chi può modificare chi)
// - Admin può modificare: qualsiasi condivisione
// - Installatore ORIGINALE può modificare: qualsiasi condivisione
// - Proprietario ORIGINALE può modificare: qualsiasi condivisione
// - Utenti condivisi non possono modificare altre condivisioni
// ============================================
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

  // Installatore ORIGINALE può modificare qualsiasi condivisione
  if (impianto.installatore_id === modifierUserId) {
    return { canModify: true };
  }

  // Proprietario ORIGINALE può modificare qualsiasi condivisione
  if (impianto.utente_id === modifierUserId) {
    return { canModify: true };
  }

  // Utenti condivisi non possono modificare altre condivisioni
  return {
    canModify: false,
    reason: 'Solo il proprietario o l\'installatore originale possono modificare le condivisioni'
  };
};

// ============================================
// POST /api/impianti/:id/cedi-primario
// Cede il ruolo di installatore primario a un altro installatore
// Solo l'installatore ORIGINALE può cedere il ruolo
// ============================================
export const cediInstallatorePrimario = async (req: Request, res: Response) => {
  try {
    const { id: impiantoId } = req.params;
    const userId = req.user!.userId;
    const ruolo = req.user!.ruolo;
    const { nuovo_installatore_id } = req.body;

    // Solo installatori possono cedere il ruolo
    if (ruolo !== UserRole.INSTALLATORE && ruolo !== UserRole.ADMIN) {
      return res.status(403).json({
        success: false,
        error: 'Solo un installatore può cedere il ruolo primario'
      });
    }

    // Verifica che l'impianto esista e che l'utente sia l'installatore primario
    const impianti = await query(
      'SELECT id, nome, installatore_id FROM impianti WHERE id = ?',
      [impiantoId]
    ) as RowDataPacket[];

    if (impianti.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Impianto non trovato'
      });
    }

    const impianto = impianti[0];

    // Verifica che l'utente corrente sia l'installatore primario
    if (impianto.installatore_id !== userId && ruolo !== UserRole.ADMIN) {
      return res.status(403).json({
        success: false,
        error: 'Solo l\'installatore primario può cedere il ruolo'
      });
    }

    // Verifica che il nuovo installatore sia un utente condiviso con accesso completo
    // e che sia effettivamente un installatore
    const nuovoInstallatore = await query(`
      SELECT
        c.id as condivisione_id,
        c.utente_id,
        c.accesso_completo,
        u.ruolo as tipo_account,
        u.nome,
        u.cognome
      FROM condivisioni_impianto c
      JOIN utenti u ON c.utente_id = u.id
      WHERE c.impianto_id = ? AND c.utente_id = ? AND c.stato = 'accettato'
    `, [impiantoId, nuovo_installatore_id]) as RowDataPacket[];

    if (nuovoInstallatore.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Il nuovo installatore deve avere accesso all\'impianto'
      });
    }

    const candidato = nuovoInstallatore[0];

    // Verifica che sia un account installatore
    if (candidato.tipo_account !== UserRole.INSTALLATORE) {
      return res.status(400).json({
        success: false,
        error: 'Il nuovo installatore primario deve avere un account di tipo Installatore'
      });
    }

    // Verifica che abbia accesso completo
    if (!candidato.accesso_completo) {
      return res.status(400).json({
        success: false,
        error: 'Il nuovo installatore primario deve avere accesso completo all\'impianto'
      });
    }

    // Esegui la cessione in una transazione
    // 1. Aggiorna l'installatore_id dell'impianto
    await query(
      'UPDATE impianti SET installatore_id = ? WHERE id = ?',
      [nuovo_installatore_id, impiantoId]
    );

    // 2. Rimuovi la condivisione del nuovo installatore (ora è primario)
    await query(
      'DELETE FROM condivisioni_impianto WHERE id = ?',
      [candidato.condivisione_id]
    );

    // 3. Crea una condivisione per il vecchio installatore primario
    await query(`
      INSERT INTO condivisioni_impianto (
        impianto_id, utente_id, email_invitato, accesso_completo,
        puo_controllare_dispositivi, puo_vedere_stato, stanze_abilitate,
        invitato_da, stato, accettato_il
      )
      SELECT
        ?, ?, email, TRUE, TRUE, TRUE, NULL, ?, 'accettato', NOW()
      FROM utenti WHERE id = ?
    `, [impiantoId, userId, nuovo_installatore_id, userId]);

    // Notifica al nuovo installatore primario
    emitNotificationToUser(nuovo_installatore_id, {
      tipo: 'ruolo-primario',
      titolo: 'Nuovo ruolo: Installatore Primario',
      messaggio: `Sei diventato l'installatore primario dell'impianto "${impianto.nome}"`
    });

    // Notifica al vecchio installatore
    await query(`
      INSERT INTO notifiche (utente_id, tipo, titolo, messaggio, letta)
      VALUES (?, 'info', ?, ?, false)
    `, [
      userId,
      'Ruolo ceduto',
      `Hai ceduto il ruolo di installatore primario dell'impianto "${impianto.nome}" a ${candidato.nome} ${candidato.cognome}`
    ]);

    console.log(`🔄 Installatore primario ceduto: impianto ${impiantoId}, da ${userId} a ${nuovo_installatore_id}`);

    res.json({
      success: true,
      message: `Ruolo di installatore primario ceduto a ${candidato.nome} ${candidato.cognome}`
    });
  } catch (error) {
    console.error('Errore cediInstallatorePrimario:', error);
    res.status(500).json({
      success: false,
      error: 'Errore durante la cessione del ruolo'
    });
  }
};
