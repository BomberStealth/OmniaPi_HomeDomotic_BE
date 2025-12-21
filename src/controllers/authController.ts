import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../config/database';
import { jwtConfig } from '../config/jwt';
import { User, JWTPayload, ApiResponse } from '../types';
import { RowDataPacket } from 'mysql2';

// ============================================
// CONTROLLER AUTENTICAZIONE
// ============================================

// Login (con sicurezza migliorata)
export const login = async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const { email, password } = req.body;
    const clientIp = req.ip || req.socket.remoteAddress;

    // Trova utente
    const users = await query(
      'SELECT * FROM utenti WHERE email = ?',
      [email]
    ) as RowDataPacket[];

    if (users.length === 0) {
      // Log tentativo fallito
      console.warn(`⚠️  Login fallito - Email non trovata: ${email} da IP: ${clientIp}`);

      // Attendi un tempo casuale per prevenire timing attacks
      await new Promise(resolve => setTimeout(resolve, Math.random() * 200 + 100));

      return res.status(401).json({
        success: false,
        error: 'Credenziali non valide'
      });
    }

    const user = users[0] as User;

    // Verifica password
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      // Log tentativo fallito
      console.warn(`⚠️  Login fallito - Password errata per: ${email} da IP: ${clientIp}`);

      // Attendi un tempo casuale per prevenire timing attacks
      await new Promise(resolve => setTimeout(resolve, Math.random() * 200 + 100));

      return res.status(401).json({
        success: false,
        error: 'Credenziali non valide'
      });
    }

    // Genera token JWT
    const payload: JWTPayload = {
      userId: user.id,
      email: user.email,
      ruolo: user.ruolo
    };

    const token = jwt.sign(payload, jwtConfig.secret, { expiresIn: jwtConfig.expiresIn } as any);

    // Log login riuscito
    const loginTime = Date.now() - startTime;
    console.log(`✅ Login riuscito - User: ${user.email} (${user.ruolo}) da IP: ${clientIp} [${loginTime}ms]`);

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          nome: user.nome,
          cognome: user.cognome,
          ruolo: user.ruolo
        }
      }
    });
  } catch (error) {
    const clientIp = req.ip || req.socket.remoteAddress;
    console.error(`❌ Errore login da IP: ${clientIp}`, error);

    res.status(500).json({
      success: false,
      error: 'Errore durante il login'
    });
  }
};

// Registrazione (auto-registrazione pubblica)
export const register = async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const { email, password, nome, cognome } = req.body;
    const clientIp = req.ip || req.socket.remoteAddress;

    // Hash password con bcrypt (10 rounds)
    const hashedPassword = await bcrypt.hash(password, 10);

    // Inserisci nuovo utente (ruolo sempre "cliente" per auto-registrazione)
    const result = await query(
      'INSERT INTO utenti (email, password, nome, cognome, ruolo) VALUES (?, ?, ?, ?, ?)',
      [email, hashedPassword, nome, cognome, 'cliente']
    );

    const registrationTime = Date.now() - startTime;

    // Log registrazione riuscita
    console.log(`✅ Registrazione riuscita - User: ${email} (cliente) da IP: ${clientIp} [${registrationTime}ms]`);

    res.status(201).json({
      success: true,
      message: 'Utente registrato con successo'
    });
  } catch (error: any) {
    const clientIp = req.ip || req.socket.remoteAddress;

    if (error.code === 'ER_DUP_ENTRY') {
      console.warn(`⚠️  Registrazione fallita - Email già esistente: ${req.body.email} da IP: ${clientIp}`);

      return res.status(400).json({
        success: false,
        error: 'Email già registrata'
      });
    }

    console.error(`❌ Errore registrazione da IP: ${clientIp}`, error);
    res.status(500).json({
      success: false,
      error: 'Errore durante la registrazione'
    });
  }
};

// Ottieni profilo utente corrente
export const getProfile = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;

    const users = await query(
      'SELECT id, email, nome, cognome, ruolo, creato_il FROM utenti WHERE id = ?',
      [userId]
    ) as RowDataPacket[];

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Utente non trovato'
      });
    }

    res.json({
      success: true,
      data: users[0]
    });
  } catch (error) {
    console.error('Errore get profile:', error);
    res.status(500).json({
      success: false,
      error: 'Errore durante il recupero del profilo'
    });
  }
};
