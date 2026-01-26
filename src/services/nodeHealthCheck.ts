/**
 * Node Health Check Job
 * Monitors OmniaPi nodes and marks them offline if no activity for 5 seconds
 */

import { query } from '../config/database';
import { RowDataPacket } from 'mysql2';
import logger from '../config/logger';
import { emitOmniapiNodeUpdate, emitDispositivoUpdate } from '../socket';
import { updateNodeState, getNode } from './omniapiState';

// ============================================
// NODE HEALTH CHECK
// ============================================

const NODE_OFFLINE_THRESHOLD_SECONDS = 5;
const CHECK_INTERVAL_MS = 3000; // 3 seconds (check more frequently for 5s threshold)

let healthCheckInterval: NodeJS.Timeout | null = null;

/**
 * Check for nodes that haven't been seen in 5 seconds and mark them offline
 */
export const checkNodeHealth = async () => {
  try {
    // Query: find nodes that are online but haven't been updated in 60+ seconds
    const staleNodes = await query(
      `SELECT d.id, d.mac_address, d.nome, d.impianto_id, d.aggiornato_il
       FROM dispositivi d
       WHERE d.device_type = 'omniapi_node'
         AND d.stato = 'online'
         AND d.aggiornato_il < NOW() - INTERVAL ? SECOND`,
      [NODE_OFFLINE_THRESHOLD_SECONDS]
    ) as RowDataPacket[];

    if (staleNodes.length === 0) {
      return; // No stale nodes
    }

    logger.info(`🔍 Node health check: found ${staleNodes.length} stale nodes`);

    for (const node of staleNodes) {
      const mac = node.mac_address;

      // Update database
      await query(
        `UPDATE dispositivi SET stato = 'offline', aggiornato_il = NOW() WHERE id = ?`,
        [node.id]
      );

      // Update in-memory state (può ritornare null se nodo non è in memoria)
      const { node: updatedNode, changed } = updateNodeState(mac, { online: false });

      logger.warn(`⚠️ Node ${mac} (${node.nome}) marked OFFLINE - last seen: ${node.aggiornato_il}`);

      // Emit WebSocket events - sempre, anche se updateNodeState ritorna null
      // Costruiamo un oggetto node minimale se necessario
      const nodePayload = updatedNode || {
        mac,
        online: false,
        rssi: 0,
        version: '',
        relay1: false,
        relay2: false,
        lastSeen: new Date()
      };
      // Emit sempre per health check (è un cambio importante)
      emitOmniapiNodeUpdate(nodePayload);

      // Also emit dispositivo-update for the specific impianto
      if (node.impianto_id) {
        emitDispositivoUpdate(node.impianto_id, {
          id: node.id,
          mac: mac,
          nome: node.nome,
          stato: 'offline',
          online: false
        }, 'state-changed');
      }
    }
  } catch (error: any) {
    logger.error('❌ Error in node health check:', error.message);
  }
};

/**
 * Start the node health check job
 */
export const startNodeHealthCheck = () => {
  if (healthCheckInterval) {
    logger.warn('Node health check already running');
    return;
  }

  logger.info(`🏥 Starting node health check (every ${CHECK_INTERVAL_MS / 1000}s, threshold: ${NODE_OFFLINE_THRESHOLD_SECONDS}s)`);

  // Run immediately on start
  checkNodeHealth();

  // Then run every 3 seconds
  healthCheckInterval = setInterval(checkNodeHealth, CHECK_INTERVAL_MS);
};

/**
 * Stop the node health check job
 */
export const stopNodeHealthCheck = () => {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
    logger.info('🛑 Node health check stopped');
  }
};

export default {
  checkNodeHealth,
  startNodeHealthCheck,
  stopNodeHealthCheck
};
