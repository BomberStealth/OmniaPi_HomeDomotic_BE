const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function checkDevices() {
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
    const [rows] = await connection.query('SELECT id, nome, topic_mqtt, ip_address, power_state FROM dispositivi');
    console.log('\n📋 Dispositivi registrati:\n');
    console.table(rows);
  } catch (error) {
    console.error('❌ Errore:', error.message);
  } finally {
    await connection.end();
  }
}

checkDevices();
