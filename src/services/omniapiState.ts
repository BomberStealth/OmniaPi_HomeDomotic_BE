/**
 * OmniaPi State Manager
 * In-memory storage for Gateway and Nodes state
 */

// ============================================
// TYPES
// ============================================

export interface OmniapiGateway {
  online: boolean;
  ip: string;
  version: string;
  nodeCount: number;
  mqttConnected: boolean;
  lastSeen: Date;
}

export interface OmniapiNode {
  mac: string;
  online: boolean;
  rssi: number;
  version: string;
  relay1: boolean;
  relay2: boolean;
  lastSeen: Date;
}

// ============================================
// STATE STORAGE
// ============================================

let gatewayState: OmniapiGateway | null = null;
const nodesState: Map<string, OmniapiNode> = new Map();

// ============================================
// GATEWAY FUNCTIONS
// ============================================

export const updateGatewayState = (data: {
  connected?: boolean;
  ip?: string;
  version?: string;
  nodeCount?: number;
  mqttConnected?: boolean;
}) => {
  gatewayState = {
    online: data.connected ?? gatewayState?.online ?? false,
    ip: data.ip ?? gatewayState?.ip ?? '',
    version: data.version ?? gatewayState?.version ?? '',
    nodeCount: data.nodeCount ?? gatewayState?.nodeCount ?? 0,
    mqttConnected: data.mqttConnected ?? gatewayState?.mqttConnected ?? false,
    lastSeen: new Date()
  };
  console.log('📡 OmniaPi Gateway state updated:', gatewayState);
  return gatewayState;
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
}>) => {
  nodes.forEach(node => {
    const existing = nodesState.get(node.mac);
    nodesState.set(node.mac, {
      mac: node.mac,
      online: node.online ?? existing?.online ?? false,
      rssi: node.rssi ?? existing?.rssi ?? 0,
      version: node.version ?? existing?.version ?? '',
      relay1: node.relays ? node.relays[0] === 1 : existing?.relay1 ?? false,
      relay2: node.relays ? node.relays[1] === 1 : existing?.relay2 ?? false,
      lastSeen: new Date()
    });
  });
  console.log(`📡 OmniaPi Nodes updated: ${nodesState.size} nodes`);
};

export const updateNodeState = (mac: string, data: {
  online?: boolean;
  rssi?: number;
  relay1?: boolean;
  relay2?: boolean;
}): OmniapiNode | null => {
  const existing = nodesState.get(mac);
  if (!existing && !data.online) {
    // Don't create new node from partial state update
    return null;
  }

  const updated: OmniapiNode = {
    mac,
    online: data.online ?? existing?.online ?? false,
    rssi: data.rssi ?? existing?.rssi ?? 0,
    version: existing?.version ?? '',
    relay1: data.relay1 ?? existing?.relay1 ?? false,
    relay2: data.relay2 ?? existing?.relay2 ?? false,
    lastSeen: new Date()
  };

  nodesState.set(mac, updated);
  console.log(`📡 OmniaPi Node ${mac} updated:`, updated);
  return updated;
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

// ============================================
// UTILITY
// ============================================

export const clearState = () => {
  gatewayState = null;
  nodesState.clear();
  console.log('📡 OmniaPi state cleared');
};
