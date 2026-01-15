import { Server as SocketServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import { jwtConfig } from '../config/jwt';
import { JWTPayload } from '../types';
import { OmniapiNode } from '../services/omniapiState';

// ============================================
// WEBSOCKET SERVER
// ============================================

// Global io instance for use in other modules
let ioInstance: SocketServer | null = null;

export const getIO = (): SocketServer | null => ioInstance;

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

  // Store io instance for use in other modules
  ioInstance = io;

  return io;
};

// ============================================
// STANZE, SCENE, DISPOSITIVI WEBSOCKET EVENTS
// ============================================

// Emit quando una stanza viene creata/modificata/eliminata
export const emitStanzaUpdate = (impiantoId: number, stanza: any, action: 'created' | 'updated' | 'deleted') => {
  if (ioInstance) {
    ioInstance.to(`impianto-${impiantoId}`).emit('stanza-update', { stanza, action });
    console.log(`🏠 WS: stanza-update [${action}] emitted to impianto-${impiantoId}`);
  }
};

// Emit quando una scena viene creata/modificata/eliminata/eseguita
export const emitScenaUpdate = (impiantoId: number, scena: any, action: 'created' | 'updated' | 'deleted' | 'executed') => {
  if (ioInstance) {
    ioInstance.to(`impianto-${impiantoId}`).emit('scena-update', { scena, action });
    console.log(`🎬 WS: scena-update [${action}] emitted to impianto-${impiantoId}`);
  }
};

// Emit quando un dispositivo Tasmota/generico viene aggiornato
export const emitDispositivoUpdate = (impiantoId: number, dispositivo: any, action: 'created' | 'updated' | 'deleted' | 'state-changed') => {
  if (ioInstance) {
    ioInstance.to(`impianto-${impiantoId}`).emit('dispositivo-update', { dispositivo, action });
    console.log(`💡 WS: dispositivo-update [${action}] emitted to impianto-${impiantoId}`);
  }
};

// Emit per refresh completo di tutti i dati (utile dopo riconnessione)
export const emitFullSync = (impiantoId: number, data: { stanze?: any[], scene?: any[], dispositivi?: any[] }) => {
  if (ioInstance) {
    ioInstance.to(`impianto-${impiantoId}`).emit('full-sync', data);
    console.log(`🔄 WS: full-sync emitted to impianto-${impiantoId}`);
  }
};

// ============================================
// OMNIAPI WEBSOCKET EVENTS
// ============================================

export const emitOmniapiGatewayUpdate = (gateway: any) => {
  if (ioInstance) {
    ioInstance.emit('omniapi-gateway-update', gateway);
    console.log('📡 WS: omniapi-gateway-update emitted');
  }
};

export const emitOmniapiNodeUpdate = (node: OmniapiNode) => {
  if (ioInstance) {
    ioInstance.emit('omniapi-node-update', node);
    console.log(`📡 WS: omniapi-node-update emitted for ${node.mac}`);
  }
};

export const emitOmniapiNodesUpdate = (nodes: OmniapiNode[]) => {
  if (ioInstance) {
    ioInstance.emit('omniapi-nodes-update', nodes);
    console.log(`📡 WS: omniapi-nodes-update emitted (${nodes.length} nodes)`);
  }
};

// ============================================
// NOTIFICATION WEBSOCKET EVENTS
// ============================================

export interface NotificationEvent {
  id: number;
  impiantoId: number;
  type: string;
  title: string;
  body: string;
  data?: any;
  created_at: string;
}

export const emitNotification = (impiantoId: number, notification: NotificationEvent, excludeUserId?: number) => {
  if (ioInstance) {
    const room = `impianto-${impiantoId}`;

    if (excludeUserId) {
      // Emit a tutti nella room TRANNE l'utente che ha fatto l'azione
      const socketsInRoom = ioInstance.sockets.adapter.rooms.get(room);
      if (socketsInRoom) {
        socketsInRoom.forEach(socketId => {
          const socket = ioInstance!.sockets.sockets.get(socketId);
          if (socket && socket.data.user?.userId !== excludeUserId) {
            socket.emit('notification', notification);
          }
        });
        console.log(`🔔 WS: notification emitted to impianto-${impiantoId} (excluded user ${excludeUserId}): ${notification.title}`);
      }
    } else {
      // Emit a tutti nella room
      ioInstance.to(room).emit('notification', notification);
      console.log(`🔔 WS: notification emitted to impianto-${impiantoId}: ${notification.title}`);
    }
  }
};
