import { pool } from '../config/database';

// ============================================
// ENERGY MIGRATION SCRIPT
// Crea le tabelle per il monitoraggio energetico
// ============================================

const runMigration = async () => {
  console.log('⚡ Starting energy tables migration...\n');

  try {
    const connection = await pool.getConnection();

    const queries = [
      // Energy Readings Table
      `CREATE TABLE IF NOT EXISTS energy_readings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        dispositivo_id INT NOT NULL,
        power DECIMAL(10, 2) NOT NULL,
        voltage DECIMAL(6, 2) NULL,
        current DECIMAL(8, 4) NULL,
        power_factor DECIMAL(4, 2) NULL,
        energy_today DECIMAL(10, 3) NULL,
        energy_total DECIMAL(15, 3) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_energy_device (dispositivo_id),
        INDEX idx_energy_created (created_at),
        INDEX idx_energy_device_created (dispositivo_id, created_at),
        FOREIGN KEY (dispositivo_id) REFERENCES dispositivi(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      // Energy Daily Aggregates (for faster queries)
      `CREATE TABLE IF NOT EXISTS energy_daily (
        id INT AUTO_INCREMENT PRIMARY KEY,
        dispositivo_id INT NOT NULL,
        date DATE NOT NULL,
        energy_kwh DECIMAL(10, 3) NOT NULL,
        avg_power DECIMAL(10, 2) NULL,
        max_power DECIMAL(10, 2) NULL,
        min_power DECIMAL(10, 2) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_device_date (dispositivo_id, date),
        INDEX idx_daily_device (dispositivo_id),
        INDEX idx_daily_date (date),
        FOREIGN KEY (dispositivo_id) REFERENCES dispositivi(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      // Energy Cost Settings
      `CREATE TABLE IF NOT EXISTS energy_tariffs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        impianto_id INT NOT NULL,
        nome VARCHAR(50) NOT NULL,
        prezzo_kwh DECIMAL(8, 4) NOT NULL,
        ora_inizio TIME NULL,
        ora_fine TIME NULL,
        giorni VARCHAR(20) NULL,
        attivo BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_tariff_impianto (impianto_id),
        FOREIGN KEY (impianto_id) REFERENCES impianti(id) ON DELETE CASCADE
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
    console.log('\n⚡ Energy tables are ready!\n');

    process.exit(errorCount > 0 ? 1 : 0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
};

runMigration();
