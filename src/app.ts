import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import routes from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

// ============================================
// EXPRESS APP CONFIGURATION
// ============================================

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: '*', // In produzione specificare domini consentiti
  credentials: true
}));

// Rate limiting - SVILUPPO: Estremamente permissivo
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minuti
  max: 100000 // Praticamente illimitato per sviluppo
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api', routes);

// Error handlers
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
