import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../config/database';
import { jwtConfig } from '../config/jwt';
import { User, JWTPayload } from '../types';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
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
import {
  generateToken,
  sendVerificationEmail,
  sendResetPasswordEmail
} from '../services/emailService';
import { createSession, deleteSessionByToken } from './sessionsController';

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
    // CHECK 4: Email Verified
    // ========================================
    if (!user.email_verified) {
      console.log(`⚠️ Login bloccato - Email non verificata: ${user.email}`);
      return res.status(403).json({
        success: false,
        error: 'Email non verificata',
        message: 'Verifica la tua email prima di accedere. Controlla la tua casella di posta.',
        needsVerification: true
      });
    }

    // ========================================
    // SUCCESS: Generate Token
    // ========================================

    // Pulizia sessioni admin orfane (se l'utente aveva sessioni admin attive)
    await query('DELETE FROM condivisioni_impianto WHERE utente_id = ? AND is_admin_session = true', [user.id]);

    await recordLoginAttempt(normalizedEmail, clientIp, true);

    // Genera token JWT con token_version per invalidazione sessioni
    const payload: JWTPayload = {
      userId: user.id,
      email: user.email,
      ruolo: user.ruolo,
      tokenVersion: user.token_version || 0
    };

    const token = jwt.sign(payload, jwtConfig.secret, { expiresIn: jwtConfig.expiresIn } as any);

    // Audit log success
    await auditLoginSuccess(user.id, user.email, req);

    // Crea sessione nel database
    const userAgent = req.headers['user-agent'] || 'Unknown';
    try {
      await createSession(user.id, token, userAgent, clientIp);
    } catch (sessionError) {
      console.error('⚠️ Errore creazione sessione:', sessionError);
      // Non bloccare il login se la sessione non viene creata
    }

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
    const { email, password, nome, cognome, ruolo, gdprAccepted, ageConfirmed } = req.body;
    console.log('[REGISTER] req.body:', JSON.stringify(req.body));
    console.log('[REGISTER] gdprAccepted:', gdprAccepted, 'ageConfirmed:', ageConfirmed, 'ruolo:', ruolo);

    // Valida ruolo (solo proprietario o installatore, mai admin da registrazione)
    const validRoles = ['proprietario', 'installatore'];
    const userRole = validRoles.includes(ruolo) ? ruolo : 'proprietario';
    const normalizedEmail = email.toLowerCase().trim();

    // ========================================
    // VALIDATE GDPR CONSENT
    // ========================================
    if (!gdprAccepted) {
      return res.status(400).json({
        success: false,
        error: 'Devi accettare l\'informativa sulla privacy per registrarti'
      });
    }

    if (!ageConfirmed) {
      return res.status(400).json({
        success: false,
        error: 'Devi confermare di avere almeno 16 anni'
      });
    }

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
    // CREATE USER WITH EMAIL VERIFICATION
    // ========================================
    // Hash password con bcrypt (12 rounds per maggiore sicurezza)
    const hashedPassword = await bcrypt.hash(password, 12);

    // Genera token verifica email
    const verificationToken = generateToken();
    const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 ore

    // Inserisci nuovo utente con ruolo scelto (proprietario o installatore)
    const result: any = await query(
      `INSERT INTO utenti (
        email, password, nome, cognome, ruolo,
        email_verified, verification_token, verification_token_expires,
        gdpr_accepted, gdpr_accepted_at, age_confirmed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
      [
        normalizedEmail, hashedPassword, nome.trim(), cognome.trim(), userRole,
        false, verificationToken, tokenExpires,
        true, true
      ]
    );

    const registrationTime = Date.now() - startTime;

    // Invia email di verifica
    const emailSent = await sendVerificationEmail(normalizedEmail, nome.trim(), verificationToken);

    // Collega inviti pendenti a questo nuovo utente
    const { linkPendingInvites } = await import('./condivisioniController');
    const linkedInvites = await linkPendingInvites(result.insertId, normalizedEmail);
    if (linkedInvites > 0) {
      console.log(`🔗 ${linkedInvites} inviti pendenti collegati al nuovo utente ${normalizedEmail}`);
    }

    // Audit log success
    await logAudit({
      userId: result.insertId,
      action: AuditAction.REGISTER,
      severity: AuditSeverity.INFO,
      details: { email: normalizedEmail, ruolo: userRole, emailSent },
      success: true,
    }, req);

    console.log(`✅ Registrazione riuscita - User: ${normalizedEmail} (${userRole}) da IP: ${clientIp} [${registrationTime}ms]`);
    console.log(`📧 Email verifica ${emailSent ? 'inviata' : 'FALLITA'} a: ${normalizedEmail}`);

    res.status(201).json({
      success: true,
      message: emailSent
        ? 'Registrazione completata! Controlla la tua email per verificare l\'account.'
        : 'Registrazione completata! Contatta il supporto per attivare il tuo account.',
      requiresVerification: true
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

    // Hash e aggiorna + incrementa token_version per invalidare tutte le sessioni
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    const newTokenVersion = (user.token_version || 0) + 1;
    await query(
      'UPDATE utenti SET password = ?, token_version = ? WHERE id = ?',
      [hashedPassword, newTokenVersion, userId]
    );

    await logAudit({
      userId,
      action: AuditAction.PASSWORD_CHANGE,
      severity: AuditSeverity.INFO,
      details: { email: user.email, sessionsInvalidated: true },
      success: true,
    }, req);

    console.log(`🔐 Password cambiata per ${user.email} - Tutte le sessioni invalidate (token_version: ${newTokenVersion})`);

    res.json({
      success: true,
      message: 'Password aggiornata con successo. Tutte le altre sessioni sono state disconnesse.',
      sessionsInvalidated: true
    });
  } catch (error) {
    console.error('Errore cambio password:', error);
    res.status(500).json({
      success: false,
      error: 'Errore durante il cambio password'
    });
  }
};

// Logout (invalidazione lato client + log + elimina sessione)
export const logout = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const token = req.headers.authorization?.replace('Bearer ', '');

    // Elimina sessione dal database
    if (token) {
      try {
        await deleteSessionByToken(token);
      } catch (sessionError) {
        console.error('⚠️ Errore eliminazione sessione:', sessionError);
      }
    }

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

// ============================================
// VERIFICA EMAIL
// ============================================
export const verifyEmail = async (req: Request, res: Response) => {
  try {
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Token non valido'
      });
    }

    // Trova utente con questo token
    const users = await query(
      `SELECT id, email, nome, verification_token_expires
       FROM utenti
       WHERE verification_token = ? AND email_verified = FALSE`,
      [token]
    ) as RowDataPacket[];

    if (users.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Token non valido o già utilizzato'
      });
    }

    const user = users[0];

    // Verifica scadenza token (24 ore)
    if (user.verification_token_expires && new Date(user.verification_token_expires) < new Date()) {
      return res.status(400).json({
        success: false,
        error: 'Token scaduto. Richiedi un nuovo link di verifica.'
      });
    }

    // Aggiorna utente come verificato
    await query(
      `UPDATE utenti
       SET email_verified = TRUE,
           verification_token = NULL,
           verification_token_expires = NULL
       WHERE id = ?`,
      [user.id]
    );

    await logAudit({
      userId: user.id,
      action: AuditAction.EMAIL_VERIFIED || 'EMAIL_VERIFIED',
      severity: AuditSeverity.INFO,
      details: { email: user.email },
      success: true,
    }, req);

    console.log(`✅ Email verificata: ${user.email}`);

    res.json({
      success: true,
      message: 'Email verificata con successo! Ora puoi effettuare il login.'
    });
  } catch (error) {
    console.error('❌ Errore verifica email:', error);
    res.status(500).json({
      success: false,
      error: 'Errore durante la verifica email'
    });
  }
};

// ============================================
// REINVIA EMAIL VERIFICA
// ============================================
export const resendVerification = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const normalizedEmail = email?.toLowerCase().trim();

    if (!normalizedEmail) {
      return res.status(400).json({
        success: false,
        error: 'Email richiesta'
      });
    }

    // Trova utente
    const users = await query(
      'SELECT id, email, nome, email_verified FROM utenti WHERE email = ?',
      [normalizedEmail]
    ) as RowDataPacket[];

    if (users.length === 0) {
      // Non rivelare se l'email esiste o meno
      return res.json({
        success: true,
        message: 'Se l\'email è registrata, riceverai un link di verifica.'
      });
    }

    const user = users[0];

    if (user.email_verified) {
      return res.status(400).json({
        success: false,
        error: 'Email già verificata'
      });
    }

    // Genera nuovo token
    const verificationToken = generateToken();
    const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 ore

    await query(
      `UPDATE utenti
       SET verification_token = ?, verification_token_expires = ?
       WHERE id = ?`,
      [verificationToken, tokenExpires, user.id]
    );

    // Invia email
    await sendVerificationEmail(user.email, user.nome, verificationToken);

    res.json({
      success: true,
      message: 'Se l\'email è registrata, riceverai un link di verifica.'
    });
  } catch (error) {
    console.error('❌ Errore reinvio verifica:', error);
    res.status(500).json({
      success: false,
      error: 'Errore durante l\'invio dell\'email'
    });
  }
};

// ============================================
// FORGOT PASSWORD (richiesta reset)
// ============================================
export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const normalizedEmail = email?.toLowerCase().trim();

    if (!normalizedEmail) {
      return res.status(400).json({
        success: false,
        error: 'Email richiesta'
      });
    }

    // Trova utente
    const users = await query(
      'SELECT id, email, nome FROM utenti WHERE email = ?',
      [normalizedEmail]
    ) as RowDataPacket[];

    // Rispondi sempre con successo (non rivelare se email esiste)
    if (users.length === 0) {
      return res.json({
        success: true,
        message: 'Se l\'email è registrata, riceverai un link per il reset.'
      });
    }

    const user = users[0];

    // Genera token reset
    const resetToken = generateToken();
    const tokenExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 ora

    await query(
      `UPDATE utenti
       SET reset_token = ?, reset_token_expires = ?
       WHERE id = ?`,
      [resetToken, tokenExpires, user.id]
    );

    // Invia email
    await sendResetPasswordEmail(user.email, user.nome, resetToken);

    await logAudit({
      userId: user.id,
      action: AuditAction.PASSWORD_RESET_REQUEST || 'PASSWORD_RESET_REQUEST',
      severity: AuditSeverity.INFO,
      details: { email: user.email },
      success: true,
    }, req);

    console.log(`📧 Reset password richiesto per: ${user.email}`);

    res.json({
      success: true,
      message: 'Se l\'email è registrata, riceverai un link per il reset.'
    });
  } catch (error) {
    console.error('❌ Errore forgot password:', error);
    res.status(500).json({
      success: false,
      error: 'Errore durante la richiesta reset'
    });
  }
};

// ============================================
// RESET PASSWORD (con token)
// ============================================
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Token e nuova password richiesti'
      });
    }

    // Valida password
    const passwordValidation = validatePasswordPolicy(newPassword);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Password non conforme alla policy',
        details: passwordValidation.errors
      });
    }

    // Trova utente con token valido
    const users = await query(
      `SELECT id, email, reset_token_expires
       FROM utenti
       WHERE reset_token = ?`,
      [token]
    ) as RowDataPacket[];

    if (users.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Token non valido o già utilizzato'
      });
    }

    const user = users[0];

    // Verifica scadenza
    if (user.reset_token_expires && new Date(user.reset_token_expires) < new Date()) {
      return res.status(400).json({
        success: false,
        error: 'Token scaduto. Richiedi un nuovo reset password.'
      });
    }

    // Hash nuova password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Aggiorna password e rimuovi token
    await query(
      `UPDATE utenti
       SET password = ?, reset_token = NULL, reset_token_expires = NULL
       WHERE id = ?`,
      [hashedPassword, user.id]
    );

    await logAudit({
      userId: user.id,
      action: AuditAction.PASSWORD_CHANGE,
      severity: AuditSeverity.INFO,
      details: { email: user.email, via: 'reset_token' },
      success: true,
    }, req);

    console.log(`✅ Password resettata per: ${user.email}`);

    res.json({
      success: true,
      message: 'Password aggiornata con successo! Ora puoi effettuare il login.'
    });
  } catch (error) {
    console.error('❌ Errore reset password:', error);
    res.status(500).json({
      success: false,
      error: 'Errore durante il reset password'
    });
  }
};

// ============================================
// AGGIORNA PROFILO (nome e cognome)
// ============================================
export const updateProfile = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { nome, cognome } = req.body;

    // Validazione
    if (!nome && !cognome) {
      return res.status(400).json({
        success: false,
        error: 'Fornisci nome o cognome da aggiornare'
      });
    }

    // Build update query
    const updates: string[] = [];
    const values: any[] = [];

    if (nome) {
      if (nome.length < 2 || nome.length > 50) {
        return res.status(400).json({
          success: false,
          error: 'Nome deve essere tra 2 e 50 caratteri'
        });
      }
      updates.push('nome = ?');
      values.push(nome.trim());
    }

    if (cognome) {
      if (cognome.length < 2 || cognome.length > 50) {
        return res.status(400).json({
          success: false,
          error: 'Cognome deve essere tra 2 e 50 caratteri'
        });
      }
      updates.push('cognome = ?');
      values.push(cognome.trim());
    }

    updates.push('aggiornato_il = NOW()');
    values.push(userId);

    await query(
      `UPDATE utenti SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    // Recupera utente aggiornato
    const users = await query(
      'SELECT id, email, nome, cognome, ruolo FROM utenti WHERE id = ?',
      [userId]
    ) as RowDataPacket[];

    console.log(`✏️ Profilo aggiornato: ${users[0].email}`);

    res.json({
      success: true,
      message: 'Profilo aggiornato con successo',
      user: users[0]
    });
  } catch (error) {
    console.error('❌ Errore aggiornamento profilo:', error);
    res.status(500).json({
      success: false,
      error: 'Errore durante l\'aggiornamento del profilo'
    });
  }
};

