import { Server as SocketServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import { jwtConfig } from '../config/jwt';
import { JWTPayload } from '../types';

// ============================================
// WEBSOCKET SERVER
// ============================================

export const initializeSocket = (httpServer: HTTPServer) => {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: '*', // In produzione specificare domini consentiti
      methods: ['GET', 'POST']
    }
  });

  // Middleware autenticazione
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error('Token non fornito'));
    }

    try {
      const decoded = jwt.verify(token, jwtConfig.secret) as JWTPayload;
      socket.data.user = decoded;
      next();
    } catch (error) {
      next(new Error('Token non valido'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user as JWTPayload;
    console.log(`✅ Client connesso: ${user.email}`);

    // Join room per impianto
    socket.on('join-impianto', (impiantoId: number) => {
      socket.join(`impianto-${impiantoId}`);
      console.log(`📍 ${user.email} joined impianto-${impiantoId}`);
    });

    // Leave room
    socket.on('leave-impianto', (impiantoId: number) => {
      socket.leave(`impianto-${impiantoId}`);
    });

    socket.on('disconnect', () => {
      console.log(`❌ Client disconnesso: ${user.email}`);
    });
  });

  return io;
};

// Funzione helper per inviare aggiornamenti dispositivo
export const emitDispositivoUpdate = (io: SocketServer, impiantoId: number, dispositivo: any) => {
  io.to(`impianto-${impiantoId}`).emit('dispositivo-update', dispositivo);
};
