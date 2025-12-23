import { pool } from '../config/database';

// ============================================
// SENSOR MIGRATION SCRIPT
// Crea le tabelle per i sensori
// ============================================

const runMigration = async () => {
  console.log('🌡️ Starting sensor tables migration...\n');

  try {
    const connection = await pool.getConnection();

    const queries = [
      // Sensor Readings Table
      `CREATE TABLE IF NOT EXISTS sensor_readings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        dispositivo_id INT NOT NULL,
        sensor_type ENUM('temperature', 'humidity', 'pressure', 'battery', 'energy', 'power', 'voltage', 'current') NOT NULL,
        value DECIMAL(10, 2) NOT NULL,
        unit VARCHAR(10) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_reading_device (dispositivo_id),
        INDEX idx_reading_type (sensor_type),
        INDEX idx_reading_created (created_at),
        INDEX idx_reading_device_type (dispositivo_id, sensor_type),
        FOREIGN KEY (dispositivo_id) REFERENCES dispositivi(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      // Sensor Alerts Table (for threshold notifications)
      `CREATE TABLE IF NOT EXISTS sensor_alerts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        dispositivo_id INT NOT NULL,
        sensor_type VARCHAR(20) NOT NULL,
        alert_type ENUM('high', 'low', 'change') NOT NULL,
        threshold_value DECIMAL(10, 2) NOT NULL,
        notify_scene_id INT NULL,
        enabled BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_alert_device (dispositivo_id),
        FOREIGN KEY (dispositivo_id) REFERENCES dispositivi(id) ON DELETE CASCADE,
        FOREIGN KEY (notify_scene_id) REFERENCES scene(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      // Add tipo_dispositivo column if not exists
      `ALTER TABLE dispositivi
       MODIFY COLUMN tipo_dispositivo VARCHAR(50) DEFAULT 'switch'`,
    ];

    let successCount = 0;
    let errorCount = 0;

    for (const sql of queries) {
      try {
        await connection.execute(sql);
        successCount++;
        const tableMatch = sql.match(/CREATE TABLE IF NOT EXISTS\s+(\w+)/i) ||
                          sql.match(/ALTER TABLE\s+(\w+)/i);
        const tableName = tableMatch ? tableMatch[1] : 'unknown';
        console.log(`  ✅ ${tableName}`);
      } catch (error: any) {
        if (error.code === 'ER_TABLE_EXISTS_ERROR' || error.code === 'ER_DUP_FIELDNAME') {
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
    console.log('\n🌡️ Sensor tables are ready!\n');

    process.exit(errorCount > 0 ? 1 : 0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
};

runMigration();