// ============================================
// ELIMINA ACCOUNT (GDPR - Diritto alla cancellazione)
// ============================================
export const deleteAccount = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        error: 'Password richiesta per confermare eliminazione'
      });
    }

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

    // Verifica password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Password non corretta'
      });
    }

    // Log prima della cancellazione
    await logAudit({
      userId,
      action: AuditAction.ACCOUNT_DELETED || 'ACCOUNT_DELETED',
      severity: AuditSeverity.WARNING,
      details: { email: user.email },
      success: true,
    }, req);

    // Cancella in ordine per rispettare FK constraints
    // 1. Push tokens (se la tabella esiste)
    try {
      await query('DELETE FROM push_tokens WHERE user_id = ?', [userId]);
    } catch (e: any) {
      // Ignora se la tabella non esiste
      if (!e.message?.includes("doesn't exist")) throw e;
    }

    // 2. Notification history (se la tabella esiste)
    try {
      await query('DELETE FROM notification_history WHERE user_id = ?', [userId]);
    } catch (e: any) {
      if (!e.message?.includes("doesn't exist")) throw e;
    }

    // 3. Geofence history (se la tabella esiste)
    try {
      await query('DELETE FROM geofence_history WHERE user_id = ?', [userId]);
    } catch (e: any) {
      if (!e.message?.includes("doesn't exist")) throw e;
    }

    // 4. Login attempts (se la tabella esiste)
    try {
      await query('DELETE FROM login_attempts WHERE email = ?', [user.email]);
    } catch (e: any) {
      if (!e.message?.includes("doesn't exist")) throw e;
    }

    // 5. Audit log (opzionale - potremmo volerlo mantenere)
    // await query('DELETE FROM audit_log WHERE user_id = ?', [userId]);

    // 6. Condivisioni impianti (se la tabella esiste)
    try {
      await query('DELETE FROM condivisioni_impianto WHERE utente_id = ?', [userId]);
    } catch (e: any) {
      if (!e.message?.includes("doesn't exist")) throw e;
    }

    // 7. Impianti di proprietà (cascade su scene, dispositivi, stanze, etc)
    const impianti = await query(
      'SELECT id FROM impianti WHERE utente_id = ?',
      [userId]
    ) as RowDataPacket[];

    for (const impianto of impianti) {
      // Scene actions
      await query(
        `DELETE sa FROM scene_actions sa
         INNER JOIN scene s ON sa.scena_id = s.id
         WHERE s.impianto_id = ?`,
        [impianto.id]
      );
      // Scene
      await query('DELETE FROM scene WHERE impianto_id = ?', [impianto.id]);
      // Dispositivi
      await query('DELETE FROM dispositivi WHERE stanza_id IN (SELECT id FROM stanze WHERE impianto_id = ?)', [impianto.id]);
      await query('DELETE FROM dispositivi_tasmota WHERE impianto_id = ?', [impianto.id]);
      await query('DELETE FROM omniapi_nodes WHERE impianto_id = ?', [impianto.id]);
      // Stanze
      await query('DELETE FROM stanze WHERE impianto_id = ?', [impianto.id]);
      // Geofence zones
      await query('DELETE FROM geofence_zones WHERE impianto_id = ?', [impianto.id]);
      // Gateway
      await query('UPDATE gateways SET impianto_id = NULL, stato = "pending" WHERE impianto_id = ?', [impianto.id]);
    }

    // 8. Impianti
    await query('DELETE FROM impianti WHERE utente_id = ?', [userId]);

    // 9. Utente
    await query('DELETE FROM utenti WHERE id = ?', [userId]);

    console.log(`🗑️ Account eliminato: ${user.email}`);

    res.json({
      success: true,
      message: 'Account eliminato con successo. Tutti i tuoi dati sono stati rimossi.'
    });
  } catch (error) {
    console.error('❌ Errore eliminazione account:', error);
    res.status(500).json({
      success: false,
      error: 'Errore durante l\'eliminazione dell\'account'
    });
  }
};

