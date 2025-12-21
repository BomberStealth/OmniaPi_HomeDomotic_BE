const { query } = require('./dist/config/database');

(async () => {
  try {
    await query('ALTER TABLE scene ADD COLUMN scheduling JSON DEFAULT NULL AFTER azioni');
    console.log('✅ Colonna scheduling aggiunta con successo!');
    process.exit(0);
  } catch (error) {
    if (error.code === 'ER_DUP_FIELDNAME') {
      console.log('⚠️  Colonna scheduling già esistente');
      process.exit(0);
    }
    console.error('❌ Errore:', error.message);
    process.exit(1);
  }
})();
