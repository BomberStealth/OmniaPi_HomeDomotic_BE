import { query, pool } from '../config/database';

// Script per aggiungere la colonna is_shortcut alla tabella scene
async function addShortcutColumn() {
  try {
    console.log('Aggiunta colonna is_shortcut alla tabella scene...');

    // Verifica se la colonna esiste già
    const [columns]: any = await pool.execute(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_NAME = 'scene' AND COLUMN_NAME = 'is_shortcut'`
    );

    if (columns.length > 0) {
      console.log('La colonna is_shortcut esiste già');
      process.exit(0);
    }

    // Aggiungi la colonna - di default TRUE per tutte le scene
    await query(
      `ALTER TABLE scene ADD COLUMN is_shortcut BOOLEAN DEFAULT TRUE AFTER is_base`
    );

    console.log('Colonna is_shortcut aggiunta con successo!');

    // Aggiorna le scene esistenti per avere is_shortcut = TRUE
    await query(`UPDATE scene SET is_shortcut = TRUE WHERE is_shortcut IS NULL`);

    console.log('Scene esistenti aggiornate con is_shortcut = TRUE');

    process.exit(0);
  } catch (error) {
    console.error('Errore durante la migrazione:', error);
    process.exit(1);
  }
}

addShortcutColumn();
