import dotenv from 'dotenv';

dotenv.config();

// ============================================
// CONFIGURAZIONE JWT
// ============================================

export const jwtConfig = {
  secret: process.env.JWT_SECRET || 'omniapi-secret-key-change-in-production',
  expiresIn: '7d', // Token valido per 7 giorni
  refreshExpiresIn: '30d' // Refresh token valido per 30 giorni
};
