import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../config/database';
import { jwtConfig } from '../config/jwt';
import { User, JWTPayload } from '../types';
import { RowDataPacket } from 'mysql2';
import {
  auditLoginSuccess,
  auditLoginFailed,
  logAudit,
  AuditAction,
  AuditSeverity
} from '../services/auditLog';
import {
  recordLoginAttempt,
  checkLockoutMiddleware,
  checkLockoutStatus
} from '../services/accountLockout';
import { passwordPolicy } from '../config/security';

// ============================================
// CONTROLLER AUTENTICAZIONE - SECURITY ENHANCED
// ============================================

/**
 * Verifica se la password rispetta la policy
 */
const validatePasswordPolicy = (password: string): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (password.length < passwordPolicy.minLength) {
    errors.push(`Password deve essere almeno ${passwordPolicy.minLength} caratteri`);
  }

  if (password.length > passwordPolicy.maxLength) {
    errors.push(`Password non può superare ${passwordPolicy.maxLength} caratteri`);
  }

  if (passwordPolicy.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password deve contenere almeno una lettera maiuscola');
  }

  if (passwordPolicy.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password deve contenere almeno una lettera minuscola');
  }

  if (passwordPolicy.requireNumbers && !/\d/.test(password)) {
    errors.push('Password deve contenere almeno un numero');
  }

  if (passwordPolicy.requireSpecialChars && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password deve contenere almeno un carattere speciale');
  }

  // Check common passwords
  if (passwordPolicy.commonPasswordsList.includes(password.toLowerCase())) {
    errors.push('Password troppo comune. Scegli una password più sicura');
  }

  return { valid: errors.length === 0, errors };
};

