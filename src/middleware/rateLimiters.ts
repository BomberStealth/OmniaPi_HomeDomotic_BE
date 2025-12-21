import rateLimit from 'express-rate-limit';

// ============================================
// RATE LIMITERS SPECIFICI
// ============================================

/**
 * Rate limiter per login - protezione contro brute force
 * SVILUPPO: Estremamente permissivo per facilitare testing
 * 10000 tentativi ogni 15 minuti
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minuti
  max: 10000, // Praticamente illimitato per sviluppo
  message: {
    success: false,
    error: 'Troppi tentativi di login. Attendi qualche minuto.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Usa IP + User-Agent per evitare falsi positivi su IP condivisi
  keyGenerator: (req) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const ua = req.get('user-agent') || 'unknown';
    return `${ip}-${ua.substring(0, 50)}`;
  },
  // Skip se l'autenticazione ha successo
  skipSuccessfulRequests: true
});

/**
 * Rate limiter per registrazione
 * SVILUPPO: Estremamente permissivo per testing
 */
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 ora
  max: 10000, // Praticamente illimitato per sviluppo
  message: {
    success: false,
    error: 'Troppi tentativi di registrazione. Riprova tra qualche minuto.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
  skipSuccessfulRequests: true
});

/**
 * Rate limiter per password reset
 * SVILUPPO: Estremamente permissivo per testing
 */
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 ora
  max: 10000, // Praticamente illimitato per sviluppo
  message: {
    success: false,
    error: 'Troppi tentativi di reset password. Riprova tra un\'ora.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.ip || req.socket.remoteAddress || 'unknown';
  }
});
