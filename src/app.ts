import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
// RATE LIMITING DISABILITATO - causava blocchi ingiustificati
// import rateLimit from 'express-rate-limit';
import routes from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { corsConfig, securityHeaders } from './config/security';
// import { auditRateLimitExceeded } from './services/auditLog';

// ============================================
// EXPRESS APP CONFIGURATION - SECURITY ENHANCED
// ============================================

const app = express();

// Trust proxy (for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// Security middleware - Enhanced Helmet configuration
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? securityHeaders.contentSecurityPolicy : false,
  hsts: securityHeaders.hsts,
  referrerPolicy: securityHeaders.referrerPolicy,
  crossOriginEmbedderPolicy: false, // Disable for API
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS - Secure whitelist configuration
app.use(cors(corsConfig));

// RATE LIMITING GLOBALE DISABILITATO
// const globalLimiter = rateLimit({
//   ...rateLimitConfig.global,
//   keyGenerator: (req) => {
//     return req.ip || req.socket.remoteAddress || 'unknown';
//   },
//   handler: (req, res) => {
//     auditRateLimitExceeded(req.path, req);
//     res.status(429).json(rateLimitConfig.global.message);
//   }
// });
// app.use('/api/', globalLimiter);

// Body parsing with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// DEBUG: Log all POST requests body
app.use((req, res, next) => {
  if (req.method === 'POST' && req.url.includes('/auth/register')) {
    console.log('[DEBUG] POST /auth/register - req.body:', JSON.stringify(req.body));
  }
  next();
});

// Security headers for all responses
app.use((req, res, next) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  // Request ID for tracking
  res.setHeader('X-Request-Id', `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  next();
});

// Health check (no auth required)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0'
  });
});

// API routes
app.use('/api', routes);

// Error handlers
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
