const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function checkDispositivi() {
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
    console.log('🔍 Verifica dispositivi...\n');

    const [dispositivi] = await connection.query('SELECT id, nome, bloccato, stato FROM dispositivi');
    
    console.log('Dispositivi trovati:');
    dispositivi.forEach(d => {
      console.log(`  - ID: ${d.id}, Nome: ${d.nome}, Bloccato: ${d.bloccato}, Stato: ${d.stato}`);
    });

    console.log('\n📊 Struttura tabella:');
    const [columns] = await connection.query('SHOW COLUMNS FROM dispositivi WHERE Field = "bloccato"');
    console.log(columns[0]);

  } catch (error) {
    console.error('❌ Errore:', error);
  } finally {
    await connection.end();
  }
}

checkDispositivi();
