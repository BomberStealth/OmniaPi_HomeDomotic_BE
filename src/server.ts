import http from 'http';
import dotenv from 'dotenv';
import app from './app';
import { testConnection } from './config/database';
import { connectMQTT } from './config/mqtt';
import { initializeSocket } from './socket';

dotenv.config();

// ============================================
// SERVER STARTUP
// ============================================

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    // Test connessione database
    await testConnection();

    // Connetti MQTT
    connectMQTT();

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
