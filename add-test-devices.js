const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function addTestDevices() {
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
    // Trova l'utente edoardo2846
    const [users] = await connection.query(
      'SELECT id FROM utenti WHERE email = ?',
      ['edoardo2846@gmail.com']
    );

    if (users.length === 0) {
      console.log('❌ Utente edoardo2846 non trovato');
      return;
    }

    const userId = users[0].id;
    console.log(`✅ Trovato utente ID: ${userId}`);

    // Trova l'impianto "Edoardo Cuzzolino"
    const [impianti] = await connection.query(
      'SELECT id FROM impianti WHERE utente_id = ? AND nome = ?',
      [userId, 'Edoardo Cuzzolino']
    );

    if (impianti.length === 0) {
      console.log('❌ Impianto "Edoardo Cuzzolino" non trovato');
      return;
    }

    const impiantoId = impianti[0].id;
    console.log(`✅ Trovato impianto ID: ${impiantoId}`);

    // Crea 3 dispositivi di test
    const testDevices = [
      {
        nome: 'Sci-Fi Door Lock',
        tipo: 'toggle12',
        ip_address: '192.168.1.212',
        mac_address: '00:00:00:00:00:12',
        topic_mqtt: 'test_toggle_12'
      },
      {
        nome: 'Neon Switch',
        tipo: 'toggle7',
        ip_address: '192.168.1.207',
        mac_address: '00:00:00:00:00:07',
        topic_mqtt: 'test_toggle_7'
      },
      {
        nome: 'Merging Letters',
        tipo: 'toggle5',
        ip_address: '192.168.1.205',
        mac_address: '00:00:00:00:00:05',
        topic_mqtt: 'test_toggle_5'
      }
    ];

    for (const device of testDevices) {
      // Verifica se esiste già
      const [existing] = await connection.query(
        'SELECT id FROM dispositivi WHERE mac_address = ?',
        [device.mac_address]
      );

      if (existing.length > 0) {
        console.log(`⚠️  Dispositivo ${device.nome} già esistente, skip`);
        continue;
      }

      await connection.query(
        `INSERT INTO dispositivi
         (impianto_id, nome, tipo, ip_address, mac_address, topic_mqtt, stato, bloccato, power_state)
         VALUES (?, ?, ?, ?, ?, ?, 'online', FALSE, FALSE)`,
        [impiantoId, device.nome, device.tipo, device.ip_address, device.mac_address, device.topic_mqtt]
      );

      console.log(`✅ Creato dispositivo: ${device.nome}`);
    }

    console.log('\n🎉 Tutti i dispositivi di test sono stati creati!');

  } catch (error) {
    console.error('❌ Errore:', error.message);
  } finally {
    await connection.end();
  }
}

addTestDevices();
