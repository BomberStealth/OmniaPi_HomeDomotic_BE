const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function unlockAllDevices() {
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
    console.log('🔓 Sblocco di tutti i dispositivi...');

    const [result] = await connection.query(`
      UPDATE dispositivi
      SET bloccato = FALSE
      WHERE bloccato = TRUE OR bloccato IS NULL
    `);

    console.log(`✅ Sbloccati ${result.affectedRows} dispositivi`);

  } catch (error) {
    console.error('❌ Errore:', error);
  } finally {
    await connection.end();
  }
}

unlockAllDevices();
