import { Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import crypto from 'crypto';

// ============================================
// SESSIONS CONTROLLER
// Gestione sessioni utente (dispositivi connessi)
// ============================================

// Crea tabella sessioni se non esiste
export const initSessionsTable = async () => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS sessioni (
        id INT AUTO_INCREMENT PRIMARY KEY,
        utente_id INT NOT NULL,
        token_hash VARCHAR(255) NOT NULL,
        device_info VARCHAR(255),
        browser VARCHAR(255),
        ip_address VARCHAR(45),
        location VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NULL,
        FOREIGN KEY (utente_id) REFERENCES utenti(id) ON DELETE CASCADE,
        INDEX idx_utente_id (utente_id),
        INDEX idx_token_hash (token_hash)
      )
    `);
    console.log('✅ Tabella sessioni verificata/creata');
  } catch (error) {
    console.error('❌ Errore creazione tabella sessioni:', error);
  }
};

// Helper: genera hash del token
export const hashToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

// Helper: parse User-Agent per estrarre device e browser
const parseUserAgent = (userAgent: string): { device: string; browser: string } => {
  let device = 'Sconosciuto';
  let browser = 'Sconosciuto';

  // Detect device
  if (/iPhone/i.test(userAgent)) {
    device = 'iPhone';
  } else if (/iPad/i.test(userAgent)) {
    device = 'iPad';
  } else if (/Android/i.test(userAgent)) {
    if (/Mobile/i.test(userAgent)) {
      device = 'Android Phone';
    } else {
      device = 'Android Tablet';
    }
  } else if (/Macintosh/i.test(userAgent)) {
    device = 'Mac';
  } else if (/Windows/i.test(userAgent)) {
    device = 'Windows PC';
  } else if (/Linux/i.test(userAgent)) {
    device = 'Linux PC';
  }

  // Detect browser
  if (/Chrome/i.test(userAgent) && !/Edg/i.test(userAgent)) {
    browser = 'Chrome';
  } else if (/Safari/i.test(userAgent) && !/Chrome/i.test(userAgent)) {
    browser = 'Safari';
  } else if (/Firefox/i.test(userAgent)) {
    browser = 'Firefox';
  } else if (/Edg/i.test(userAgent)) {
    browser = 'Edge';
  } else if (/Opera|OPR/i.test(userAgent)) {
    browser = 'Opera';
  }

  return { device, browser };
};

// Crea una nuova sessione (chiamata al login)
export const createSession = async (
  userId: number,
  token: string,
  userAgent: string,
  ipAddress: string
): Promise<number> => {
  const tokenHash = hashToken(token);
  const { device, browser } = parseUserAgent(userAgent);

  // Calcola scadenza (7 giorni come il JWT)
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const result = await query(
    `INSERT INTO sessioni (utente_id, token_hash, device_info, browser, ip_address, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, tokenHash, device, browser, ipAddress, expiresAt]
  ) as ResultSetHeader;

  return result.insertId;
};

// GET /api/sessions - Lista sessioni utente
export const getSessions = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const currentToken = req.headers.authorization?.replace('Bearer ', '');
    const currentTokenHash = currentToken ? hashToken(currentToken) : null;

    const sessions = await query(
      `SELECT id, device_info, browser, ip_address, location, created_at, last_active
       FROM sessioni
       WHERE utente_id = ? AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY last_active DESC`,
      [userId]
    ) as RowDataPacket[];

    // Marca la sessione corrente
    const sessionsWithCurrent = sessions.map((session: any) => ({
      id: session.id,
      device: session.device_info || 'Dispositivo',
      browser: session.browser || 'Browser',
      ipAddress: session.ip_address,
      location: session.location || 'Posizione sconosciuta',
      createdAt: session.created_at,
      lastActive: session.last_active,
      isCurrent: false // Sarà impostato dal frontend confrontando con la sessione attuale
    }));

    // Trova la sessione corrente tramite token hash
    if (currentTokenHash) {
      const currentSession = await query(
        'SELECT id FROM sessioni WHERE token_hash = ?',
        [currentTokenHash]
      ) as RowDataPacket[];

      if (currentSession.length > 0) {
        const currentId = currentSession[0].id;
        sessionsWithCurrent.forEach((s: any) => {
          if (s.id === currentId) {
            s.isCurrent = true;
          }
        });
      }
    }

    res.json({
      success: true,
      data: sessionsWithCurrent
    });
  } catch (error) {
    console.error('Errore getSessions:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nel recupero delle sessioni'
    });
  }
};

