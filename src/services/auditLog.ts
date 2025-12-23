import { query } from '../config/database';
import { Request } from 'express';

// ============================================
// AUDIT LOG SERVICE
// Traccia tutte le azioni sensibili per sicurezza
// ============================================

export enum AuditAction {
  // Autenticazione
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILED = 'LOGIN_FAILED',
  LOGOUT = 'LOGOUT',
  REGISTER = 'REGISTER',
  PASSWORD_CHANGE = 'PASSWORD_CHANGE',
  PASSWORD_RESET_REQUEST = 'PASSWORD_RESET_REQUEST',
  PASSWORD_RESET_COMPLETE = 'PASSWORD_RESET_COMPLETE',
  TWO_FACTOR_ENABLED = '2FA_ENABLED',
  TWO_FACTOR_DISABLED = '2FA_DISABLED',
  TWO_FACTOR_FAILED = '2FA_FAILED',

  // Account
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  ACCOUNT_UNLOCKED = 'ACCOUNT_UNLOCKED',
  ROLE_CHANGED = 'ROLE_CHANGED',
  USER_DELETED = 'USER_DELETED',
  PERMISSIONS_CHANGED = 'PERMISSIONS_CHANGED',

  // Dispositivi
  DEVICE_ADDED = 'DEVICE_ADDED',
  DEVICE_REMOVED = 'DEVICE_REMOVED',
  DEVICE_CONTROL = 'DEVICE_CONTROL',
  DEVICE_LOCKED = 'DEVICE_LOCKED',
  DEVICE_UNLOCKED = 'DEVICE_UNLOCKED',
  DEVICE_CONTROL_BLOCKED = 'DEVICE_CONTROL_BLOCKED',

  // Scene
  SCENE_CREATED = 'SCENE_CREATED',
  SCENE_DELETED = 'SCENE_DELETED',
  SCENE_EXECUTED = 'SCENE_EXECUTED',
  SCENE_SCHEDULED = 'SCENE_SCHEDULED',

  // Impianti
  IMPIANTO_CREATED = 'IMPIANTO_CREATED',
  IMPIANTO_DELETED = 'IMPIANTO_DELETED',
  IMPIANTO_SHARED = 'IMPIANTO_SHARED',
  IMPIANTO_UNSHARED = 'IMPIANTO_UNSHARED',

  // Sicurezza
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  UNAUTHORIZED_ACCESS = 'UNAUTHORIZED_ACCESS',
  INVALID_TOKEN = 'INVALID_TOKEN',

  // Admin
  ADMIN_ACTION = 'ADMIN_ACTION',
  BACKUP_CREATED = 'BACKUP_CREATED',
  BACKUP_RESTORED = 'BACKUP_RESTORED',
}

export enum AuditSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL',
}

interface AuditLogEntry {
  userId?: number;
  action: AuditAction;
  severity: AuditSeverity;
  resourceType?: string;
  resourceId?: number | string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
}

/**
 * Estrae informazioni dalla request
 */
const extractRequestInfo = (req?: Request) => {
  if (!req) return { ipAddress: 'system', userAgent: 'system' };

  return {
    ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
    userAgent: req.get('user-agent')?.substring(0, 500) || 'unknown',
  };
};

/**
 * Logga un'azione nel database
 */
