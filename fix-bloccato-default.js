const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function fixBloccatoDefault() {
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
    console.log('🔧 Modifica default bloccato a FALSE...');

    await connection.query(`
      ALTER TABLE dispositivi
      MODIFY COLUMN bloccato BOOLEAN DEFAULT FALSE
    `);

    console.log('✅ Default modificato con successo!');

    // Aggiorna anche i dispositivi esistenti NULL a FALSE
    const [result] = await connection.query(`
      UPDATE dispositivi
      SET bloccato = FALSE
      WHERE bloccato IS NULL
    `);

    console.log(`✅ Aggiornati ${result.affectedRows} dispositivi esistenti`);

  } catch (error) {
    console.error('❌ Errore:', error);
  } finally {
    await connection.end();
  }
}

fixBloccatoDefault();
