/**
 * OmniaPi State Manager
 * In-memory storage for Gateway and Nodes state
 * With change detection to avoid spamming WebSocket
 */

import {
  OmniapiNodeLegacy,
  LedDeviceLegacy
} from '../types/device';

// ============================================
// TYPES
// Re-export legacy types for backward compatibility
// ============================================

export interface OmniapiGateway {
  online: boolean;
  ip: string;
  version: string;
  nodeCount: number;
  mqttConnected: boolean;
  lastSeen: Date;
}

// Use legacy types from types/device.ts
export type OmniapiNode = OmniapiNodeLegacy;
export type LedDevice = LedDeviceLegacy;

// ============================================
// STATE STORAGE
// ============================================

let gatewayState: OmniapiGateway | null = null;
const nodesState: Map<string, OmniapiNode> = new Map();
const ledDevicesState: Map<string, LedDevice> = new Map();

// ============================================
// CHANGE DETECTION HELPERS
// ============================================

const hasGatewayChanged = (prev: OmniapiGateway | null, next: OmniapiGateway): boolean => {
  if (!prev) return true;
  return prev.online !== next.online ||
         prev.ip !== next.ip ||
         prev.version !== next.version ||
         prev.nodeCount !== next.nodeCount;
};

const hasNodeChanged = (prev: OmniapiNode | undefined, next: OmniapiNode): boolean => {
  if (!prev) return true;
  // RSSI changes constantly, ignore it for change detection
  return prev.online !== next.online ||
         prev.relay1 !== next.relay1 ||
         prev.relay2 !== next.relay2;
};

const hasLedChanged = (prev: LedDevice | undefined, next: LedDevice): boolean => {
  if (!prev) return true;
  return prev.online !== next.online ||
         prev.power !== next.power ||
         prev.r !== next.r ||
         prev.g !== next.g ||
         prev.b !== next.b ||
         prev.brightness !== next.brightness ||
         prev.effect !== next.effect;
};

// ============================================
// GATEWAY FUNCTIONS
// ============================================

export const updateGatewayState = (data: {
  online?: boolean;
  connected?: boolean;
  ip?: string;
  version?: string;
  nodeCount?: number;
  nodes_count?: number;
  mqttConnected?: boolean;
}): { gateway: OmniapiGateway; changed: boolean } => {
  const prev = gatewayState;
  const next: OmniapiGateway = {
    online: data.online ?? data.connected ?? gatewayState?.online ?? false,
    ip: data.ip ?? gatewayState?.ip ?? '',
    version: data.version ?? gatewayState?.version ?? '',
    nodeCount: data.nodes_count ?? data.nodeCount ?? gatewayState?.nodeCount ?? 0,
    mqttConnected: data.online ?? data.connected ?? gatewayState?.mqttConnected ?? false,
    lastSeen: new Date()
  };

  const changed = hasGatewayChanged(prev, next);
  gatewayState = next;

  if (changed) {
    console.log('📡 OmniaPi Gateway state CHANGED:', gatewayState);
  }

  return { gateway: gatewayState, changed };
};

export const getGatewayState = (): OmniapiGateway | null => {
  return gatewayState;
};

// ============================================
// NODES FUNCTIONS
// ============================================

export const updateNodesFromList = (nodes: Array<{
  mac: string;
  online?: boolean;
  rssi?: number;
  version?: string;
  relays?: [number, number];
}>): { nodes: OmniapiNode[]; changed: boolean } => {
  let anyChanged = false;

  nodes.forEach(node => {
    const existing = nodesState.get(node.mac);
    const isOnline = node.online === true || (node.online as any) === 1;
    const next: OmniapiNode = {
      mac: node.mac,
      online: isOnline,
      rssi: node.rssi ?? existing?.rssi ?? 0,
      version: node.version ?? existing?.version ?? '',
      relay1: node.relays ? node.relays[0] === 1 : existing?.relay1 ?? false,
      relay2: node.relays ? node.relays[1] === 1 : existing?.relay2 ?? false,
      lastSeen: new Date()
    };

    if (hasNodeChanged(existing, next)) {
      anyChanged = true;
      console.log(`📡 Node ${node.mac} CHANGED: relay1=${next.relay1}, relay2=${next.relay2}, online=${next.online}`);
    }

    nodesState.set(node.mac, next);
  });

  if (!anyChanged) {
    // No changes, skip logging
  }

  return { nodes: Array.from(nodesState.values()), changed: anyChanged };
};

export const updateNodeState = (mac: string, data: {
  online?: boolean;
  rssi?: number;
  relay1?: boolean;
  relay2?: boolean;
}): { node: OmniapiNode | null; changed: boolean } => {
  const existing = nodesState.get(mac);
  if (!existing && !data.online) {
    // Don't create new node from partial state update
    return { node: null, changed: false };
  }

  const next: OmniapiNode = {
    mac,
    online: data.online ?? existing?.online ?? false,
    rssi: data.rssi ?? existing?.rssi ?? 0,
    version: existing?.version ?? '',
    relay1: data.relay1 ?? existing?.relay1 ?? false,
    relay2: data.relay2 ?? existing?.relay2 ?? false,
    lastSeen: new Date()
  };

  const changed = hasNodeChanged(existing, next);
  nodesState.set(mac, next);

  if (changed) {
    console.log(`📡 OmniaPi Node ${mac} CHANGED:`, next);
  }

  return { node: next, changed };
};

