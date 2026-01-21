import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { jwtConfig } from '../config/jwt';
import { JWTPayload, UserRole } from '../types';
import { query } from '../config/database';
import { RowDataPacket } from 'mysql2';
import { hashToken, updateSessionActivity, isSessionValid } from '../controllers/sessionsController';

// ============================================
// MIDDLEWARE AUTENTICAZIONE JWT
// ============================================

// Estendi Express Request per includere user
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

// Export tipo AuthRequest per i controller
export interface AuthRequest extends Request {
  user?: JWTPayload;
}

// Verifica token JWT
export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Token non fornito'
      });
    }

    const decoded = jwt.verify(token, jwtConfig.secret) as JWTPayload;

    // Verifica token_version per invalidare sessioni dopo cambio password
    if (decoded.tokenVersion !== undefined) {
      const users = await query(
        'SELECT token_version FROM utenti WHERE id = ?',
        [decoded.userId]
      ) as RowDataPacket[];

      if (users.length > 0) {
        const dbTokenVersion = users[0].token_version || 0;
        if (decoded.tokenVersion !== dbTokenVersion) {
          return res.status(401).json({
            success: false,
            error: 'Sessione invalidata. Effettua nuovamente il login.',
            sessionInvalidated: true
          });
        }
      }
    }

    // Verifica e aggiorna sessione nel database
    const tokenHash = hashToken(token);

    // Verifica che la sessione esista ancora (se eliminata = logout forzato)
    const sessionValid = await isSessionValid(tokenHash);
    if (!sessionValid) {
      return res.status(401).json({
        success: false,
        error: 'Sessione terminata. Effettua nuovamente il login.',
        sessionInvalidated: true
      });
    }

    // Aggiorna last_active della sessione (async, non bloccante)
    updateSessionActivity(tokenHash).catch(() => {});

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Token non valido o scaduto'
    });
  }
};

// Verifica ruolo utente
export const roleMiddleware = (...allowedRoles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Non autenticato'
      });
    }

    if (!allowedRoles.includes(req.user.ruolo)) {
      return res.status(403).json({
        success: false,
        error: 'Permessi insufficienti'
      });
    }

    next();
  };
};
