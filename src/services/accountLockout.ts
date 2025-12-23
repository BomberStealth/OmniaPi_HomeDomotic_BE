import { query } from '../config/database';
import { accountLockoutConfig } from '../config/security';
import { auditAccountLocked, AuditAction, AuditSeverity, logAudit } from './auditLog';
import { Request } from 'express';

// ============================================
// ACCOUNT LOCKOUT SERVICE
// Protegge contro attacchi brute force
// ============================================

interface LoginAttempt {
  email: string;
  ipAddress: string;
  success: boolean;
  timestamp: Date;
}

interface LockoutStatus {
  isLocked: boolean;
  remainingAttempts: number;
  lockoutUntil?: Date;
  failedAttempts: number;
}

/**
 * Registra un tentativo di login
 */
export const recordLoginAttempt = async (
  email: string,
  ipAddress: string,
  success: boolean
): Promise<void> => {
  try {
    await query(
      `INSERT INTO login_attempts (email, ip_address, success, created_at)
       VALUES (?, ?, ?, NOW())`,
      [email.toLowerCase(), ipAddress, success]
    );

    // Se login fallito, controlla se bloccare l'account
    if (!success) {
      const status = await checkLockoutStatus(email);
      if (status.failedAttempts >= accountLockoutConfig.maxFailedAttempts) {
        await lockAccount(email, ipAddress);
      }
    } else {
      // Login riuscito: resetta i tentativi falliti
      await resetFailedAttempts(email);
    }
  } catch (error) {
    console.error('Error recording login attempt:', error);
  }
};

/**
 * Controlla lo stato di blocco di un account
 */
export const checkLockoutStatus = async (email: string): Promise<LockoutStatus> => {
  try {
    // Controlla se l'account e' bloccato
    const [lockResult]: any = await query(
      `SELECT locked_until FROM utenti WHERE email = ? AND locked_until > NOW()`,
      [email.toLowerCase()]
    );

    if (lockResult && lockResult.locked_until) {
      return {
        isLocked: true,
        remainingAttempts: 0,
        lockoutUntil: new Date(lockResult.locked_until),
        failedAttempts: accountLockoutConfig.maxFailedAttempts,
      };
    }

    // Conta i tentativi falliti recenti
    const windowStart = new Date(
      Date.now() - accountLockoutConfig.resetAttemptsAfterMinutes * 60 * 1000
    );

    const [countResult]: any = await query(
      `SELECT COUNT(*) as failed_count FROM login_attempts
       WHERE email = ? AND success = FALSE AND created_at > ?`,
      [email.toLowerCase(), windowStart]
    );

    const failedAttempts = countResult?.failed_count || 0;
    const remainingAttempts = Math.max(0, accountLockoutConfig.maxFailedAttempts - failedAttempts);

    return {
      isLocked: false,
      remainingAttempts,
      failedAttempts,
    };
  } catch (error) {
    console.error('Error checking lockout status:', error);
    // In caso di errore, permetti il login per non bloccare utenti legittimi
    return {
      isLocked: false,
      remainingAttempts: accountLockoutConfig.maxFailedAttempts,
      failedAttempts: 0,
    };
  }
};

/**
 * Blocca un account
 */
export const lockAccount = async (email: string, ipAddress: string): Promise<void> => {
  try {
    const lockUntil = new Date(
      Date.now() + accountLockoutConfig.lockoutDurationMinutes * 60 * 1000
    );

    await query(
      `UPDATE utenti SET locked_until = ? WHERE email = ?`,
      [lockUntil, email.toLowerCase()]
    );

    // Ottieni userId per audit
    const [user]: any = await query(
      'SELECT id FROM utenti WHERE email = ?',
      [email.toLowerCase()]
    );

    if (user) {
      await auditAccountLocked(
        user.id,
        email,
        `Account locked after ${accountLockoutConfig.maxFailedAttempts} failed attempts`
      );
    }

    console.warn(`🔒 LOCKOUT: Account ${email} locked until ${lockUntil.toISOString()} from IP ${ipAddress}`);
  } catch (error) {
    console.error('Error locking account:', error);
  }
};

/**
 * Sblocca un account (manuale o automatico)
 */
