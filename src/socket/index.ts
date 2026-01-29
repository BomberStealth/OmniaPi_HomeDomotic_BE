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
// EMIT FUNCTIONS (Unified - using WS_EVENTS only)
// Legacy events removed - frontend uses new WS_EVENTS system
// ============================================

// Stanze
export const emitStanzaUpdate = (impiantoId: number, stanza: any, action: 'created' | 'updated' | 'deleted') => {
  const eventMap: Record<string, string> = {
    created: WS_EVENTS.STANZA_CREATED,
    updated: WS_EVENTS.STANZA_UPDATED,
    deleted: WS_EVENTS.STANZA_DELETED,
  };
  socketManager.emitToImpianto(impiantoId, eventMap[action], stanza);
  // Legacy events removed - now using only new WS_EVENTS system
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
  // Legacy events removed - now using only new WS_EVENTS system
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
  // Legacy events removed - now using only new WS_EVENTS system
};

// Full Sync
export const emitFullSync = (impiantoId: number, data: { stanze?: any[], scene?: any[], dispositivi?: any[] }) => {
  socketManager.emitToImpianto(impiantoId, WS_EVENTS.FULL_SYNC, data);
  // Legacy events removed - now using only new WS_EVENTS system
};

// Gateway
export const emitGatewayUpdate = (impiantoId: number, gateway: any, action: 'associated' | 'disassociated' | 'updated') => {
  const eventMap: Record<string, string> = {
    associated: WS_EVENTS.GATEWAY_ASSOCIATED,
    disassociated: WS_EVENTS.GATEWAY_DISASSOCIATED,
    updated: WS_EVENTS.GATEWAY_UPDATED,
  };
  socketManager.emitToImpianto(impiantoId, eventMap[action], gateway);
  // Legacy events removed - now using only new WS_EVENTS system
};

// Condivisioni
export const emitCondivisioneUpdate = (impiantoId: number, condivisione: any, action: 'created' | 'accepted' | 'removed') => {
  console.log(`[CONDIVISIONE] emitCondivisioneUpdate chiamato: impiantoId=${impiantoId}, action=${action}`);
  console.log(`[CONDIVISIONE] payload:`, JSON.stringify(condivisione, null, 2));

  const eventMap: Record<string, string> = {
    created: WS_EVENTS.CONDIVISIONE_CREATED,
    accepted: WS_EVENTS.CONDIVISIONE_ACCEPTED,
    removed: WS_EVENTS.CONDIVISIONE_REMOVED,
  };
  socketManager.emitToImpianto(impiantoId, eventMap[action], condivisione);
  // Legacy events removed - now using only new WS_EVENTS system
};

// ============================================
// OMNIAPI EVENTS (Global broadcasts)
// ============================================

export const emitOmniapiGatewayUpdate = (gateway: any) => {
  socketManager.broadcast(WS_EVENTS.GATEWAY_UPDATED, gateway);
  // Legacy events removed - now using only new WS_EVENTS system
};

export const emitOmniapiNodeUpdate = (node: OmniapiNode) => {
  socketManager.broadcast(WS_EVENTS.NODE_UPDATED, node);
  // Legacy events removed - now using only new WS_EVENTS system
};

export const emitOmniapiNodesUpdate = (nodes: OmniapiNode[]) => {
  socketManager.broadcast(WS_EVENTS.NODE_UPDATED, { nodes });
  // Legacy events removed - now using only new WS_EVENTS system
};

export const emitOmniapiLedUpdate = (ledState: LedDevice | any) => {
  socketManager.broadcast(WS_EVENTS.LED_UPDATED, ledState);
  // Legacy events removed - now using only new WS_EVENTS system
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
  // Legacy events removed - now using only new WS_EVENTS system
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
  const io = socketManager.getIO();
  if (!io) return;

  // Emit via new ws-event system
  socketManager.emitToUser(userId, WS_EVENTS.NOTIFICATION, notification);

  // ALSO emit via legacy 'notification' channel for backward compatibility
  // ImpiantoSelector still uses this channel
  const room = `user_${userId}`;
  io.to(room).emit('notification', notification);
  console.log(`[WS] 🔔 notification (legacy) -> user_${userId}`);
};
