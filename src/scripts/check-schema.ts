import { pool } from '../config/database';

// Script per verificare la struttura della tabella utenti
const checkSchema = async () => {
  const connection = await pool.getConnection();

  try {
    const [rows]: any = await connection.query(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'defaultdb' AND TABLE_NAME = 'utenti'
      ORDER BY ORDINAL_POSITION
    `);

    console.log('\n📋 STRUTTURA TABELLA UTENTI:\n');
    console.log('| Colonna | Tipo | Nullable | Default |');
    console.log('|---------|------|----------|---------|');

    for (const row of rows) {
      console.log(`| ${row.COLUMN_NAME} | ${row.DATA_TYPE} | ${row.IS_NULLABLE} | ${row.COLUMN_DEFAULT || 'NULL'} |`);
    }

    console.log('\nTotale colonne:', rows.length);

  } catch (error) {
    console.error('Errore:', error);
  } finally {
    connection.release();
    process.exit(0);
  }
};

checkSchema();
