const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function addPowerState() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '21881'),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: {
      ca: fs.readFileSync(path.join(__dirname, 'ca-certificate.pem'))
    }
  });

  try {
    console.log('📊 Aggiunta colonna power_state...');

    await connection.query(`
      ALTER TABLE dispositivi
      ADD COLUMN power_state BOOLEAN DEFAULT FALSE AFTER bloccato
    `);

    console.log('✅ Colonna power_state aggiunta con successo!');

    const [columns] = await connection.query('SHOW COLUMNS FROM dispositivi');
    console.log('\n📋 Struttura aggiornata:');
    columns.forEach(col => {
      console.log(`  ${col.Field}: ${col.Type}`);
    });

  } catch (error) {
    console.error('❌ Errore:', error.message);
  } finally {
    await connection.end();
  }
}

addPowerState();
