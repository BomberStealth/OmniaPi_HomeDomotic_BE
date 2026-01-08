import { query } from '../config/database';

async function runMigration() {
  console.log('🚀 Starting FCM tokens table migration...');

  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS fcm_tokens (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      token VARCHAR(512) NOT NULL UNIQUE,
      device_info VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES utenti(id) ON DELETE CASCADE,
      INDEX idx_user_id (user_id),
      INDEX idx_token (token)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;

  try {
    await query(createTableSQL, []);
    console.log('✅ Table fcm_tokens created successfully!');
  } catch (error: any) {
    if (error.code === 'ER_TABLE_EXISTS_ERROR') {
      console.log('ℹ️ Table fcm_tokens already exists');
    } else {
      console.error('❌ Error creating table:', error.message);
      process.exit(1);
    }
  }

  // Verifica che la tabella esista
  try {
    const result = await query('DESCRIBE fcm_tokens', []);
    console.log('📋 Table structure:', result);
    console.log('✅ Migration completed successfully!');
  } catch (error: any) {
    console.error('❌ Error verifying table:', error.message);
    process.exit(1);
  }

  process.exit(0);
}

runMigration();
