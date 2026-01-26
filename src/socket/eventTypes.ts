// ============================================
// WEBSOCKET EVENT TYPES
// Centralized event type definitions
// ============================================

export const WS_EVENTS = {
  // ============================================
  // SCENE EVENTS
  // ============================================
  SCENA_CREATED: 'SCENA_CREATED',
  SCENA_UPDATED: 'SCENA_UPDATED',
  SCENA_DELETED: 'SCENA_DELETED',
  SCENA_EXECUTED: 'SCENA_EXECUTED',

  // ============================================
  // STANZE EVENTS
  // ============================================
  STANZA_CREATED: 'STANZA_CREATED',
  STANZA_UPDATED: 'STANZA_UPDATED',
  STANZA_DELETED: 'STANZA_DELETED',

  // ============================================
  // DISPOSITIVI EVENTS
  // ============================================
  DISPOSITIVO_CREATED: 'DISPOSITIVO_CREATED',
  DISPOSITIVO_UPDATED: 'DISPOSITIVO_UPDATED',
  DISPOSITIVO_DELETED: 'DISPOSITIVO_DELETED',
  DISPOSITIVO_STATE_CHANGED: 'DISPOSITIVO_STATE_CHANGED',

  // ============================================
  // CONDIVISIONI EVENTS
  // ============================================
  CONDIVISIONE_CREATED: 'CONDIVISIONE_CREATED',
  CONDIVISIONE_ACCEPTED: 'CONDIVISIONE_ACCEPTED',
  CONDIVISIONE_REJECTED: 'CONDIVISIONE_REJECTED',
  CONDIVISIONE_REMOVED: 'CONDIVISIONE_REMOVED',
  CONDIVISIONE_UPDATED: 'CONDIVISIONE_UPDATED',

  // ============================================
  // USER-SPECIFIC EVENTS
  // ============================================
  INVITE_RECEIVED: 'INVITE_RECEIVED',
  INVITE_ACCEPTED: 'INVITE_ACCEPTED',
  INVITE_REJECTED: 'INVITE_REJECTED',
  KICKED_FROM_IMPIANTO: 'KICKED_FROM_IMPIANTO',
  PERMESSI_AGGIORNATI: 'PERMESSI_AGGIORNATI',

  // ============================================
  // GATEWAY/NODES EVENTS
  // ============================================
  GATEWAY_ASSOCIATED: 'GATEWAY_ASSOCIATED',
  GATEWAY_DISASSOCIATED: 'GATEWAY_DISASSOCIATED',
  GATEWAY_UPDATED: 'GATEWAY_UPDATED',
  GATEWAY_ONLINE: 'GATEWAY_ONLINE',
  GATEWAY_OFFLINE: 'GATEWAY_OFFLINE',

  NODE_UPDATED: 'NODE_UPDATED',
  NODE_ONLINE: 'NODE_ONLINE',
  NODE_OFFLINE: 'NODE_OFFLINE',
  NODE_STATE_CHANGED: 'NODE_STATE_CHANGED',

  LED_UPDATED: 'LED_UPDATED',
  LED_STATE_CHANGED: 'LED_STATE_CHANGED',

  // ============================================
  // NOTIFICATIONS
  // ============================================
  NOTIFICATION: 'NOTIFICATION',

  // ============================================
  // SYNC EVENTS
  // ============================================
  FULL_SYNC: 'FULL_SYNC',
} as const;

// Type for event names
export type WSEventType = typeof WS_EVENTS[keyof typeof WS_EVENTS];

// Interface for WebSocket event payload
export interface WSEvent<T = any> {
  type: WSEventType;
  payload: T;
  impiantoId?: number;
  timestamp: string;
}