export const getNode = (mac: string): OmniapiNode | undefined => {
  return nodesState.get(mac);
};

export const getAllNodes = (): OmniapiNode[] => {
  return Array.from(nodesState.values());
};

export const getNodesCount = (): number => {
  return nodesState.size;
};

export const removeNode = (mac: string): boolean => {
  const existed = nodesState.delete(mac);
  if (existed) {
    console.log(`📡 OmniaPi Node ${mac} removed from memory`);
  }
  return existed;
};

// ============================================
// UTILITY
// ============================================

export const clearState = () => {
  gatewayState = null;
  nodesState.clear();
  ledDevicesState.clear();
  console.log('📡 OmniaPi state cleared');
};

// ============================================
// LED DEVICES FUNCTIONS
// ============================================

export const updateLedState = (mac: string, state: Partial<LedDevice>): { led: LedDevice; changed: boolean } => {
  const existing = ledDevicesState.get(mac);
  const defaults: LedDevice = {
    mac,
    power: false,
    r: 0,
    g: 255,
    b: 0,
    brightness: 128,
    effect: 0,
    online: true,
    lastSeen: new Date()
  };

  const next: LedDevice = {
    ...(existing || defaults),
    ...state,
    mac,
    lastSeen: new Date()
  };

  const changed = hasLedChanged(existing, next);
  ledDevicesState.set(mac, next);

  if (changed) {
    console.log(`📡 OmniaPi LED ${mac} CHANGED:`, next);
  }

  return { led: next, changed };
};

export const getLedState = (mac: string): LedDevice | undefined => {
  return ledDevicesState.get(mac);
};

export const getAllLedDevices = (): LedDevice[] => {
  return Array.from(ledDevicesState.values());
};

export const removeLedDevice = (mac: string): void => {
  ledDevicesState.delete(mac);
  console.log(`📡 OmniaPi LED ${mac} removed`);
};

// ============================================
// GATEWAY BUSY LOCK
// ============================================

export type GatewayOperation = 'scan' | 'commission' | 'ota_gateway' | 'ota_node' | 'delete';

interface GatewayBusyState {
  busy: boolean;
  operation: GatewayOperation | null;
  started_at: Date | null;
  timeout: number; // ms
}

const BUSY_TIMEOUT = 120_000; // 2 minutes auto-unlock

const gatewayBusy: GatewayBusyState = {
  busy: false,
  operation: null,
  started_at: null,
  timeout: BUSY_TIMEOUT,
};

let busyTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Acquire gateway lock. Returns true if acquired, false if already busy.
 */
export const acquireGatewayLock = (operation: GatewayOperation): boolean => {
  // Auto-unlock if timed out
  if (gatewayBusy.busy && gatewayBusy.started_at) {
    const elapsed = Date.now() - gatewayBusy.started_at.getTime();
    if (elapsed > gatewayBusy.timeout) {
      console.warn(`⚠️ [BUSY-LOCK] Auto-unlock: ${gatewayBusy.operation} timed out after ${elapsed}ms`);
      releaseGatewayLock();
    }
  }

  if (gatewayBusy.busy) {
    return false;
  }

  gatewayBusy.busy = true;
  gatewayBusy.operation = operation;
  gatewayBusy.started_at = new Date();

  // Auto-unlock timer
  if (busyTimer) clearTimeout(busyTimer);
  busyTimer = setTimeout(() => {
    if (gatewayBusy.busy) {
      console.warn(`⚠️ [BUSY-LOCK] Auto-unlock timer fired for: ${gatewayBusy.operation}`);
      releaseGatewayLock();
    }
  }, BUSY_TIMEOUT);

  console.log(`🔒 [BUSY-LOCK] Acquired: ${operation}`);
  return true;
};

/**
 * Release gateway lock.
 */
export const releaseGatewayLock = (): void => {
  const was = gatewayBusy.operation;
  gatewayBusy.busy = false;
  gatewayBusy.operation = null;
  gatewayBusy.started_at = null;
  if (busyTimer) {
    clearTimeout(busyTimer);
    busyTimer = null;
  }
  if (was) console.log(`🔓 [BUSY-LOCK] Released: ${was}`);
};

/**
 * Get current busy state (for API response).
 */
export const getGatewayBusyState = (): {
  busy: boolean;
  operation: GatewayOperation | null;
  started_at: string | null;
} => {
  // Check timeout before returning
  if (gatewayBusy.busy && gatewayBusy.started_at) {
    const elapsed = Date.now() - gatewayBusy.started_at.getTime();
    if (elapsed > gatewayBusy.timeout) {
      releaseGatewayLock();
    }
  }

  return {
    busy: gatewayBusy.busy,
    operation: gatewayBusy.operation,
    started_at: gatewayBusy.started_at?.toISOString() ?? null,
  };
};
