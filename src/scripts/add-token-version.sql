-- ============================================
-- MIGRATION: Aggiunge token_version per invalidazione sessioni
-- ============================================

-- Aggiunge colonna token_version alla tabella utenti
-- Usata per invalidare tutte le sessioni quando l'utente cambia password

ALTER TABLE utenti
ADD COLUMN IF NOT EXISTS token_version INT DEFAULT 0;

-- Aggiorna tutti gli utenti esistenti con token_version = 0
UPDATE utenti SET token_version = 0 WHERE token_version IS NULL;
