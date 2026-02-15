import http from 'http';
import dotenv from 'dotenv';
import app from './app';
import { testConnection } from './config/database';
import { connectMQTT } from './config/mqtt';
import { initializeSocket } from './socket';
import { loadAllSchedules } from './services/sceneScheduler';
import { checkConditionalScenes } from './services/conditionsEngine';
// nodeHealthCheck REMOVED — was marking nodes offline after 5s, but gateway
// heartbeat is every 30s causing constant flicker. Reconciliation in mqtt.ts
// already handles nodes missing from gateway status correctly.
import { runOmniapiMigration } from './utils/migrate-omniapi';
import { initSessionsTable, cleanupExpiredSessions } from './controllers/sessionsController';
import logger from './config/logger';
import { verifyEmailConfig } from './services/emailService';

dotenv.config();

// ============================================
// SERVER STARTUP
// ============================================

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    // Test connessione database
    await testConnection();

    // Esegui migrazioni OmniaPi (idempotenti)
    await runOmniapiMigration();

    // Inizializza tabella sessioni
    await initSessionsTable();

    // Pulizia sessioni scadute ogni ora
    setInterval(() => {
      cleanupExpiredSessions();
    }, 60 * 60 * 1000);

    // Connetti MQTT
    connectMQTT();

    // Carica scene schedulate
    logger.info('Caricamento scene schedulate...');
    await loadAllSchedules();

    // Avvia controllo condizioni ogni minuto
    logger.info('Avvio controllo scene condizionali...');
    setInterval(() => {
      checkConditionalScenes();
    }, 60000); // Ogni 60 secondi

    // Verifica configurazione SMTP (non blocca l'avvio)
    verifyEmailConfig();

    // Crea HTTP server
    const httpServer = http.createServer(app);

    // Inizializza WebSocket
    initializeSocket(httpServer);

    // Start server
    httpServer.listen(PORT, () => {
      console.log(`
╔═══════════════════════════════════════════╗
║   🏠 OmniaPi Home Domotic Backend        ║
║   Server running on port ${PORT}            ║
║   Environment: ${process.env.NODE_ENV || 'development'}              ║
╚═══════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('❌ Errore avvio server:', error);
    process.exit(1);
  }
};

startServer();
