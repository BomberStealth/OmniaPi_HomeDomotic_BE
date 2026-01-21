import { Server as SocketServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import { jwtConfig } from '../config/jwt';
import { JWTPayload } from '../types';
import { OmniapiNode, LedDevice } from '../services/omniapiState';

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

export const emitOmniapiLedUpdate = (ledState: LedDevice | any) => {
  if (ioInstance) {
    ioInstance.emit('omniapi-led-update', ledState);
    console.log(`📡 WS: omniapi-led-update emitted for ${ledState.mac}`);
  }
};

// ============================================
// UNIFIED DEVICE UPDATE (NEW - Phase 2)
// Emits both legacy events AND new unified event
// ============================================

export interface DeviceUpdatePayload {
  id?: number;
  mac: string;
  deviceType: string;
  category: 'relay' | 'led' | 'sensor' | 'dimmer' | 'tasmota' | 'unknown';
  name?: string;
  stato: 'online' | 'offline' | 'unknown';
  state: any;
  timestamp: number;
}

/**
 * Unified device update - emits to impianto room
 * Also emits legacy events for backward compatibility
 */
export const emitDeviceUpdate = (impiantoId: number | null, device: DeviceUpdatePayload) => {
  if (!ioInstance) return;

  // Add timestamp for deduplication
  const payload = {
    ...device,
    timestamp: device.timestamp || Date.now()
  };

  // Emit unified event to impianto room (or broadcast if no impianto)
  if (impiantoId) {
    ioInstance.to(`impianto-${impiantoId}`).emit('device-update', payload);
    console.log(`📡 WS: device-update emitted to impianto-${impiantoId} for ${device.mac}`);
  } else {
    ioInstance.emit('device-update', payload);
    console.log(`📡 WS: device-update broadcast for ${device.mac}`);
  }

  // Also emit legacy events for backward compatibility
  if (device.category === 'relay') {
    ioInstance.emit('omniapi-node-update', {
      mac: device.mac,
      online: device.stato === 'online',
      relay1: device.state?.channels?.[0] ?? false,
      relay2: device.state?.channels?.[1] ?? false,
      rssi: device.state?.rssi,
      version: device.state?.firmwareVersion,
      lastSeen: new Date()
    });
  } else if (device.category === 'led') {
    ioInstance.emit('omniapi-led-update', {
      mac: device.mac,
      online: device.stato === 'online',
      power: device.state?.power ?? false,
      r: device.state?.r ?? 0,
      g: device.state?.g ?? 255,
      b: device.state?.b ?? 0,
      brightness: device.state?.brightness ?? 128,
      effect: device.state?.effect ?? 0,
      lastSeen: new Date()
    });
  }
};

/**
 * Emit device update by MAC - looks up impiantoId from device
 */
export const emitDeviceUpdateByMac = async (mac: string, state: any, category: 'relay' | 'led') => {
  if (!ioInstance) return;

  // For now, broadcast (Phase 6 will add proper room scoping)
  const payload: DeviceUpdatePayload = {
    mac,
    deviceType: category === 'relay' ? 'omniapi_node' : 'omniapi_led',
    category,
    stato: state.online !== false ? 'online' : 'offline',
    state,
    timestamp: Date.now()
  };

  // Broadcast for now (legacy behavior)
  emitDeviceUpdate(null, payload);
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

// Emit notification to a specific user (by userId)
export const emitNotificationToUser = (userId: number, notification: any) => {
  if (ioInstance) {
    // Find all sockets belonging to this user
    ioInstance.sockets.sockets.forEach(socket => {
      if (socket.data.user?.userId === userId) {
        socket.emit('notification', notification);
        console.log(`🔔 WS: notification emitted to user ${userId}: ${notification.titolo || notification.title}`);
      }
    });
  }
};
