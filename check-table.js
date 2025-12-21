const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function checkTable() {
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
    console.log('📊 Struttura tabella dispositivi:\n');
    const [columns] = await connection.query('SHOW COLUMNS FROM dispositivi');
    columns.forEach(col => {
      console.log(`${col.Field}: ${col.Type} | Default: ${col.Default} | Null: ${col.Null}`);
    });

  } catch (error) {
    console.error('❌ Errore:', error);
  } finally {
    await connection.end();
  }
}

checkTable();
