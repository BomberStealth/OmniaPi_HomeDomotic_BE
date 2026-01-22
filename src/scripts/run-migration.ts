import { pool, query } from '../config/database';

// ============================================
// MIGRATION: Refactor sistema inviti e ruoli
// ============================================

async function runMigration() {
  console.log('🔄 Avvio migrazione condivisioni...\n');

  try {
    // Step 1: Verifica struttura attuale
    console.log('📊 Verifica struttura attuale...');
    const [columns] = await pool.execute(`
      SELECT COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'defaultdb' AND TABLE_NAME = 'condivisioni_impianto'
    `);
    console.log('Colonne attuali:', (columns as any[]).map(c => c.COLUMN_NAME).join(', '));

    // Check if already migrated
    const hasAccessoCompleto = (columns as any[]).some(c => c.COLUMN_NAME === 'accesso_completo');
    const hasRuoloCondivisione = (columns as any[]).some(c => c.COLUMN_NAME === 'ruolo_condivisione');

    if (hasAccessoCompleto && !hasRuoloCondivisione) {
      console.log('✅ Migrazione già completata!');
      process.exit(0);
    }

    // Step 2: Aggiungi colonna accesso_completo (se non esiste)
    if (!hasAccessoCompleto) {
      console.log('\n➕ Aggiunta colonna accesso_completo...');
      await pool.execute(`
        ALTER TABLE condivisioni_impianto
        ADD COLUMN accesso_completo BOOLEAN DEFAULT FALSE
      `);
      console.log('✅ Colonna accesso_completo aggiunta');
    }

    // Step 3: Migra i dati esistenti
    if (hasRuoloCondivisione) {
      console.log('\n📝 Migrazione dati esistenti...');
      await pool.execute(`
        UPDATE condivisioni_impianto
        SET accesso_completo = CASE
          WHEN ruolo_condivisione IN ('installatore', 'proprietario') THEN TRUE
          ELSE FALSE
        END
      `);
      console.log('✅ Dati migrati');

      // Step 4: Rimuovi la colonna ruolo_condivisione
      console.log('\n🗑️ Rimozione colonna ruolo_condivisione...');
      await pool.execute(`
        ALTER TABLE condivisioni_impianto
        DROP COLUMN ruolo_condivisione
      `);
      console.log('✅ Colonna ruolo_condivisione rimossa');
    }

    // Step 5: Verifica finale
    console.log('\n📊 Verifica struttura finale...');
    const [finalColumns] = await pool.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'defaultdb' AND TABLE_NAME = 'condivisioni_impianto'
    `);
    console.log('Colonne finali:', (finalColumns as any[]).map(c => c.COLUMN_NAME).join(', '));

    // Mostra condivisioni esistenti
    const condivisioni = await query(`
      SELECT id, impianto_id, email_invitato, accesso_completo, stato
      FROM condivisioni_impianto
      LIMIT 5
    `);
    console.log('\nCondivisioni (sample):');
    console.table(condivisioni);

    console.log('\n✅ Migrazione completata con successo!');
  } catch (error) {
    console.error('❌ Errore durante la migrazione:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
