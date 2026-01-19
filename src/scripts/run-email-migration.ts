import { pool } from '../config/database';

// ============================================
// MIGRAZIONE: Email Verification + Reset Password + GDPR
// Data: 19 Gennaio 2026
// ============================================

const runEmailMigration = async () => {
  const connection = await pool.getConnection();

  try {
    console.log('🔄 Inizio migrazione email verification...\n');

    // 1. Email verification columns
    const migrations = [
      { sql: `ALTER TABLE utenti ADD COLUMN email_verified BOOLEAN DEFAULT FALSE`, desc: 'email_verified' },
      { sql: `ALTER TABLE utenti ADD COLUMN verification_token VARCHAR(255) NULL`, desc: 'verification_token' },
      { sql: `ALTER TABLE utenti ADD COLUMN verification_token_expires TIMESTAMP NULL`, desc: 'verification_token_expires' },
      { sql: `ALTER TABLE utenti ADD COLUMN reset_token VARCHAR(255) NULL`, desc: 'reset_token' },
      { sql: `ALTER TABLE utenti ADD COLUMN reset_token_expires TIMESTAMP NULL`, desc: 'reset_token_expires' },
      { sql: `ALTER TABLE utenti ADD COLUMN gdpr_accepted BOOLEAN DEFAULT FALSE`, desc: 'gdpr_accepted' },
      { sql: `ALTER TABLE utenti ADD COLUMN gdpr_accepted_at TIMESTAMP NULL`, desc: 'gdpr_accepted_at' },
      { sql: `ALTER TABLE utenti ADD COLUMN age_confirmed BOOLEAN DEFAULT FALSE`, desc: 'age_confirmed' },
    ];

    for (const m of migrations) {
      try {
        await connection.query(m.sql);
        console.log(`✅ Aggiunta colonna: ${m.desc}`);
      } catch (error: any) {
        if (error.code === 'ER_DUP_FIELDNAME' || error.message?.includes('Duplicate column')) {
          console.log(`⏭️  Colonna già esiste: ${m.desc}`);
        } else {
          throw error;
        }
      }
    }

    // 2. Grandfathering: utenti esistenti come verificati
    console.log('\n🔄 Grandfathering utenti esistenti...');

    const [result1]: any = await connection.query(
      `UPDATE utenti SET email_verified = TRUE WHERE email_verified = FALSE OR email_verified IS NULL`
    );
    console.log(`✅ Utenti marcati come verificati: ${result1.affectedRows}`);

    const [result2]: any = await connection.query(
      `UPDATE utenti SET gdpr_accepted = TRUE, age_confirmed = TRUE WHERE gdpr_accepted = FALSE OR gdpr_accepted IS NULL`
    );
    console.log(`✅ GDPR accettato per utenti esistenti: ${result2.affectedRows}`);

    // 3. Verifica finale
    console.log('\n📋 Verifica struttura finale...');
    const [columns]: any = await connection.query(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'defaultdb' AND TABLE_NAME = 'utenti'
      ORDER BY ORDINAL_POSITION
    `);

    console.log('\n| Colonna | Tipo | Nullable |');
    console.log('|---------|------|----------|');
    for (const col of columns) {
      console.log(`| ${col.COLUMN_NAME} | ${col.DATA_TYPE} | ${col.IS_NULLABLE} |`);
    }

    console.log(`\n✅ Migrazione completata! Totale colonne: ${columns.length}`);

  } catch (error) {
    console.error('❌ Errore migrazione:', error);
    throw error;
  } finally {
    connection.release();
    process.exit(0);
  }
};

runEmailMigration();