// ============================================
// ESPORTA DATI (GDPR - Diritto alla portabilità)
// ============================================
export const exportData = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;

    // Dati utente
    const users = await query(
      `SELECT id, email, nome, cognome, ruolo, creato_il,
              email_verified, gdpr_accepted, gdpr_accepted_at
       FROM utenti WHERE id = ?`,
      [userId]
    ) as RowDataPacket[];

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Utente non trovato'
      });
    }

    const user = users[0];

    // Impianti
    const impianti = await query(
      `SELECT id, nome, indirizzo, creato_il
       FROM impianti WHERE utente_id = ?`,
      [userId]
    ) as RowDataPacket[];

    // Condivisioni (tabella opzionale)
    let condivisioni: any[] = [];
    try {
      condivisioni = await query(
        `SELECT ci.id, ci.permesso, ci.creato_il, i.nome as impianto_nome
         FROM condivisioni_impianto ci
         JOIN impianti i ON ci.impianto_id = i.id
         WHERE ci.utente_id = ?`,
        [userId]
      ) as RowDataPacket[];
    } catch (e: any) {
      if (!e.message?.includes("doesn't exist")) throw e;
    }

    // Scene per ogni impianto
    const impiantoIds = impianti.map((i: any) => i.id);
    let scene: any[] = [];
    if (impiantoIds.length > 0) {
      scene = await query(
        `SELECT id, nome, tipo, ora_esecuzione, giorni_settimana, attiva, impianto_id
         FROM scene WHERE impianto_id IN (?)`,
        [impiantoIds]
      ) as RowDataPacket[];
    }

    // Stanze per ogni impianto
    let stanze: any[] = [];
    if (impiantoIds.length > 0) {
      stanze = await query(
        `SELECT id, nome, icona, impianto_id
         FROM stanze WHERE impianto_id IN (?)`,
        [impiantoIds]
      ) as RowDataPacket[];
    }

    // Dispositivi Tasmota
    let dispositiviTasmota: any[] = [];
    if (impiantoIds.length > 0) {
      dispositiviTasmota = await query(
        `SELECT id, nome, ip, topic, tipo, stanza_id, impianto_id
         FROM dispositivi_tasmota WHERE impianto_id IN (?)`,
        [impiantoIds]
      ) as RowDataPacket[];
    }

    // OmniaPi Nodes
    let omniapiNodes: any[] = [];
    if (impiantoIds.length > 0) {
      omniapiNodes = await query(
        `SELECT id, mac, nome, tipo, stanza_id, impianto_id
         FROM omniapi_nodes WHERE impianto_id IN (?)`,
        [impiantoIds]
      ) as RowDataPacket[];
    }

    // Geofence zones
    let geofences: any[] = [];
    if (impiantoIds.length > 0) {
      geofences = await query(
        `SELECT id, nome, lat, lng, raggio, impianto_id
         FROM geofence_zones WHERE impianto_id IN (?)`,
        [impiantoIds]
      ) as RowDataPacket[];
    }

    // Notification history (tabella opzionale)
    let notifications: any[] = [];
    try {
      notifications = await query(
        `SELECT id, titolo, messaggio, tipo, letto, creato_il
         FROM notification_history WHERE user_id = ? ORDER BY creato_il DESC LIMIT 100`,
        [userId]
      ) as RowDataPacket[];
    } catch (e: any) {
      if (!e.message?.includes("doesn't exist")) throw e;
    }

    // Costruisci export
    const exportData = {
      exportDate: new Date().toISOString(),
      exportedBy: 'OmniaPi Home Domotica',
      gdprNote: 'Esportazione dati ai sensi del GDPR Art. 20 - Diritto alla portabilità dei dati',
      user: {
        ...user,
        password: '[HIDDEN]'
      },
      impianti,
      condivisioni,
      scene,
      stanze,
      dispositivi: {
        tasmota: dispositiviTasmota,
        omniapi: omniapiNodes
      },
      geofences,
      notifications
    };

    await logAudit({
      userId,
      action: AuditAction.DATA_EXPORT || 'DATA_EXPORT',
      severity: AuditSeverity.INFO,
      details: { email: user.email },
      success: true,
    }, req);

    console.log(`📦 Dati esportati per: ${user.email}`);

    res.json({
      success: true,
      data: exportData
    });
  } catch (error) {
    console.error('❌ Errore export dati:', error);
    res.status(500).json({
      success: false,
      error: 'Errore durante l\'esportazione dei dati'
    });
  }
};
