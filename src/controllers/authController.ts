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

// Login
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email e password richiesti'
      });
    }

    // Trova utente
    const users = await query(
      'SELECT * FROM utenti WHERE email = ?',
      [email]
    ) as RowDataPacket[];

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Credenziali non valide'
      });
    }

    const user = users[0] as User;

    // Verifica password
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Credenziali non valide'
      });
    }

    // Genera token
    const payload: JWTPayload = {
      userId: user.id,
      email: user.email,
      ruolo: user.ruolo
    };

    const token = jwt.sign(payload, jwtConfig.secret, {
      expiresIn: jwtConfig.expiresIn
    });

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
    console.error('Errore login:', error);
    res.status(500).json({
      success: false,
      error: 'Errore durante il login'
    });
  }
};

// Registrazione (solo per admin)
export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, nome, cognome, ruolo } = req.body;

    if (!email || !password || !nome || !cognome) {
      return res.status(400).json({
        success: false,
        error: 'Tutti i campi sono richiesti'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Inserisci utente
    await query(
      'INSERT INTO utenti (email, password, nome, cognome, ruolo) VALUES (?, ?, ?, ?, ?)',
      [email, hashedPassword, nome, cognome, ruolo || 'cliente']
    );

    res.status(201).json({
      success: true,
      message: 'Utente registrato con successo'
    });
  } catch (error: any) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        success: false,
        error: 'Email già registrata'
      });
    }

    console.error('Errore registrazione:', error);
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
