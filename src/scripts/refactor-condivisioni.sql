-- ============================================
-- REFACTOR SISTEMA INVITI E RUOLI
-- Migrazione da ruolo_condivisione a accesso_completo
-- ============================================

-- Step 1: Aggiungi colonna accesso_completo
ALTER TABLE condivisioni_impianto
ADD COLUMN accesso_completo BOOLEAN DEFAULT FALSE;

-- Step 2: Migra i dati esistenti
-- - installatore → accesso_completo = TRUE
-- - proprietario → accesso_completo = TRUE
-- - ospite → accesso_completo = FALSE
UPDATE condivisioni_impianto
SET accesso_completo = CASE
  WHEN ruolo_condivisione IN ('installatore', 'proprietario') THEN TRUE
  ELSE FALSE
END;

-- Step 3: Rimuovi la colonna ruolo_condivisione
ALTER TABLE condivisioni_impianto
DROP COLUMN ruolo_condivisione;

-- Verifica
SELECT
  id,
  impianto_id,
  email_invitato,
  accesso_completo,
  stato
FROM condivisioni_impianto
LIMIT 10;
