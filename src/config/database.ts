import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

// ============================================
// CONFIGURAZIONE DATABASE MYSQL
// ============================================
const sslMode = process.env.DB_SSL_MODE || 'DISABLED';

const dbConfig: any = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// Aggiungi SSL solo se richiesto
if (sslMode === 'REQUIRED') {
  const caPath = path.join(__dirname, '../../ca-certificate.pem');
  if (fs.existsSync(caPath)) {
    dbConfig.ssl = { ca: fs.readFileSync(caPath) };
  }
}

// Pool di connessioni
export const pool = mysql.createPool(dbConfig);

// Test connessione
export const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Database connesso con successo');
    connection.release();
    return true;
  } catch (error) {
    console.error('❌ Errore connessione database:', error);
    return false;
  }
};

// Query helper
export const query = async (sql: string, params?: any[]) => {
  const [results] = await pool.execute(sql, params);
  return results;
};
