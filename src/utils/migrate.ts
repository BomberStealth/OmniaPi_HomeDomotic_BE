import { pool } from '../config/database';

// ============================================
// SCRIPT MIGRAZIONE DATABASE
// ============================================

const migrations = [
  // Tabella utenti
  `CREATE TABLE IF NOT EXISTS utenti (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    nome VARCHAR(100) NOT NULL,
    cognome VARCHAR(100) NOT NULL,
    ruolo ENUM('cliente', 'installatore', 'admin') NOT NULL DEFAULT 'cliente',
    creato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    aggiornato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_ruolo (ruolo)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  // Tabella impianti
  `CREATE TABLE IF NOT EXISTS impianti (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    indirizzo VARCHAR(255),
    citta VARCHAR(100),
    cap VARCHAR(10),
    cliente_id INT NOT NULL,
    installatore_id INT NOT NULL,
    creato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    aggiornato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (cliente_id) REFERENCES utenti(id) ON DELETE CASCADE,
    FOREIGN KEY (installatore_id) REFERENCES utenti(id) ON DELETE RESTRICT,
    INDEX idx_cliente (cliente_id),
    INDEX idx_installatore (installatore_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  // Tabella piani
  `CREATE TABLE IF NOT EXISTS piani (
    id INT AUTO_INCREMENT PRIMARY KEY,
    impianto_id INT NOT NULL,
    nome VARCHAR(100) NOT NULL,
    ordine INT NOT NULL DEFAULT 0,
    creato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (impianto_id) REFERENCES impianti(id) ON DELETE CASCADE,
    INDEX idx_impianto (impianto_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  // Tabella stanze
  `CREATE TABLE IF NOT EXISTS stanze (
    id INT AUTO_INCREMENT PRIMARY KEY,
    piano_id INT NOT NULL,
    nome VARCHAR(100) NOT NULL,
    icona VARCHAR(50),
    ordine INT NOT NULL DEFAULT 0,
    creato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (piano_id) REFERENCES piani(id) ON DELETE CASCADE,
    INDEX idx_piano (piano_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  // Tabella dispositivi (Tasmota)
  `CREATE TABLE IF NOT EXISTS dispositivi (
    id INT AUTO_INCREMENT PRIMARY KEY,
    impianto_id INT NOT NULL,
    stanza_id INT,
    tipo ENUM('luce', 'tapparella', 'termostato', 'generico') NOT NULL DEFAULT 'generico',
    nome VARCHAR(100) NOT NULL,
    topic_mqtt VARCHAR(255) NOT NULL,
    ip_address VARCHAR(45),
    mac_address VARCHAR(17) UNIQUE,
    stato ENUM('online', 'offline', 'errore') DEFAULT 'offline',
    configurazione JSON,
    tasmota_info JSON,
    bloccato BOOLEAN DEFAULT FALSE,
    creato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    aggiornato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (impianto_id) REFERENCES impianti(id) ON DELETE CASCADE,
    FOREIGN KEY (stanza_id) REFERENCES stanze(id) ON DELETE SET NULL,
    INDEX idx_impianto (impianto_id),
    INDEX idx_stanza (stanza_id),
    INDEX idx_tipo (tipo),
    INDEX idx_topic (topic_mqtt),
    INDEX idx_mac (mac_address)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  // Tabella scene
  `CREATE TABLE IF NOT EXISTS scene (
    id INT AUTO_INCREMENT PRIMARY KEY,
    impianto_id INT NOT NULL,
    nome VARCHAR(100) NOT NULL,
    icona VARCHAR(50),
    azioni JSON NOT NULL,
    is_base BOOLEAN DEFAULT FALSE,
    creato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    aggiornato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (impianto_id) REFERENCES impianti(id) ON DELETE CASCADE,
    INDEX idx_impianto (impianto_id),
    INDEX idx_base (is_base)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  // Tabella permessi utenti
  `CREATE TABLE IF NOT EXISTS permessi_utenti (
    id INT AUTO_INCREMENT PRIMARY KEY,
    utente_id INT NOT NULL,
    permesso VARCHAR(100) NOT NULL,
    valore BOOLEAN DEFAULT FALSE,
    creato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    aggiornato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (utente_id) REFERENCES utenti(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_permission (utente_id, permesso),
    INDEX idx_utente (utente_id),
    INDEX idx_permesso (permesso)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  // Tabella notifiche
  `CREATE TABLE IF NOT EXISTS notifiche (
    id INT AUTO_INCREMENT PRIMARY KEY,
    utente_id INT NOT NULL,
    tipo ENUM('info', 'warning', 'error', 'success') NOT NULL,
    titolo VARCHAR(255) NOT NULL,
    messaggio TEXT,
    letta BOOLEAN DEFAULT FALSE,
    creata_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (utente_id) REFERENCES utenti(id) ON DELETE CASCADE,
    INDEX idx_utente (utente_id),
    INDEX idx_letta (letta)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
];

export const runMigrations = async () => {
  const connection = await pool.getConnection();

  try {
    console.log('🔄 Inizio migrazioni database...');

    for (const migration of migrations) {
      await connection.query(migration);
    }

    console.log('✅ Migrazioni completate con successo');

    // Crea utente admin di default se non esiste
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash('admin123', 10);

    await connection.query(`
      INSERT IGNORE INTO utenti (email, password, nome, cognome, ruolo)
      VALUES ('admin@omniapi.com', ?, 'Admin', 'OmniaPi', 'admin')
    `, [hashedPassword]);

    console.log('✅ Utente admin creato (email: admin@omniapi.com, password: admin123)');

    // Crea scene base per ogni impianto esistente
    const [impianti]: any = await connection.query('SELECT id FROM impianti');

    const sceneBase = [
      { nome: 'Giorno', icona: '☀️', azioni: JSON.stringify([]) },
      { nome: 'Notte', icona: '🌙', azioni: JSON.stringify([]) },
      { nome: 'Entra', icona: '🚪', azioni: JSON.stringify([]) },
      { nome: 'Esci', icona: '👋', azioni: JSON.stringify([]) }
    ];

    for (const impianto of impianti) {
      for (const scena of sceneBase) {
        await connection.query(`
          INSERT IGNORE INTO scene (impianto_id, nome, icona, azioni, is_base)
          SELECT ?, ?, ?, ?, TRUE
          WHERE NOT EXISTS (
            SELECT 1 FROM scene WHERE impianto_id = ? AND nome = ? AND is_base = TRUE
          )
        `, [impianto.id, scena.nome, scena.icona, scena.azioni, impianto.id, scena.nome]);
      }
    }

    console.log('✅ Scene base create per tutti gli impianti');

  } catch (error) {
    console.error('❌ Errore durante le migrazioni:', error);
    throw error;
  } finally {
    connection.release();
  }
};

// Esegui se chiamato direttamente
if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
