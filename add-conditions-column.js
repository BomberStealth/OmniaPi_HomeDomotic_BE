const { query } = require('./dist/config/database');

(async () => {
  try {
    await query('ALTER TABLE scene ADD COLUMN conditions JSON DEFAULT NULL AFTER scheduling');
    console.log('✅ Colonna conditions aggiunta con successo!');
    process.exit(0);
  } catch (error) {
    if (error.code === 'ER_DUP_FIELDNAME') {
      console.log('⚠️  Colonna conditions già esistente');
      process.exit(0);
    }
    console.error('❌ Errore:', error.message);
    process.exit(1);
  }
})();
