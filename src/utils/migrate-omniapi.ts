import { pool } from '../config/database';

// ============================================
// MIGRAZIONE OMNIAPI - Supporto nodi ESP-NOW
// Compatibile con MySQL (no IF NOT EXISTS per colonne)
// ============================================

/**
 * Verifica se una colonna esiste nella tabella
 */
const columnExists = async (connection: any, table: string, column: string): Promise<boolean> => {
  const [rows]: any = await connection.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows.length > 0;
};

/**
 * Verifica se un indice esiste nella tabella
 */
const indexExists = async (connection: any, table: string, indexName: string): Promise<boolean> => {
  const [rows]: any = await connection.query(
    `SHOW INDEX FROM ${table} WHERE Key_name = ?`,
    [indexName]
  );
  return rows.length > 0;
};

export const runOmniapiMigration = async () => {
  const connection = await pool.getConnection();

  try {
    console.log('🔄 Inizio migrazione OmniaPi...');

    // 1. Aggiunge colonna device_type
    if (!(await columnExists(connection, 'dispositivi', 'device_type'))) {
      await connection.query(`
        ALTER TABLE dispositivi
        ADD COLUMN device_type ENUM('tasmota', 'shelly', 'omniapi_node') DEFAULT 'tasmota'
        AFTER tipo
      `);
      console.log('✅ Aggiunta colonna device_type');
    } else {
      console.log('⏭️ device_type già presente');
    }

    // 2. Aggiunge colonna mac_address se non esiste
    if (!(await columnExists(connection, 'dispositivi', 'mac_address'))) {
      await connection.query(`
        ALTER TABLE dispositivi
        ADD COLUMN mac_address VARCHAR(17) NULL
        AFTER ip_address
      `);
      console.log('✅ Aggiunta colonna mac_address');
    } else {
      console.log('⏭️ mac_address già presente');
    }

    // 3. Rende topic_mqtt nullable
    try {
      await connection.query(`
        ALTER TABLE dispositivi
        MODIFY COLUMN topic_mqtt VARCHAR(255) NULL
      `);
      console.log('✅ topic_mqtt reso nullable');
    } catch (e: any) {
      console.log('⏭️ topic_mqtt già nullable o errore:', e.message);
    }

    // 4. Aggiunge colonna gateway_ip
    if (!(await columnExists(connection, 'dispositivi', 'gateway_ip'))) {
      await connection.query(`
        ALTER TABLE dispositivi
        ADD COLUMN gateway_ip VARCHAR(45) NULL
        AFTER ip_address
      `);
      console.log('✅ Aggiunta colonna gateway_ip');
    } else {
      console.log('⏭️ gateway_ip già presente');
    }

    // 5. Aggiunge colonna omniapi_info
    if (!(await columnExists(connection, 'dispositivi', 'omniapi_info'))) {
      await connection.query(`
        ALTER TABLE dispositivi
        ADD COLUMN omniapi_info JSON NULL
      `);
      console.log('✅ Aggiunta colonna omniapi_info');
    } else {
      console.log('⏭️ omniapi_info già presente');
    }

    // 6. Aggiunge colonna power_state
    if (!(await columnExists(connection, 'dispositivi', 'power_state'))) {
      await connection.query(`
        ALTER TABLE dispositivi
        ADD COLUMN power_state BOOLEAN DEFAULT FALSE
        AFTER stato
      `);
      console.log('✅ Aggiunta colonna power_state');
    } else {
      console.log('⏭️ power_state già presente');
    }

    // 7. Aggiunge indice per device_type
    if (!(await indexExists(connection, 'dispositivi', 'idx_device_type'))) {
      await connection.query(`
        ALTER TABLE dispositivi
        ADD INDEX idx_device_type (device_type)
      `);
      console.log('✅ Aggiunto indice idx_device_type');
    } else {
      console.log('⏭️ idx_device_type già presente');
    }

    console.log('✅ Migrazione OmniaPi completata');

  } catch (error) {
    console.error('❌ Errore durante la migrazione OmniaPi:', error);
    throw error;
  } finally {
    connection.release();
  }
};

// Esegui se chiamato direttamente
if (require.main === module) {
  runOmniapiMigration()
    .then(() => {
      console.log('✅ Fatto!');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Fallito:', err);
      process.exit(1);
    });
}
