import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function runMigration() {
  console.log('🔄 Esecuzione migration email verification + GDPR...');

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '21881'),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // 1. Colonne verifica email
    console.log('📧 Aggiungendo colonne verifica email...');
    try {
      await connection.execute(`
        ALTER TABLE utenti
        ADD COLUMN email_verified BOOLEAN DEFAULT FALSE
      `);
      console.log('  ✓ email_verified aggiunta');
    } catch (e: any) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        console.log('  - email_verified già esistente');
      } else throw e;
    }

    try {
      await connection.execute(`
        ALTER TABLE utenti
        ADD COLUMN verification_token VARCHAR(255) NULL
      `);
      console.log('  ✓ verification_token aggiunta');
    } catch (e: any) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        console.log('  - verification_token già esistente');
      } else throw e;
    }

    try {
      await connection.execute(`
        ALTER TABLE utenti
        ADD COLUMN verification_token_expires TIMESTAMP NULL
      `);
      console.log('  ✓ verification_token_expires aggiunta');
    } catch (e: any) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        console.log('  - verification_token_expires già esistente');
      } else throw e;
    }

    // 2. Colonne reset password
    console.log('🔑 Aggiungendo colonne reset password...');
    try {
      await connection.execute(`
        ALTER TABLE utenti
        ADD COLUMN reset_token VARCHAR(255) NULL
      `);
      console.log('  ✓ reset_token aggiunta');
    } catch (e: any) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        console.log('  - reset_token già esistente');
      } else throw e;
    }

    try {
      await connection.execute(`
        ALTER TABLE utenti
        ADD COLUMN reset_token_expires TIMESTAMP NULL
      `);
      console.log('  ✓ reset_token_expires aggiunta');
    } catch (e: any) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        console.log('  - reset_token_expires già esistente');
      } else throw e;
    }

    // 3. Colonne GDPR
    console.log('📋 Aggiungendo colonne GDPR...');
    try {
      await connection.execute(`
        ALTER TABLE utenti
        ADD COLUMN gdpr_accepted BOOLEAN DEFAULT FALSE
      `);
      console.log('  ✓ gdpr_accepted aggiunta');
    } catch (e: any) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        console.log('  - gdpr_accepted già esistente');
      } else throw e;
    }

    try {
      await connection.execute(`
        ALTER TABLE utenti
        ADD COLUMN gdpr_accepted_at TIMESTAMP NULL
      `);
      console.log('  ✓ gdpr_accepted_at aggiunta');
    } catch (e: any) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        console.log('  - gdpr_accepted_at già esistente');
      } else throw e;
    }

    try {
      await connection.execute(`
        ALTER TABLE utenti
        ADD COLUMN age_confirmed BOOLEAN DEFAULT FALSE
      `);
      console.log('  ✓ age_confirmed aggiunta');
    } catch (e: any) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        console.log('  - age_confirmed già esistente');
      } else throw e;
    }

    // 4. Grandfathering utenti esistenti
    console.log('👴 Grandfathering utenti esistenti come verificati...');
    const [result] = await connection.execute(`
      UPDATE utenti
      SET email_verified = TRUE,
          gdpr_accepted = TRUE,
          age_confirmed = TRUE
      WHERE email_verified IS NULL OR email_verified = FALSE
    `) as any;
    console.log(`  ✓ ${result.affectedRows} utenti aggiornati`);

    // 5. Indici
    console.log('📇 Creando indici...');
    try {
      await connection.execute(`CREATE INDEX idx_verification_token ON utenti(verification_token)`);
      console.log('  ✓ idx_verification_token creato');
    } catch (e: any) {
      if (e.code === 'ER_DUP_KEYNAME') {
        console.log('  - idx_verification_token già esistente');
      } else throw e;
    }

    try {
      await connection.execute(`CREATE INDEX idx_reset_token ON utenti(reset_token)`);
      console.log('  ✓ idx_reset_token creato');
    } catch (e: any) {
      if (e.code === 'ER_DUP_KEYNAME') {
        console.log('  - idx_reset_token già esistente');
      } else throw e;
    }

    console.log('\n✅ Migration completata con successo!');

  } catch (error) {
    console.error('❌ Errore migration:', error);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

runMigration();