export const unlockAccount = async (email: string, adminId?: number): Promise<boolean> => {
  try {
    await query(
      `UPDATE utenti SET locked_until = NULL WHERE email = ?`,
      [email.toLowerCase()]
    );

    // Reset anche i tentativi falliti
    await resetFailedAttempts(email);

    // Log audit
    const [user]: any = await query(
      'SELECT id FROM utenti WHERE email = ?',
      [email.toLowerCase()]
    );

    if (user) {
      await logAudit({
        userId: user.id,
        action: AuditAction.ACCOUNT_UNLOCKED,
        severity: AuditSeverity.INFO,
        details: { email, unlockedBy: adminId || 'system' },
        success: true,
      });
    }

    console.log(`🔓 LOCKOUT: Account ${email} unlocked${adminId ? ` by admin ${adminId}` : ' automatically'}`);
    return true;
  } catch (error) {
    console.error('Error unlocking account:', error);
    return false;
  }
};

/**
 * Resetta i tentativi falliti
 */
export const resetFailedAttempts = async (email: string): Promise<void> => {
  try {
    await query(
      `DELETE FROM login_attempts WHERE email = ? AND success = FALSE`,
      [email.toLowerCase()]
    );
  } catch (error) {
    console.error('Error resetting failed attempts:', error);
  }
};

/**
 * Pulisce i vecchi tentativi di login (manutenzione)
 */
export const cleanupOldAttempts = async (daysToKeep: number = 7): Promise<number> => {
  try {
    const result: any = await query(
      `DELETE FROM login_attempts WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [daysToKeep]
    );
    console.log(`🧹 LOCKOUT: Cleaned up ${result.affectedRows} old login attempts`);
    return result.affectedRows;
  } catch (error) {
    console.error('Error cleaning up old attempts:', error);
    return 0;
  }
};

/**
 * Sblocca automaticamente account scaduti (chiamare periodicamente)
 */
export const autoUnlockExpiredAccounts = async (): Promise<number> => {
  try {
    const result: any = await query(
      `UPDATE utenti SET locked_until = NULL
       WHERE locked_until IS NOT NULL AND locked_until <= NOW()`
    );

    if (result.affectedRows > 0) {
      console.log(`🔓 LOCKOUT: Auto-unlocked ${result.affectedRows} expired accounts`);
    }

    return result.affectedRows;
  } catch (error) {
    console.error('Error auto-unlocking accounts:', error);
    return 0;
  }
};

/**
 * Middleware per verificare lockout prima del login
 */
export const checkLockoutMiddleware = async (
  email: string,
  req: Request
): Promise<{ allowed: boolean; message?: string; lockoutUntil?: Date }> => {
  const status = await checkLockoutStatus(email);

  if (status.isLocked) {
    const remainingMinutes = status.lockoutUntil
      ? Math.ceil((status.lockoutUntil.getTime() - Date.now()) / 60000)
      : accountLockoutConfig.lockoutDurationMinutes;

    return {
      allowed: false,
      message: `Account temporaneamente bloccato. Riprova tra ${remainingMinutes} minuti.`,
      lockoutUntil: status.lockoutUntil,
    };
  }

  return { allowed: true };
};

/**
 * Ottiene statistiche sui tentativi di login (per admin)
 */
export const getLoginStats = async (hours: number = 24): Promise<{
  totalAttempts: number;
  failedAttempts: number;
  successfulAttempts: number;
  uniqueIPs: number;
  lockedAccounts: number;
}> => {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const [stats]: any = await query(
    `SELECT
       COUNT(*) as total,
       SUM(CASE WHEN success = FALSE THEN 1 ELSE 0 END) as failed,
       SUM(CASE WHEN success = TRUE THEN 1 ELSE 0 END) as successful,
       COUNT(DISTINCT ip_address) as unique_ips
     FROM login_attempts
     WHERE created_at > ?`,
    [since]
  );

  const [locked]: any = await query(
    `SELECT COUNT(*) as count FROM utenti WHERE locked_until > NOW()`
  );

  return {
    totalAttempts: stats?.total || 0,
    failedAttempts: stats?.failed || 0,
    successfulAttempts: stats?.successful || 0,
    uniqueIPs: stats?.unique_ips || 0,
    lockedAccounts: locked?.count || 0,
  };
};
