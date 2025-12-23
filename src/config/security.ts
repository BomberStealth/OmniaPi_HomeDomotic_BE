import dotenv from 'dotenv';

dotenv.config();

// ============================================
// CONFIGURAZIONE SICUREZZA CENTRALIZZATA
// ============================================

// Verifica variabili critiche all'avvio
const validateEnvVariables = () => {
  const errors: string[] = [];

  // JWT_SECRET è obbligatorio in produzione
  if (!process.env.JWT_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      errors.push('JWT_SECRET is required in production');
    } else {
      console.warn('⚠️  WARNING: JWT_SECRET not set. Using default (NOT SAFE FOR PRODUCTION)');
    }
  }

  // DB credentials
  if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_PASSWORD) {
    errors.push('Database credentials (DB_HOST, DB_USER, DB_PASSWORD) are required');
  }

  if (errors.length > 0 && process.env.NODE_ENV === 'production') {
    console.error('❌ SECURITY: Missing critical environment variables:');
    errors.forEach(e => console.error(`   - ${e}`));
    process.exit(1);
  }
};

// Esegui validazione
validateEnvVariables();

// ============================================
// CORS CONFIGURATION
// ============================================
const getAllowedOrigins = (): string[] => {
  const defaultOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    'http://127.0.0.1:5173',
  ];

  // Aggiungi origini da env se presenti
  const envOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || [];

  // In produzione, aggiungi il dominio principale
  if (process.env.FRONTEND_URL) {
    envOrigins.push(process.env.FRONTEND_URL);
  }

  return [...new Set([...defaultOrigins, ...envOrigins])];
};

export const corsConfig = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    const allowedOrigins = getAllowedOrigins();

    // Permetti richieste senza origin (es. mobile apps, Postman, curl)
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`🚫 CORS blocked origin: ${origin}`);
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token'],
  exposedHeaders: ['X-Total-Count', 'X-Request-Id'],
  maxAge: 86400, // 24 ore di cache per preflight
};

// ============================================
// RATE LIMITING CONFIGURATION
// ============================================
export const rateLimitConfig = {
  // Global API limiter
  global: {
    windowMs: 15 * 60 * 1000, // 15 minuti
    max: process.env.NODE_ENV === 'production' ? 100 : 1000, // 100 richieste in produzione
    message: {
      success: false,
      error: 'Troppe richieste. Riprova tra qualche minuto.'
    },
    standardHeaders: true,
    legacyHeaders: false,
  },

  // Login limiter - protezione brute force
  login: {
    windowMs: 15 * 60 * 1000, // 15 minuti
    max: process.env.NODE_ENV === 'production' ? 5 : 50, // 5 tentativi in produzione
    message: {
      success: false,
      error: 'Troppi tentativi di login. Account temporaneamente bloccato per 15 minuti.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
  },

  // Registrazione limiter
  register: {
    windowMs: 60 * 60 * 1000, // 1 ora
    max: process.env.NODE_ENV === 'production' ? 3 : 20, // 3 registrazioni/ora in produzione
    message: {
      success: false,
      error: 'Troppe registrazioni. Riprova tra un\'ora.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
  },

  // Password reset limiter
  passwordReset: {
    windowMs: 60 * 60 * 1000, // 1 ora
    max: process.env.NODE_ENV === 'production' ? 3 : 20,
    message: {
      success: false,
      error: 'Troppi tentativi di reset password. Riprova tra un\'ora.'
    },
    standardHeaders: true,
    legacyHeaders: false,
  },

  // Device control limiter
  deviceControl: {
    windowMs: 60 * 1000, // 1 minuto
    max: process.env.NODE_ENV === 'production' ? 30 : 200, // 30 comandi/minuto in produzione
    message: {
      success: false,
      error: 'Troppi comandi inviati. Attendi qualche secondo.'
    },
    standardHeaders: true,
    legacyHeaders: false,
  }
};

// ============================================
// ACCOUNT LOCKOUT CONFIGURATION
// ============================================
export const accountLockoutConfig = {
  maxFailedAttempts: 5,           // Blocco dopo 5 tentativi falliti
  lockoutDurationMinutes: 15,     // Durata blocco in minuti
  resetAttemptsAfterMinutes: 30,  // Reset contatore dopo 30 minuti di successo
};

// ============================================
// PASSWORD POLICY
// ============================================
export const passwordPolicy = {
  minLength: 8,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: false, // Opzionale per ora
  commonPasswordsList: [
    'password', '12345678', 'qwerty123', 'admin123', 'letmein',
    'welcome1', 'Password1', 'password1', '123456789', 'abc12345'
  ]
};

// ============================================
// JWT CONFIGURATION (Secure)
// ============================================
export const jwtSecureConfig = {
  secret: process.env.JWT_SECRET || 'omniapi-dev-secret-NOT-FOR-PRODUCTION',
  accessTokenExpiry: '15m',    // Token di accesso valido 15 minuti
  refreshTokenExpiry: '7d',    // Refresh token valido 7 giorni
  issuer: 'omniapi-homedomotic',
  audience: 'omniapi-clients',
};

// ============================================
// SESSION/TOKEN CONFIGURATION
// ============================================
export const sessionConfig = {
  cookieName: 'omniapi_session',
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 giorni
  }
};

// ============================================
// SECURITY HEADERS (Helmet extensions)
// ============================================
export const securityHeaders = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'wss:', 'ws:'],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000, // 1 anno
    includeSubDomains: true,
    preload: true,
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' as const },
};

// ============================================
// INPUT SANITIZATION CONFIG
// ============================================
export const sanitizationConfig = {
  // Caratteri da rimuovere in stringhe generiche
  dangerousChars: /[<>'"`;\\]/g,

  // Pattern XSS comuni
  xssPatterns: [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /data:/gi,
  ],

  // Lunghezza massima campi
  maxFieldLengths: {
    email: 254,
    password: 128,
    nome: 50,
    cognome: 50,
    indirizzo: 200,
    generic: 1000,
  }
};

export default {
  corsConfig,
  rateLimitConfig,
  accountLockoutConfig,
  passwordPolicy,
  jwtSecureConfig,
  sessionConfig,
  securityHeaders,
  sanitizationConfig,
};
