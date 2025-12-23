import { pool } from '../config/database';

// ============================================
// PRESENCE MIGRATION SCRIPT
// Crea le tabelle per il tracciamento presenza
// ============================================

const runMigration = async () => {
  console.log('📱 Starting presence tables migration...\n');

  try {
    const connection = await pool.getConnection();

    const queries = [
      // Tracked Devices Table
      `CREATE TABLE IF NOT EXISTS tracked_devices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        impianto_id INT NOT NULL,
        mac_address VARCHAR(17) NOT NULL,
        nome VARCHAR(100) NOT NULL,
        device_type ENUM('phone', 'tablet', 'laptop', 'other') DEFAULT 'phone',
        utente_id INT NULL,
        trigger_enter_scene_id INT NULL,
        trigger_exit_scene_id INT NULL,
        enabled BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_tracked_impianto (impianto_id),
        INDEX idx_tracked_mac (mac_address),
        UNIQUE KEY uk_impianto_mac (impianto_id, mac_address),
        FOREIGN KEY (impianto_id) REFERENCES impianti(id) ON DELETE CASCADE,
        FOREIGN KEY (utente_id) REFERENCES utenti(id) ON DELETE SET NULL,
        FOREIGN KEY (trigger_enter_scene_id) REFERENCES scene(id) ON DELETE SET NULL,
        FOREIGN KEY (trigger_exit_scene_id) REFERENCES scene(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      // Presence Events Table
      `CREATE TABLE IF NOT EXISTS presence_events (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tracked_device_id INT NOT NULL,
        event_type ENUM('enter', 'exit') NOT NULL,
        ip_address VARCHAR(45) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_presence_device (tracked_device_id),
        INDEX idx_presence_created (created_at),
        FOREIGN KEY (tracked_device_id) REFERENCES tracked_devices(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    ];

    let successCount = 0;
    let errorCount = 0;

    for (const sql of queries) {
      try {
        await connection.execute(sql);
        successCount++;
        const tableMatch = sql.match(/CREATE TABLE IF NOT EXISTS\s+(\w+)/i);
        const tableName = tableMatch ? tableMatch[1] : 'unknown';
        console.log(`  ✅ ${tableName}`);
      } catch (error: any) {
        if (error.code === 'ER_TABLE_EXISTS_ERROR') {
          console.log(`  ⏭️  Already exists (skipped)`);
          successCount++;
        } else {
          console.error(`  ❌ Error:`, error.message);
          errorCount++;
        }
      }
    }

    connection.release();

    console.log(`\n📊 Migration completed:`);
    console.log(`   ✅ Success: ${successCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log('\n📱 Presence tables are ready!\n');

    process.exit(errorCount > 0 ? 1 : 0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
};

runMigration();
