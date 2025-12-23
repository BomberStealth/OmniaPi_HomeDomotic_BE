-- ============================================
-- OMNIAPI SECURITY TABLES MIGRATION
-- Run this script to add security features
-- ============================================

-- Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  action VARCHAR(50) NOT NULL,
  severity ENUM('INFO', 'WARNING', 'ERROR', 'CRITICAL') DEFAULT 'INFO',
  resource_type VARCHAR(50) NULL,
  resource_id VARCHAR(50) NULL,
  details JSON NULL,
  ip_address VARCHAR(45) NOT NULL,
  user_agent VARCHAR(500) NULL,
  success BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_audit_user (user_id),
  INDEX idx_audit_action (action),
  INDEX idx_audit_severity (severity),
  INDEX idx_audit_created (created_at),
  INDEX idx_audit_ip (ip_address),

  FOREIGN KEY (user_id) REFERENCES utenti(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Login Attempts Table (for account lockout)
CREATE TABLE IF NOT EXISTS login_attempts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  ip_address VARCHAR(45) NOT NULL,
  success BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_attempts_email (email),
  INDEX idx_attempts_ip (ip_address),
  INDEX idx_attempts_created (created_at),
  INDEX idx_attempts_email_success (email, success)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add locked_until column to utenti if not exists
ALTER TABLE utenti
ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP NULL DEFAULT NULL,
ADD INDEX IF NOT EXISTS idx_utenti_locked (locked_until);

-- 2FA columns for utenti (for future TOTP implementation)
ALTER TABLE utenti
ADD COLUMN IF NOT EXISTS two_factor_secret VARCHAR(100) NULL,
ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS two_factor_backup_codes JSON NULL;

-- Sessions table (for session management)
CREATE TABLE IF NOT EXISTS user_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash VARCHAR(64) NOT NULL,
  device_info VARCHAR(500) NULL,
  ip_address VARCHAR(45) NOT NULL,
  last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,

  INDEX idx_sessions_user (user_id),
  INDEX idx_sessions_token (token_hash),
  INDEX idx_sessions_expires (expires_at),
  INDEX idx_sessions_active (is_active),

  FOREIGN KEY (user_id) REFERENCES utenti(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Password reset tokens table
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash VARCHAR(64) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_reset_user (user_id),
  INDEX idx_reset_token (token_hash),
  INDEX idx_reset_expires (expires_at),

  FOREIGN KEY (user_id) REFERENCES utenti(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- IP Blacklist table (for blocking malicious IPs)
CREATE TABLE IF NOT EXISTS ip_blacklist (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ip_address VARCHAR(45) NOT NULL UNIQUE,
  reason VARCHAR(255) NULL,
  blocked_by INT NULL,
  blocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL,

  INDEX idx_blacklist_ip (ip_address),
  INDEX idx_blacklist_expires (expires_at),

  FOREIGN KEY (blocked_by) REFERENCES utenti(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Security events table (for real-time monitoring)
CREATE TABLE IF NOT EXISTS security_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL,
  severity ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') DEFAULT 'LOW',
  description TEXT NULL,
  source_ip VARCHAR(45) NULL,
  user_id INT NULL,
  metadata JSON NULL,
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_by INT NULL,
  acknowledged_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_events_type (event_type),
  INDEX idx_events_severity (severity),
  INDEX idx_events_created (created_at),
  INDEX idx_events_ack (acknowledged),

  FOREIGN KEY (user_id) REFERENCES utenti(id) ON DELETE SET NULL,
  FOREIGN KEY (acknowledged_by) REFERENCES utenti(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- CLEANUP PROCEDURES (for maintenance)
-- ============================================

-- Procedure to cleanup old audit logs
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS cleanup_old_audit_logs(IN days_to_keep INT)
BEGIN
  DELETE FROM audit_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL days_to_keep DAY);
END //
DELIMITER ;

-- Procedure to cleanup old login attempts
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS cleanup_old_login_attempts(IN days_to_keep INT)
BEGIN
  DELETE FROM login_attempts WHERE created_at < DATE_SUB(NOW(), INTERVAL days_to_keep DAY);
END //
DELIMITER ;

-- Procedure to auto-unlock expired accounts
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS auto_unlock_expired_accounts()
BEGIN
  UPDATE utenti SET locked_until = NULL WHERE locked_until IS NOT NULL AND locked_until <= NOW();
END //
DELIMITER ;

-- Event to auto-cleanup (if event scheduler is enabled)
-- DELIMITER //
-- CREATE EVENT IF NOT EXISTS cleanup_security_data
-- ON SCHEDULE EVERY 1 DAY
-- DO
-- BEGIN
--   CALL cleanup_old_audit_logs(90);
--   CALL cleanup_old_login_attempts(7);
--   CALL auto_unlock_expired_accounts();
-- END //
-- DELIMITER ;

SELECT 'Security tables created successfully!' AS status;
