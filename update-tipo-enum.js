const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function updateTipoEnum() {
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
    console.log('📊 Aggiornamento ENUM tipo...');

    await connection.query(`
      ALTER TABLE dispositivi
      MODIFY COLUMN tipo ENUM('luce', 'tapparella', 'termostato', 'toggle12', 'toggle7', 'toggle5')
    `);

    console.log('✅ ENUM tipo aggiornato con toggle12, toggle7, toggle5!');

  } catch (error) {
    console.error('❌ Errore:', error.message);
  } finally {
    await connection.end();
  }
}

updateTipoEnum();
