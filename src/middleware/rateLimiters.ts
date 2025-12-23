import rateLimit from 'express-rate-limit';
import { rateLimitConfig } from '../config/security';
import { auditRateLimitExceeded } from '../services/auditLog';

// ============================================
// RATE LIMITERS - SECURITY ENHANCED
// ============================================

/**
 * Rate limiter per login - protezione contro brute force
 * PRODUZIONE: 5 tentativi ogni 15 minuti
 * SVILUPPO: 50 tentativi ogni 15 minuti
 */
export const loginLimiter = rateLimit({
  ...rateLimitConfig.login,
  keyGenerator: (req) => {
    // Usa IP + email per tracciamento più preciso
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const email = req.body?.email?.toLowerCase() || 'unknown';
    return `login-${ip}-${email.substring(0, 50)}`;
  },
  handler: (req, res) => {
    auditRateLimitExceeded('/auth/login', req);
    res.status(429).json({
      success: false,
      error: rateLimitConfig.login.message.error,
      retryAfter: Math.ceil(rateLimitConfig.login.windowMs / 1000)
    });
  }
});

/**
 * Rate limiter per registrazione
 * PRODUZIONE: 3 registrazioni ogni ora
 * SVILUPPO: 20 registrazioni ogni ora
 */
export const registerLimiter = rateLimit({
  ...rateLimitConfig.register,
  keyGenerator: (req) => {
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
  handler: (req, res) => {
    auditRateLimitExceeded('/auth/register', req);
    res.status(429).json({
      success: false,
      error: rateLimitConfig.register.message.error,
      retryAfter: Math.ceil(rateLimitConfig.register.windowMs / 1000)
    });
  }
});

/**
 * Rate limiter per password reset
 * PRODUZIONE: 3 tentativi ogni ora
 * SVILUPPO: 20 tentativi ogni ora
 */
export const passwordResetLimiter = rateLimit({
  ...rateLimitConfig.passwordReset,
  keyGenerator: (req) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const email = req.body?.email?.toLowerCase() || 'unknown';
    return `reset-${ip}-${email.substring(0, 50)}`;
  },
  handler: (req, res) => {
    auditRateLimitExceeded('/auth/reset-password', req);
    res.status(429).json({
      success: false,
      error: rateLimitConfig.passwordReset.message.error,
      retryAfter: Math.ceil(rateLimitConfig.passwordReset.windowMs / 1000)
    });
  }
});

/**
 * Rate limiter per controllo dispositivi
 * PRODUZIONE: 30 comandi al minuto
 * SVILUPPO: 200 comandi al minuto
 */
export const deviceControlLimiter = rateLimit({
  ...rateLimitConfig.deviceControl,
  keyGenerator: (req) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const userId = (req as any).user?.userId || 'unknown';
    return `device-${ip}-${userId}`;
  },
  handler: (req, res) => {
    auditRateLimitExceeded('/dispositivi/control', req);
    res.status(429).json({
      success: false,
      error: rateLimitConfig.deviceControl.message.error,
      retryAfter: Math.ceil(rateLimitConfig.deviceControl.windowMs / 1000)
    });
  }
});

/**
 * Rate limiter per API generiche autenticate
 * Più permissivo del global limiter
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: process.env.NODE_ENV === 'production' ? 60 : 300,
  message: {
    success: false,
    error: 'Troppe richieste. Attendi qualche secondo.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const userId = (req as any).user?.userId || 'unknown';
    return `api-${ip}-${userId}`;
  }
});
