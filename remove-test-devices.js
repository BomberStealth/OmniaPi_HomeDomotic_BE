const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function removeTestDevices() {
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
    console.log('🗑️  Rimozione dispositivi di test...');

    // Rimuovi i 3 dispositivi di test
    const [result] = await connection.query(
      `DELETE FROM dispositivi WHERE tipo IN ('toggle12', 'toggle7', 'toggle5')`
    );

    console.log(`✅ Rimossi ${result.affectedRows} dispositivi di test`);

    // Mostra dispositivi rimanenti
    const [remaining] = await connection.query(
      `SELECT id, nome, tipo, ip_address FROM dispositivi WHERE impianto_id = 8`
    );

    console.log('\n📋 Dispositivi rimanenti:');
    remaining.forEach(d => {
      console.log(`  - ${d.nome} (${d.tipo}) - ${d.ip_address}`);
    });

  } catch (error) {
    console.error('❌ Errore:', error.message);
  } finally {
    await connection.end();
  }
}

removeTestDevices();
