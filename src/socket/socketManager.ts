import { Server, Socket } from 'socket.io';

// ============================================
// SOCKET MANAGER - Centralized WebSocket Management
// ============================================

class SocketManager {
  private io: Server | null = null;
  private userSockets: Map<number, Set<string>> = new Map(); // userId -> socketIds

  init(io: Server) {
    this.io = io;
    console.log('[SocketManager] Initialized');
  }

  getIO(): Server | null {
    return this.io;
  }

  // ============================================
  // ROOM MANAGEMENT
  // ============================================

  joinImpianto(socket: Socket, impiantoId: number) {
    const room = `impianto_${impiantoId}`;
    socket.join(room);
    const roomSize = this.getRoomSize(room);
    console.log(`[WS] 📍 ${socket.data.email} joined ${room} (${roomSize} clients)`);
  }

  leaveImpianto(socket: Socket, impiantoId: number) {
    const room = `impianto_${impiantoId}`;
    socket.leave(room);
    const roomSize = this.getRoomSize(room);
    console.log(`[WS] 👋 ${socket.data.email} left ${room} (${roomSize} clients)`);
  }

  joinUser(socket: Socket, userId: number) {
    const room = `user_${userId}`;
    socket.join(room);

    // Track socket per user
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(socket.id);
    console.log(`[WS] 👤 User ${userId} joined personal room`);
  }

  // ============================================
  // EMIT METHODS
  // ============================================

  /**
   * Emit event to all clients in an impianto room
   */
  emitToImpianto(impiantoId: number, event: string, payload: any) {
    if (!this.io) {
      console.warn('[SocketManager] IO not initialized');
      return;
    }

    const room = `impianto_${impiantoId}`;
    const clients = this.getRoomSize(room);
    const wsEvent = {
      type: event,
      payload,
      impiantoId,
      timestamp: new Date().toISOString()
    };

    this.io.to(room).emit('ws-event', wsEvent);
    console.log(`[WS] 📡 ${event} -> ${room} (${clients} clients)`);
  }

  /**
   * Emit event to a specific user (all their connected devices)
   */
  emitToUser(userId: number, event: string, payload: any) {
    if (!this.io) {
      console.warn('[SocketManager] IO not initialized');
      return;
    }

    const room = `user_${userId}`;
    const wsEvent = {
      type: event,
      payload,
      timestamp: new Date().toISOString()
    };

    this.io.to(room).emit('ws-event', wsEvent);
    console.log(`[WS] 📡 ${event} -> user_${userId}`);
  }

  /**
   * Broadcast to all connected clients
   */
  broadcast(event: string, payload: any) {
    if (!this.io) {
      console.warn('[SocketManager] IO not initialized');
      return;
    }

    const wsEvent = {
      type: event,
      payload,
      timestamp: new Date().toISOString()
    };

    this.io.emit('ws-event', wsEvent);
    console.log(`[WS] 📡 ${event} -> broadcast`);
  }

  /**
   * Force a user to leave an impianto room (e.g., when removed from sharing)
   */
  forceLeaveImpianto(userId: number, impiantoId: number) {
    if (!this.io) return;

    const impiantoRoom = `impianto_${impiantoId}`;

    // Find all sockets belonging to this user and make them leave the impianto room
    const socketIds = this.userSockets.get(userId);
    if (socketIds) {
      socketIds.forEach(socketId => {
        const socket = this.io?.sockets.sockets.get(socketId);
        if (socket) {
          socket.leave(impiantoRoom);
          console.log(`[WS] 🚪 Forced ${socket.data.email} to leave ${impiantoRoom}`);
        }
      });
    }

    // Notify the user they were kicked
    this.emitToUser(userId, 'KICKED_FROM_IMPIANTO', { impiantoId });
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  getRoomSize(room: string): number {
    if (!this.io) return 0;
    return this.io.sockets.adapter.rooms.get(room)?.size || 0;
  }

  getRoomMembers(room: string): string[] {
    if (!this.io) return [];

    const members: string[] = [];
    const roomSockets = this.io.sockets.adapter.rooms.get(room);

    if (roomSockets) {
      roomSockets.forEach(socketId => {
        const socket = this.io!.sockets.sockets.get(socketId);
        if (socket?.data?.email) {
          members.push(socket.data.email);
        }
      });
    }

    return members;
  }

  getUserSocketCount(userId: number): number {
    return this.userSockets.get(userId)?.size || 0;
  }

  // ============================================
  // HEARTBEAT
  // ============================================

  setupHeartbeat(socket: Socket) {
    socket.on('ping', () => {
      socket.emit('pong');
    });
  }

  // ============================================
  // CLEANUP
  // ============================================

  handleDisconnect(socket: Socket) {
    const userId = socket.data.userId;

    if (userId && this.userSockets.has(userId)) {
      this.userSockets.get(userId)!.delete(socket.id);

      if (this.userSockets.get(userId)!.size === 0) {
        this.userSockets.delete(userId);
      }
    }

    console.log(`[WS] ❌ ${socket.data.email || 'Unknown'} disconnected`);
  }

  // ============================================
  // LEGACY COMPATIBILITY
  // These methods maintain backward compatibility during migration
  // ============================================

  /**
   * @deprecated Use emitToImpianto with WS_EVENTS instead
   */
  emitScenaUpdate(impiantoId: number, scena: any, action: string) {
    this.emitToImpianto(impiantoId, `SCENA_${action.toUpperCase()}`, scena);
  }

  /**
   * @deprecated Use emitToImpianto with WS_EVENTS instead
   */
  emitStanzaUpdate(impiantoId: number, stanza: any, action: string) {
    this.emitToImpianto(impiantoId, `STANZA_${action.toUpperCase()}`, stanza);
  }

  /**
   * @deprecated Use emitToImpianto with WS_EVENTS instead
   */
  emitDispositivoUpdate(impiantoId: number, dispositivo: any, action: string) {
    this.emitToImpianto(impiantoId, `DISPOSITIVO_${action.toUpperCase()}`, dispositivo);
  }

  /**
   * @deprecated Use emitToImpianto with WS_EVENTS instead
   */
  emitCondivisioneUpdate(impiantoId: number, condivisione: any, action: string) {
    this.emitToImpianto(impiantoId, `CONDIVISIONE_${action.toUpperCase()}`, condivisione);
  }

  /**
   * @deprecated Use emitToImpianto with WS_EVENTS instead
   */
  emitGatewayUpdate(impiantoId: number, gateway: any, action: string) {
    this.emitToImpianto(impiantoId, `GATEWAY_${action.toUpperCase()}`, gateway);
  }
}

// Singleton instance
export const socketManager = new SocketManager();
