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

  // Tabella dispositivi
  `CREATE TABLE IF NOT EXISTS dispositivi (
    id INT AUTO_INCREMENT PRIMARY KEY,
    stanza_id INT NOT NULL,
    tipo ENUM('luce', 'tapparella', 'termostato') NOT NULL,
    nome VARCHAR(100) NOT NULL,
    topic_mqtt VARCHAR(255) NOT NULL,
    stato ENUM('online', 'offline', 'errore') DEFAULT 'offline',
    configurazione JSON,
    creato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    aggiornato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (stanza_id) REFERENCES stanze(id) ON DELETE CASCADE,
    INDEX idx_stanza (stanza_id),
    INDEX idx_tipo (tipo),
    INDEX idx_topic (topic_mqtt)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  // Tabella scene
  `CREATE TABLE IF NOT EXISTS scene (
    id INT AUTO_INCREMENT PRIMARY KEY,
    impianto_id INT NOT NULL,
    nome VARCHAR(100) NOT NULL,
    icona VARCHAR(50),
    azioni JSON NOT NULL,
    creato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (impianto_id) REFERENCES impianti(id) ON DELETE CASCADE,
    INDEX idx_impianto (impianto_id)
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
