import http from 'http';
import dotenv from 'dotenv';
import app from './app';
import { testConnection } from './config/database';
import { connectMQTT } from './config/mqtt';
import { initializeSocket } from './socket';
import { loadAllSchedules } from './services/sceneScheduler';
import { checkConditionalScenes } from './services/conditionsEngine';
import { runOmniapiMigration } from './utils/migrate-omniapi';
import logger from './config/logger';

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
