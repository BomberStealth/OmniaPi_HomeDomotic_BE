import { pool } from '../config/database';

// ============================================
// GEOFENCE MIGRATION SCRIPT
// Crea le tabelle per il geofencing
// ============================================

const runMigration = async () => {
  console.log('📍 Starting geofence tables migration...\n');

  try {
    const connection = await pool.getConnection();

    const queries = [
      // Geofence Zones Table
      `CREATE TABLE IF NOT EXISTS geofence_zones (
        id INT AUTO_INCREMENT PRIMARY KEY,
        impianto_id INT NOT NULL,
        nome VARCHAR(100) NOT NULL,
        latitude DECIMAL(10, 8) NOT NULL,
        longitude DECIMAL(11, 8) NOT NULL,
        radius INT DEFAULT 100,
        trigger_enter_scene_id INT NULL,
        trigger_exit_scene_id INT NULL,
        enabled BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_geofence_impianto (impianto_id),
        FOREIGN KEY (impianto_id) REFERENCES impianti(id) ON DELETE CASCADE,
        FOREIGN KEY (trigger_enter_scene_id) REFERENCES scene(id) ON DELETE SET NULL,
        FOREIGN KEY (trigger_exit_scene_id) REFERENCES scene(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      // User Locations Table
      `CREATE TABLE IF NOT EXISTS user_locations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL UNIQUE,
        latitude DECIMAL(10, 8) NOT NULL,
        longitude DECIMAL(11, 8) NOT NULL,
        accuracy INT DEFAULT 10,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_location_user (user_id),
        FOREIGN KEY (user_id) REFERENCES utenti(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      // Geofence Events Table
      `CREATE TABLE IF NOT EXISTS geofence_events (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        zone_id INT NOT NULL,
        event_type ENUM('enter', 'exit') NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_event_zone (zone_id),
        INDEX idx_event_user (user_id),
        INDEX idx_event_created (created_at),
        FOREIGN KEY (user_id) REFERENCES utenti(id) ON DELETE CASCADE,
        FOREIGN KEY (zone_id) REFERENCES geofence_zones(id) ON DELETE CASCADE
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
    console.log('\n📍 Geofence tables are ready!\n');

    process.exit(errorCount > 0 ? 1 : 0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
};

runMigration();
