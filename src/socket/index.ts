import { Server as SocketServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import { jwtConfig } from '../config/jwt';
import { JWTPayload } from '../types';
import { socketManager } from './socketManager';
import { WS_EVENTS } from './eventTypes';
import { OmniapiNode, LedDevice } from '../services/omniapiState';

// ============================================
// WEBSOCKET SERVER - Refactored with SocketManager
// ============================================

// Re-export for backward compatibility
export { socketManager } from './socketManager';
export { WS_EVENTS } from './eventTypes';

// Legacy getIO function - use socketManager.getIO() instead
export const getIO = (): SocketServer | null => socketManager.getIO();

export const initializeSocket = (httpServer: HTTPServer) => {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Initialize the socket manager
  socketManager.init(io);

  // Middleware: Authentication
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error('Token non fornito'));
    }

    try {
      const decoded = jwt.verify(token, jwtConfig.secret) as JWTPayload;
      socket.data.user = decoded;
      socket.data.userId = decoded.userId;
      socket.data.email = decoded.email;
      next();
    } catch (error) {
      next(new Error('Token non valido'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user as JWTPayload;
    console.log(`[WS] ✅ ${user.email} connected (${socket.id})`);

    // Join user's personal room
    socketManager.joinUser(socket, user.userId);

    // Setup heartbeat
    socketManager.setupHeartbeat(socket);

    // Join impianto room
    socket.on('join-impianto', (data: number | { impiantoId: number }) => {
      // Handle both old format (just number) and new format (object)
      const impiantoId = typeof data === 'number' ? data : data.impiantoId;
      socketManager.joinImpianto(socket, impiantoId);
    });

    // Leave impianto room
    socket.on('leave-impianto', (data: number | { impiantoId: number }) => {
      const impiantoId = typeof data === 'number' ? data : data.impiantoId;
      socketManager.leaveImpianto(socket, impiantoId);
    });

    // Disconnect
    socket.on('disconnect', () => {
      socketManager.handleDisconnect(socket);
    });
  });

  return io;
};

// ============================================
// LEGACY EMIT FUNCTIONS
// These maintain backward compatibility during migration
// Use socketManager.emitToImpianto(id, WS_EVENTS.XXX, payload) for new code
// ============================================

// Stanze
export const emitStanzaUpdate = (impiantoId: number, stanza: any, action: 'created' | 'updated' | 'deleted') => {
  const eventMap: Record<string, string> = {
    created: WS_EVENTS.STANZA_CREATED,
    updated: WS_EVENTS.STANZA_UPDATED,
    deleted: WS_EVENTS.STANZA_DELETED,
  };
  socketManager.emitToImpianto(impiantoId, eventMap[action], stanza);

  // Also emit legacy event for old frontend listeners
  const io = socketManager.getIO();
  if (io) {
    io.to(`impianto_${impiantoId}`).emit('stanza-update', { stanza, action });
    // Also emit to old room format for compatibility
    io.to(`impianto-${impiantoId}`).emit('stanza-update', { stanza, action });
  }
};

// Scene
export const emitScenaUpdate = (impiantoId: number, scena: any, action: 'created' | 'updated' | 'deleted' | 'executed') => {
  const eventMap: Record<string, string> = {
    created: WS_EVENTS.SCENA_CREATED,
    updated: WS_EVENTS.SCENA_UPDATED,
    deleted: WS_EVENTS.SCENA_DELETED,
    executed: WS_EVENTS.SCENA_EXECUTED,
  };
  socketManager.emitToImpianto(impiantoId, eventMap[action], scena);

  // Also emit legacy event for old frontend listeners
  const io = socketManager.getIO();
  if (io) {
    io.to(`impianto_${impiantoId}`).emit('scena-update', { scena, action });
    io.to(`impianto-${impiantoId}`).emit('scena-update', { scena, action });
  }
};

