import { query } from '../config/database';

// ============================================
// OPERATION LOG - Logging operazioni critiche
// ============================================

export type OperationType =
  | 'commission'
  | 'delete_node'
  | 'ota_gateway'
  | 'ota_node'
  | 'scan'
  | 'factory_reset'
  | 'delete_impianto'
  | 'reconciliation';

export type OperationResult = 'success' | 'error' | 'timeout' | 'skipped';

/**
 * Registra un'operazione nel log.
 * Non lancia eccezioni — errori loggati silenziosamente.
 */
export const logOperation = async (
  impiantoId: number | null,
  tipo: OperationType,
  risultato: OperationResult,
  dettagli?: Record<string, any>
): Promise<void> => {
  try {
    await query(
      `INSERT INTO operation_log (impianto_id, tipo, risultato, dettagli) VALUES (?, ?, ?, ?)`,
      [impiantoId, tipo, risultato, dettagli ? JSON.stringify(dettagli) : null]
    );
  } catch (error) {
    console.error('[OPERATION-LOG] Errore scrittura log:', error);
  }
};
