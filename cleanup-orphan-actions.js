/**
 * Script per pulire le azioni orfane nelle scene
 * Rimuove riferimenti a dispositivi che non esistono più
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

async function cleanupOrphanActions() {
  console.log('🧹 Pulizia azioni orfane nelle scene...\n');

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'omniapi_homedomotic'
  });

  try {
    // 1. Ottieni tutti i dispositivi esistenti
    const [dispositivi] = await connection.execute('SELECT id FROM dispositivi');
    const dispositiviIds = new Set(dispositivi.map(d => d.id));
    console.log(`📊 Dispositivi esistenti: ${dispositiviIds.size}`);

    // 2. Ottieni tutte le scene
    const [scene] = await connection.execute('SELECT id, nome, azioni FROM scene');
    console.log(`📊 Scene totali: ${scene.length}\n`);

    let sceneAggiornate = 0;
    let azioniRimosse = 0;

    for (const scena of scene) {
      let azioni = [];
      try {
        if (typeof scena.azioni === 'string' && scena.azioni.trim()) {
          azioni = JSON.parse(scena.azioni);
        } else if (Array.isArray(scena.azioni)) {
          azioni = scena.azioni;
        }
      } catch (e) {
        console.log(`⚠️  Scena ${scena.id} (${scena.nome}): errore parsing azioni`);
        continue;
      }

      if (!Array.isArray(azioni) || azioni.length === 0) continue;

      // Filtra azioni con dispositivi esistenti
      const azioniValide = azioni.filter(a => {
        const deviceId = a.dispositivo_id;
        if (!deviceId) return true; // Mantieni azioni senza dispositivo_id
        return dispositiviIds.has(deviceId);
      });

      const rimosse = azioni.length - azioniValide.length;
      if (rimosse > 0) {
        azioniRimosse += rimosse;
        sceneAggiornate++;

        console.log(`📝 Scena ${scena.id} (${scena.nome}): rimosse ${rimosse} azioni orfane`);

        // Log dei dispositivi rimossi
        const rimosseIds = azioni
          .filter(a => a.dispositivo_id && !dispositiviIds.has(a.dispositivo_id))
          .map(a => a.dispositivo_id);
        console.log(`   ↳ Dispositivi non esistenti: [${rimosseIds.join(', ')}]`);

        // Aggiorna la scena
        await connection.execute(
          'UPDATE scene SET azioni = ? WHERE id = ?',
          [JSON.stringify(azioniValide), scena.id]
        );
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log(`✅ Pulizia completata!`);
    console.log(`   Scene aggiornate: ${sceneAggiornate}`);
    console.log(`   Azioni orfane rimosse: ${azioniRimosse}`);
    console.log('='.repeat(50));

  } catch (error) {
    console.error('❌ Errore:', error);
  } finally {
    await connection.end();
  }
}

cleanupOrphanActions();