// Dispositivi
export const emitDispositivoUpdate = (impiantoId: number, dispositivo: any, action: 'created' | 'updated' | 'deleted' | 'state-changed') => {
  const eventMap: Record<string, string> = {
    created: WS_EVENTS.DISPOSITIVO_CREATED,
    updated: WS_EVENTS.DISPOSITIVO_UPDATED,
    deleted: WS_EVENTS.DISPOSITIVO_DELETED,
    'state-changed': WS_EVENTS.DISPOSITIVO_STATE_CHANGED,
  };
  socketManager.emitToImpianto(impiantoId, eventMap[action], dispositivo);

  // Also emit legacy event for old frontend listeners
  const io = socketManager.getIO();
  if (io) {
    io.to(`impianto_${impiantoId}`).emit('dispositivo-update', { dispositivo, action });
    io.to(`impianto-${impiantoId}`).emit('dispositivo-update', { dispositivo, action });
  }
};

// Full Sync
export const emitFullSync = (impiantoId: number, data: { stanze?: any[], scene?: any[], dispositivi?: any[] }) => {
  socketManager.emitToImpianto(impiantoId, WS_EVENTS.FULL_SYNC, data);

  // Also emit legacy event
  const io = socketManager.getIO();
  if (io) {
    io.to(`impianto_${impiantoId}`).emit('full-sync', data);
    io.to(`impianto-${impiantoId}`).emit('full-sync', data);
  }
};

// Gateway
export const emitGatewayUpdate = (impiantoId: number, gateway: any, action: 'associated' | 'disassociated' | 'updated') => {
  const eventMap: Record<string, string> = {
    associated: WS_EVENTS.GATEWAY_ASSOCIATED,
    disassociated: WS_EVENTS.GATEWAY_DISASSOCIATED,
    updated: WS_EVENTS.GATEWAY_UPDATED,
  };
  socketManager.emitToImpianto(impiantoId, eventMap[action], gateway);

  // Also emit legacy event
  const io = socketManager.getIO();
  if (io) {
    io.to(`impianto_${impiantoId}`).emit('gateway-update', { gateway, action });
    io.to(`impianto-${impiantoId}`).emit('gateway-update', { gateway, action });
  }
};

// Condivisioni
export const emitCondivisioneUpdate = (impiantoId: number, condivisione: any, action: 'created' | 'accepted' | 'removed') => {
  const eventMap: Record<string, string> = {
    created: WS_EVENTS.CONDIVISIONE_CREATED,
    accepted: WS_EVENTS.CONDIVISIONE_ACCEPTED,
    removed: WS_EVENTS.CONDIVISIONE_REMOVED,
  };
  socketManager.emitToImpianto(impiantoId, eventMap[action], condivisione);

  // Also emit legacy event
  const io = socketManager.getIO();
  if (io) {
    io.to(`impianto_${impiantoId}`).emit('condivisione-update', { condivisione, action });
    io.to(`impianto-${impiantoId}`).emit('condivisione-update', { condivisione, action });
  }
};

// ============================================
// OMNIAPI EVENTS (Global broadcasts)
// ============================================

export const emitOmniapiGatewayUpdate = (gateway: any) => {
  socketManager.broadcast(WS_EVENTS.GATEWAY_UPDATED, gateway);

  // Also emit legacy event
  const io = socketManager.getIO();
  if (io) {
    io.emit('omniapi-gateway-update', gateway);
  }
};

export const emitOmniapiNodeUpdate = (node: OmniapiNode) => {
  socketManager.broadcast(WS_EVENTS.NODE_UPDATED, node);

  // Also emit legacy event
  const io = socketManager.getIO();
  if (io) {
    io.emit('omniapi-node-update', node);
  }
};

export const emitOmniapiNodesUpdate = (nodes: OmniapiNode[]) => {
  socketManager.broadcast(WS_EVENTS.NODE_UPDATED, { nodes });

  // Also emit legacy event
  const io = socketManager.getIO();
  if (io) {
    io.emit('omniapi-nodes-update', nodes);
  }
};

