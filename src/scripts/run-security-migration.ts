import { pool } from '../config/database';
import fs from 'fs';
import path from 'path';

// ============================================
// SECURITY MIGRATION SCRIPT
// Esegue la migrazione per le tabelle di sicurezza
// ============================================

const runMigration = async () => {
  console.log('🔐 Starting security tables migration...\n');

  try {
    const connection = await pool.getConnection();

    // Lista delle query da eseguire
    const queries = [
      // Audit Logs Table
      `CREATE TABLE IF NOT EXISTS audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NULL,
        action VARCHAR(50) NOT NULL,
        severity ENUM('INFO', 'WARNING', 'ERROR', 'CRITICAL') DEFAULT 'INFO',
        resource_type VARCHAR(50) NULL,
        resource_id VARCHAR(50) NULL,
        details JSON NULL,
        ip_address VARCHAR(45) NOT NULL,
        user_agent VARCHAR(500) NULL,
        success BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_audit_user (user_id),
        INDEX idx_audit_action (action),
        INDEX idx_audit_severity (severity),
        INDEX idx_audit_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      // Login Attempts Table
      `CREATE TABLE IF NOT EXISTS login_attempts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        ip_address VARCHAR(45) NOT NULL,
        success BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_attempts_email (email),
        INDEX idx_attempts_ip (ip_address),
        INDEX idx_attempts_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      // Add locked_until to utenti
      `ALTER TABLE utenti ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP NULL DEFAULT NULL`,

      // 2FA columns
      `ALTER TABLE utenti ADD COLUMN IF NOT EXISTS two_factor_secret VARCHAR(100) NULL`,
      `ALTER TABLE utenti ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT FALSE`,

      // User Sessions Table
      `CREATE TABLE IF NOT EXISTS user_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        token_hash VARCHAR(64) NOT NULL,
        device_info VARCHAR(500) NULL,
        ip_address VARCHAR(45) NOT NULL,
        last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        INDEX idx_sessions_user (user_id),
        INDEX idx_sessions_token (token_hash)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      // IP Blacklist
      `CREATE TABLE IF NOT EXISTS ip_blacklist (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ip_address VARCHAR(45) NOT NULL UNIQUE,
        reason VARCHAR(255) NULL,
        blocked_by INT NULL,
        blocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NULL,
        INDEX idx_blacklist_ip (ip_address)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    ];

    let successCount = 0;
    let errorCount = 0;

    for (const sql of queries) {
      try {
        await connection.execute(sql);
        successCount++;
        // Estrai nome tabella dalla query per il log
        const tableMatch = sql.match(/(?:CREATE TABLE IF NOT EXISTS|ALTER TABLE)\s+(\w+)/i);
        const tableName = tableMatch ? tableMatch[1] : 'unknown';
        console.log(`  ✅ ${tableName}`);
      } catch (error: any) {
        // Ignora errori di colonna/tabella già esistente
        if (error.code === 'ER_DUP_FIELDNAME' || error.code === 'ER_TABLE_EXISTS_ERROR') {
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
    console.log('\n🔐 Security tables are ready!\n');

    process.exit(errorCount > 0 ? 1 : 0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
};

// Esegui migrazione
runMigration();
