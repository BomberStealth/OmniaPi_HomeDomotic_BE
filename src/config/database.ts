import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// ============================================
// CONFIGURAZIONE DATABASE MYSQL
// ============================================

const dbConfig = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '21881'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: {
    ca: fs.readFileSync(path.join(__dirname, '../../ca-certificate.pem'))
  },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

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