export const logAudit = async (entry: AuditLogEntry, req?: Request): Promise<void> => {
  try {
    const { ipAddress, userAgent } = extractRequestInfo(req);

    const sql = `
      INSERT INTO audit_logs
      (user_id, action, severity, resource_type, resource_id, details, ip_address, user_agent, success, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;

    await query(sql, [
      entry.userId || null,
      entry.action,
      entry.severity,
      entry.resourceType || null,
      entry.resourceId?.toString() || null,
      entry.details ? JSON.stringify(entry.details) : null,
      entry.ipAddress || ipAddress,
      entry.userAgent || userAgent,
      entry.success,
    ]);

    // Log anche su console per visibilita' immediata
    const logIcon = entry.success ? '✅' : '❌';
    const severityIcon = {
      [AuditSeverity.INFO]: 'ℹ️',
      [AuditSeverity.WARNING]: '⚠️',
      [AuditSeverity.ERROR]: '🔴',
      [AuditSeverity.CRITICAL]: '🚨',
    }[entry.severity];

    console.log(
      `${logIcon} AUDIT [${severityIcon} ${entry.severity}]: ${entry.action}`,
      entry.userId ? `User:${entry.userId}` : '',
      entry.resourceType ? `${entry.resourceType}:${entry.resourceId}` : '',
      `IP:${entry.ipAddress || ipAddress}`
    );

  } catch (error) {
    // Non bloccare l'applicazione se il logging fallisce
    console.error('❌ AUDIT LOG ERROR:', error);
  }
};

// ============================================
// HELPER FUNCTIONS per azioni comuni
// ============================================

export const auditLoginSuccess = (userId: number, email: string, req: Request) => {
  return logAudit({
    userId,
    action: AuditAction.LOGIN_SUCCESS,
    severity: AuditSeverity.INFO,
    details: { email },
    success: true,
  }, req);
};

export const auditLoginFailed = (email: string, reason: string, req: Request) => {
  return logAudit({
    action: AuditAction.LOGIN_FAILED,
    severity: AuditSeverity.WARNING,
    details: { email, reason },
    success: false,
  }, req);
};

export const auditAccountLocked = (userId: number, email: string, reason: string, req?: Request) => {
  return logAudit({
    userId,
    action: AuditAction.ACCOUNT_LOCKED,
    severity: AuditSeverity.WARNING,
    details: { email, reason },
    success: true,
  }, req);
};

export const auditDeviceControl = (
  userId: number,
  deviceId: number,
  deviceName: string,
  command: string,
  success: boolean,
  blocked: boolean,
  req: Request
) => {
  return logAudit({
    userId,
    action: blocked ? AuditAction.DEVICE_CONTROL_BLOCKED : AuditAction.DEVICE_CONTROL,
    severity: blocked ? AuditSeverity.WARNING : AuditSeverity.INFO,
    resourceType: 'device',
    resourceId: deviceId,
    details: { deviceName, command, blocked },
    success,
  }, req);
};

export const auditSceneExecution = (
  userId: number,
  sceneId: number,
  sceneName: string,
  actionsExecuted: number,
  actionsBlocked: number,
  req: Request
) => {
  return logAudit({
    userId,
    action: AuditAction.SCENE_EXECUTED,
    severity: AuditSeverity.INFO,
    resourceType: 'scene',
    resourceId: sceneId,
    details: { sceneName, actionsExecuted, actionsBlocked },
    success: true,
  }, req);
};

export const auditSuspiciousActivity = (
  userId: number | undefined,
  description: string,
  details: Record<string, any>,
  req: Request
) => {
  return logAudit({
    userId,
    action: AuditAction.SUSPICIOUS_ACTIVITY,
    severity: AuditSeverity.CRITICAL,
    details: { description, ...details },
    success: false,
  }, req);
};

export const auditRateLimitExceeded = (endpoint: string, req: Request) => {
  return logAudit({
    userId: (req as any).user?.userId,
    action: AuditAction.RATE_LIMIT_EXCEEDED,
    severity: AuditSeverity.WARNING,
    details: { endpoint },
    success: false,
  }, req);
};

export const auditUnauthorizedAccess = (
  userId: number | undefined,
  resource: string,
  action: string,
  req: Request
) => {
  return logAudit({
    userId,
    action: AuditAction.UNAUTHORIZED_ACCESS,
    severity: AuditSeverity.ERROR,
    details: { resource, attemptedAction: action },
    success: false,
  }, req);
};

// ============================================
// QUERY AUDIT LOGS
// ============================================

export const getAuditLogs = async (filters: {
  userId?: number;
  action?: AuditAction;
  severity?: AuditSeverity;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}) => {
  let sql = 'SELECT * FROM audit_logs WHERE 1=1';
  const params: any[] = [];

  if (filters.userId) {
    sql += ' AND user_id = ?';
    params.push(filters.userId);
  }

  if (filters.action) {
    sql += ' AND action = ?';
    params.push(filters.action);
  }

  if (filters.severity) {
    sql += ' AND severity = ?';
    params.push(filters.severity);
  }

  if (filters.startDate) {
    sql += ' AND created_at >= ?';
    params.push(filters.startDate);
  }

  if (filters.endDate) {
    sql += ' AND created_at <= ?';
    params.push(filters.endDate);
  }

  sql += ' ORDER BY created_at DESC';

  if (filters.limit) {
    sql += ' LIMIT ?';
    params.push(filters.limit);
  }

  if (filters.offset) {
    sql += ' OFFSET ?';
    params.push(filters.offset);
  }

  return query(sql, params);
};

// ============================================
// CLEANUP OLD LOGS (per manutenzione)
// ============================================

export const cleanupOldLogs = async (daysToKeep: number = 90) => {
  const sql = `DELETE FROM audit_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)`;
  const result: any = await query(sql, [daysToKeep]);
  console.log(`🧹 AUDIT: Cleaned up ${result.affectedRows} old log entries`);
  return result.affectedRows;
};
