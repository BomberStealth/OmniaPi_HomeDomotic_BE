// Script per eseguire la migrazione delle tabelle di sicurezza
// Eseguire con: node src/scripts/run-security-migration.js

require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const dbConfig = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '21881'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: {
    ca: fs.readFileSync(path.join(__dirname, '../../ca-certificate.pem'))
  }
};

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

// Colonne da aggiungere alla tabella utenti
const alterQueries = [
  `ALTER TABLE utenti ADD COLUMN locked_until TIMESTAMP NULL DEFAULT NULL`,
  `ALTER TABLE utenti ADD COLUMN two_factor_secret VARCHAR(100) NULL`,
  `ALTER TABLE utenti ADD COLUMN two_factor_enabled BOOLEAN DEFAULT FALSE`,
];

async function runMigration() {
  console.log('🔐 Starting security tables migration...\n');

  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Connected to database\n');

    let successCount = 0;
    let skipCount = 0;

    // Crea le tabelle
    for (const sql of queries) {
      try {
        await connection.execute(sql);
        const tableMatch = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/i);
        const tableName = tableMatch ? tableMatch[1] : 'unknown';
        console.log(`  ✅ Table: ${tableName}`);
        successCount++;
      } catch (error) {
        if (error.code === 'ER_TABLE_EXISTS_ERROR') {
          console.log(`  ⏭️  Table already exists (skipped)`);
          skipCount++;
        } else {
          console.error(`  ❌ Error:`, error.message);
        }
      }
    }

    // Aggiungi colonne alla tabella utenti
    console.log('\n  Adding columns to utenti...');
    for (const sql of alterQueries) {
      try {
        await connection.execute(sql);
        const colMatch = sql.match(/ADD COLUMN (\w+)/i);
        const colName = colMatch ? colMatch[1] : 'unknown';
        console.log(`    ✅ Column: ${colName}`);
        successCount++;
      } catch (error) {
        if (error.code === 'ER_DUP_FIELDNAME') {
          console.log(`    ⏭️  Column already exists (skipped)`);
          skipCount++;
        } else {
          console.error(`    ❌ Error:`, error.message);
        }
      }
    }

    console.log(`\n📊 Migration completed:`);
    console.log(`   ✅ Success: ${successCount}`);
    console.log(`   ⏭️  Skipped: ${skipCount}`);
    console.log('\n🔐 Security tables are ready!\n');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

runMigration();
