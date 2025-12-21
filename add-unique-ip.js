const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function addUniqueConstraint() {
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
    console.log('🔧 Aggiunta constraint UNIQUE su ip_address...');

    // Rimuovi duplicati esistenti (se ci sono)
    await connection.query(`
      DELETE t1 FROM dispositivi t1
      INNER JOIN dispositivi t2 
      WHERE t1.id > t2.id AND t1.ip_address = t2.ip_address
    `);

    // Aggiungi constraint UNIQUE
    await connection.query(`
      ALTER TABLE dispositivi
      ADD UNIQUE KEY unique_ip_address (ip_address)
    `);

    console.log('✅ Constraint UNIQUE aggiunto con successo!');

  } catch (error) {
    if (error.code === 'ER_DUP_KEYNAME') {
      console.log('⚠️  Constraint già esistente');
    } else {
      console.error('❌ Errore:', error);
    }
  } finally {
    await connection.end();
  }
}

addUniqueConstraint();