// Login (con sicurezza migliorata)
export const login = async (req: Request, res: Response) => {
  const startTime = Date.now();
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

  // DEBUG LOGS
  console.log('📥 LOGIN REQUEST RECEIVED');
  console.log('📥 Body:', { email: req.body?.email, password: '***' });
  console.log('📥 Headers:', { host: req.headers.host, origin: req.headers.origin, 'x-forwarded-for': req.headers['x-forwarded-for'] });
  console.log('📥 Client IP:', clientIp);

  try {
    const { email, password } = req.body;
    const normalizedEmail = email.toLowerCase().trim();

    // ========================================
    // CHECK 1: Account Lockout
    // ========================================
    const lockoutCheck = await checkLockoutMiddleware(normalizedEmail, req);
    if (!lockoutCheck.allowed) {
      await auditLoginFailed(normalizedEmail, 'Account locked', req);
      return res.status(423).json({
        success: false,
        error: lockoutCheck.message,
        locked: true,
        lockoutUntil: lockoutCheck.lockoutUntil
      });
    }

    // ========================================
    // CHECK 2: Find User
    // ========================================
    const users = await query(
      'SELECT * FROM utenti WHERE email = ?',
      [normalizedEmail]
    ) as RowDataPacket[];

    if (users.length === 0) {
      // Record failed attempt
      await recordLoginAttempt(normalizedEmail, clientIp, false);
      await auditLoginFailed(normalizedEmail, 'Email not found', req);

      // Attendi un tempo casuale per prevenire timing attacks
      await new Promise(resolve => setTimeout(resolve, Math.random() * 200 + 100));

      // Check remaining attempts
      const status = await checkLockoutStatus(normalizedEmail);

      return res.status(401).json({
        success: false,
        error: 'Credenziali non valide',
        remainingAttempts: status.remainingAttempts
      });
    }

    const user = users[0] as User;

    // ========================================
    // CHECK 3: Verify Password
    // ========================================
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      // Record failed attempt
      await recordLoginAttempt(normalizedEmail, clientIp, false);
      await auditLoginFailed(normalizedEmail, 'Invalid password', req);

      // Attendi un tempo casuale per prevenire timing attacks
      await new Promise(resolve => setTimeout(resolve, Math.random() * 200 + 100));

      // Check remaining attempts
      const status = await checkLockoutStatus(normalizedEmail);

      return res.status(401).json({
        success: false,
        error: 'Credenziali non valide',
        remainingAttempts: status.remainingAttempts
      });
    }

    // ========================================
    // SUCCESS: Generate Token
    // ========================================
    await recordLoginAttempt(normalizedEmail, clientIp, true);

    // Genera token JWT
    const payload: JWTPayload = {
      userId: user.id,
      email: user.email,
      ruolo: user.ruolo
    };

    const token = jwt.sign(payload, jwtConfig.secret, { expiresIn: jwtConfig.expiresIn } as any);

    // Audit log success
    await auditLoginSuccess(user.id, user.email, req);

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
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

  try {
    const { email, password, nome, cognome } = req.body;
    const normalizedEmail = email.toLowerCase().trim();

    // ========================================
    // VALIDATE PASSWORD POLICY
    // ========================================
    const passwordValidation = validatePasswordPolicy(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Password non conforme alla policy',
        details: passwordValidation.errors
      });
    }

    // ========================================
    // CHECK EXISTING USER
    // ========================================
    const existingUsers = await query(
      'SELECT id FROM utenti WHERE email = ?',
      [normalizedEmail]
    ) as RowDataPacket[];

    if (existingUsers.length > 0) {
      // Audit log
      await logAudit({
        action: AuditAction.REGISTER,
        severity: AuditSeverity.WARNING,
        details: { email: normalizedEmail, reason: 'Email already exists' },
        success: false,
      }, req);

      return res.status(400).json({
        success: false,
        error: 'Email già registrata'
      });
    }

    // ========================================
    // CREATE USER
    // ========================================
    // Hash password con bcrypt (12 rounds per maggiore sicurezza)
    const hashedPassword = await bcrypt.hash(password, 12);

    // Inserisci nuovo utente (ruolo sempre "cliente" per auto-registrazione)
    const result: any = await query(
      'INSERT INTO utenti (email, password, nome, cognome, ruolo) VALUES (?, ?, ?, ?, ?)',
      [normalizedEmail, hashedPassword, nome.trim(), cognome.trim(), 'cliente']
    );

    const registrationTime = Date.now() - startTime;

    // Audit log success
    await logAudit({
      userId: result.insertId,
      action: AuditAction.REGISTER,
      severity: AuditSeverity.INFO,
      details: { email: normalizedEmail },
      success: true,
    }, req);

    console.log(`✅ Registrazione riuscita - User: ${normalizedEmail} (cliente) da IP: ${clientIp} [${registrationTime}ms]`);

    res.status(201).json({
      success: true,
      message: 'Utente registrato con successo'
    });
  } catch (error: any) {
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
      'SELECT id, email, nome, cognome, ruolo, two_factor_enabled, creato_il FROM utenti WHERE id = ?',
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

// Cambia password
export const changePassword = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { currentPassword, newPassword } = req.body;

    // Trova utente
    const users = await query(
      'SELECT * FROM utenti WHERE id = ?',
      [userId]
    ) as RowDataPacket[];

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Utente non trovato'
      });
    }

    const user = users[0];

    // Verifica password attuale
    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    if (!isValidPassword) {
      await logAudit({
        userId,
        action: AuditAction.PASSWORD_CHANGE,
        severity: AuditSeverity.WARNING,
        details: { reason: 'Invalid current password' },
        success: false,
      }, req);

      return res.status(401).json({
        success: false,
        error: 'Password attuale non corretta'
      });
    }

    // Valida nuova password
    const passwordValidation = validatePasswordPolicy(newPassword);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Nuova password non conforme alla policy',
        details: passwordValidation.errors
      });
    }

    // Non permettere la stessa password
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        error: 'La nuova password deve essere diversa dalla precedente'
      });
    }

    // Hash e aggiorna
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await query(
      'UPDATE utenti SET password = ? WHERE id = ?',
      [hashedPassword, userId]
    );

    await logAudit({
      userId,
      action: AuditAction.PASSWORD_CHANGE,
      severity: AuditSeverity.INFO,
      details: { email: user.email },
      success: true,
    }, req);

    res.json({
      success: true,
      message: 'Password aggiornata con successo'
    });
  } catch (error) {
    console.error('Errore cambio password:', error);
    res.status(500).json({
      success: false,
      error: 'Errore durante il cambio password'
    });
  }
};

// Logout (invalidazione lato client + log)
export const logout = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;

    await logAudit({
      userId,
      action: AuditAction.LOGOUT,
      severity: AuditSeverity.INFO,
      success: true,
    }, req);

    res.json({
      success: true,
      message: 'Logout effettuato'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Errore durante il logout'
    });
  }
};