// DELETE /api/sessions/:id - Termina una sessione specifica
export const deleteSession = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const sessionId = parseInt(req.params.id);

    if (isNaN(sessionId)) {
      return res.status(400).json({
        success: false,
        error: 'ID sessione non valido'
      });
    }

    // Verifica che la sessione appartenga all'utente
    const session = await query(
      'SELECT id FROM sessioni WHERE id = ? AND utente_id = ?',
      [sessionId, userId]
    ) as RowDataPacket[];

    if (session.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Sessione non trovata'
      });
    }

    // Elimina la sessione
    await query('DELETE FROM sessioni WHERE id = ?', [sessionId]);

    res.json({
      success: true,
      message: 'Sessione terminata'
    });
  } catch (error) {
    console.error('Errore deleteSession:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nella terminazione della sessione'
    });
  }
};

// DELETE /api/sessions/all - Termina tutte le sessioni tranne quella corrente
export const deleteAllSessions = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const currentToken = req.headers.authorization?.replace('Bearer ', '');
    const currentTokenHash = currentToken ? hashToken(currentToken) : null;

    if (!currentTokenHash) {
      return res.status(400).json({
        success: false,
        error: 'Token corrente non trovato'
      });
    }

    // Elimina tutte le sessioni tranne quella corrente
    const result = await query(
      'DELETE FROM sessioni WHERE utente_id = ? AND token_hash != ?',
      [userId, currentTokenHash]
    ) as ResultSetHeader;

    res.json({
      success: true,
      message: `${result.affectedRows} sessioni terminate`
    });
  } catch (error) {
    console.error('Errore deleteAllSessions:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nella terminazione delle sessioni'
    });
  }
};

// Aggiorna last_active di una sessione (chiamata dal middleware)
export const updateSessionActivity = async (tokenHash: string): Promise<void> => {
  try {
    await query(
      'UPDATE sessioni SET last_active = NOW() WHERE token_hash = ?',
      [tokenHash]
    );
  } catch (error) {
    // Silently fail - non bloccare la richiesta
    console.error('Errore updateSessionActivity:', error);
  }
};

// Verifica se una sessione esiste ed è valida
export const isSessionValid = async (tokenHash: string): Promise<boolean> => {
  try {
    const sessions = await query(
      'SELECT id FROM sessioni WHERE token_hash = ? AND (expires_at IS NULL OR expires_at > NOW())',
      [tokenHash]
    ) as RowDataPacket[];
    return sessions.length > 0;
  } catch (error) {
    console.error('Errore isSessionValid:', error);
    return true; // In caso di errore, permetti l'accesso (fail-open per non bloccare)
  }
};

// Elimina sessione al logout
export const deleteSessionByToken = async (token: string): Promise<void> => {
  try {
    const tokenHash = hashToken(token);
    await query('DELETE FROM sessioni WHERE token_hash = ?', [tokenHash]);
  } catch (error) {
    console.error('Errore deleteSessionByToken:', error);
  }
};

// Pulisci sessioni scadute (da chiamare periodicamente)
export const cleanupExpiredSessions = async (): Promise<void> => {
  try {
    const result = await query(
      'DELETE FROM sessioni WHERE expires_at IS NOT NULL AND expires_at < NOW()'
    ) as ResultSetHeader;
    if (result.affectedRows > 0) {
      console.log(`🧹 Pulite ${result.affectedRows} sessioni scadute`);
    }
  } catch (error) {
    console.error('Errore cleanupExpiredSessions:', error);
  }
};