export const emitOmniapiLedUpdate = (ledState: LedDevice | any) => {
  socketManager.broadcast(WS_EVENTS.LED_UPDATED, ledState);

  // Also emit legacy event
  const io = socketManager.getIO();
  if (io) {
    io.emit('omniapi-led-update', ledState);
  }
};

// ============================================
// UNIFIED DEVICE UPDATE
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

export const emitDeviceUpdate = (impiantoId: number | null, device: DeviceUpdatePayload) => {
  const payload = {
    ...device,
    timestamp: device.timestamp || Date.now()
  };

  if (impiantoId) {
    socketManager.emitToImpianto(impiantoId, WS_EVENTS.DISPOSITIVO_STATE_CHANGED, payload);
  } else {
    socketManager.broadcast(WS_EVENTS.DISPOSITIVO_STATE_CHANGED, payload);
  }

  // Also emit legacy events for backward compatibility
  const io = socketManager.getIO();
  if (!io) return;

  if (impiantoId) {
    io.to(`impianto_${impiantoId}`).emit('device-update', payload);
    io.to(`impianto-${impiantoId}`).emit('device-update', payload);
  } else {
    io.emit('device-update', payload);
  }

  // Legacy node/led events
  if (device.category === 'relay') {
    io.emit('omniapi-node-update', {
      mac: device.mac,
      online: device.stato === 'online',
      relay1: device.state?.channels?.[0] ?? false,
      relay2: device.state?.channels?.[1] ?? false,
      rssi: device.state?.rssi,
      version: device.state?.firmwareVersion,
      lastSeen: new Date()
    });
  } else if (device.category === 'led') {
    io.emit('omniapi-led-update', {
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

export const emitDeviceUpdateByMac = async (mac: string, state: any, category: 'relay' | 'led') => {
  const payload: DeviceUpdatePayload = {
    mac,
    deviceType: category === 'relay' ? 'omniapi_node' : 'omniapi_led',
    category,
    stato: state.online !== false ? 'online' : 'offline',
    state,
    timestamp: Date.now()
  };

  emitDeviceUpdate(null, payload);
};

// ============================================
// NOTIFICATION EVENTS
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
  const io = socketManager.getIO();
  if (!io) return;

  const rooms = [`impianto_${impiantoId}`, `impianto-${impiantoId}`];

  if (excludeUserId) {
    // Emit to all in room except the excluded user
    rooms.forEach(room => {
      const socketsInRoom = io.sockets.adapter.rooms.get(room);
      if (socketsInRoom) {
        socketsInRoom.forEach(socketId => {
          const socket = io.sockets.sockets.get(socketId);
          if (socket && socket.data.userId !== excludeUserId) {
            socket.emit('notification', notification);
            socket.emit('ws-event', {
              type: WS_EVENTS.NOTIFICATION,
              payload: notification,
              impiantoId,
              timestamp: new Date().toISOString()
            });
          }
        });
      }
    });
    console.log(`[WS] 🔔 notification -> impianto_${impiantoId} (excluded user ${excludeUserId})`);
  } else {
    rooms.forEach(room => {
      io.to(room).emit('notification', notification);
    });
    socketManager.emitToImpianto(impiantoId, WS_EVENTS.NOTIFICATION, notification);
    console.log(`[WS] 🔔 notification -> impianto_${impiantoId}`);
  }
};

export const emitNotificationToUser = (userId: number, notification: any) => {
  socketManager.emitToUser(userId, WS_EVENTS.NOTIFICATION, notification);

  // Also emit legacy event
  const io = socketManager.getIO();
  if (io) {
    io.to(`user_${userId}`).emit('notification', notification);

    // Also find sockets by userId for backward compat
    io.sockets.sockets.forEach(socket => {
      if (socket.data.userId === userId) {
        socket.emit('notification', notification);
      }
    });
  }
};
