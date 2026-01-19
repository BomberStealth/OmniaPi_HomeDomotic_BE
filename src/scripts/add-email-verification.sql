-- ============================================
-- MIGRATION: Email Verification + Password Reset
-- Data: 19 Gennaio 2026
-- ============================================

-- Aggiungi colonne per verifica email
ALTER TABLE utenti
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255) NULL,
ADD COLUMN IF NOT EXISTS verification_token_expires TIMESTAMP NULL;

-- Aggiungi colonne per reset password (se non esistono già)
ALTER TABLE utenti
ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255) NULL,
ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP NULL;

-- Aggiungi colonne GDPR
ALTER TABLE utenti
ADD COLUMN IF NOT EXISTS gdpr_accepted BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS gdpr_accepted_at TIMESTAMP NULL,
ADD COLUMN IF NOT EXISTS age_confirmed BOOLEAN DEFAULT FALSE;

-- Indici per performance
CREATE INDEX IF NOT EXISTS idx_verification_token ON utenti(verification_token);
CREATE INDEX IF NOT EXISTS idx_reset_token ON utenti(reset_token);
CREATE INDEX IF NOT EXISTS idx_email_verified ON utenti(email_verified);

-- Aggiorna utenti esistenti come verificati (grandfathering)
UPDATE utenti SET email_verified = TRUE WHERE email_verified IS NULL OR email_verified = FALSE;

-- Query di verifica (opzionale, per debug)
-- SELECT id, email, email_verified, verification_token, reset_token FROM utenti;
