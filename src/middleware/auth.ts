import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { jwtConfig } from '../config/jwt';
import { JWTPayload, UserRole } from '../types';

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

// Verifica token JWT
export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Token non fornito'
      });
    }

    const decoded = jwt.verify(token, jwtConfig.secret) as JWTPayload;
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
