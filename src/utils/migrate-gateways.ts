import { pool } from '../config/database';

// ============================================
// MIGRAZIONE GATEWAYS - Supporto Gateway OmniaPi
// ============================================

/**
 * Verifica se una tabella esiste nel database
 */
const tableExists = async (connection: any, table: string): Promise<boolean> => {
  const [rows]: any = await connection.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return rows.length > 0;
};

export const runGatewaysMigration = async () => {
  const connection = await pool.getConnection();

  try {
    console.log('🔄 Inizio migrazione Gateways...');

    // 1. Crea tabella gateways se non esiste
    if (!(await tableExists(connection, 'gateways'))) {
      await connection.query(`
        CREATE TABLE gateways (
          id INT PRIMARY KEY AUTO_INCREMENT,
          impianto_id INT NULL,
          mac_address VARCHAR(17) NOT NULL UNIQUE,
          nome VARCHAR(100) DEFAULT 'Gateway OmniaPi',
          ip_address VARCHAR(45),
          firmware_version VARCHAR(20),
          status ENUM('online', 'offline', 'setup', 'pending') DEFAULT 'pending',
          mqtt_connected BOOLEAN DEFAULT FALSE,
          node_count INT DEFAULT 0,
          last_seen DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (impianto_id) REFERENCES impianti(id) ON DELETE SET NULL,
          INDEX idx_gateway_mac (mac_address),
          INDEX idx_gateway_impianto (impianto_id),
          INDEX idx_gateway_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('✅ Creata tabella gateways');
    } else {
      console.log('⏭️ Tabella gateways già presente');
    }

    console.log('✅ Migrazione Gateways completata');

  } catch (error) {
    console.error('❌ Errore durante la migrazione Gateways:', error);
    throw error;
  } finally {
    connection.release();
  }
};

// Esegui se chiamato direttamente
if (require.main === module) {
  runGatewaysMigration()
    .then(() => {
      console.log('✅ Fatto!');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Fallito:', err);
      process.exit(1);
    });
}
