import { Response, NextFunction } from 'express';
import { query } from '../config/database';
import { AuthRequest } from './auth';
import { RowDataPacket } from 'mysql2';

// ============================================
// MIDDLEWARE ACCESSO IMPIANTO
// Centralizza la verifica accesso impianto
// per eliminare duplicazione nei controller
// ============================================

export interface ImpiantoAccessRequest extends AuthRequest {
  impianto?: RowDataPacket;
}

/**
 * Middleware che verifica l'accesso dell'utente a un impianto
 * L'impianto viene passato tramite req.params.impiantoId
 * Se l'accesso è consentito, req.impianto contiene i dati dell'impianto
 */
export const requireImpiantoAccess = async (
  req: ImpiantoAccessRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const impiantoId = req.params.impiantoId || req.params.id;
    const userId = req.user?.userId;

    if (!impiantoId) {
      return res.status(400).json({
        success: false,
        error: 'ID impianto richiesto'
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Autenticazione richiesta'
      });
    }

    // Query unificata: verifica proprietà O condivisione accettata
    const impianti = await query(
      `SELECT i.* FROM impianti i
       LEFT JOIN condivisioni_impianto c ON i.id = c.impianto_id AND c.stato = 'accettato'
       WHERE i.id = ? AND (i.utente_id = ? OR c.utente_id = ?)
       LIMIT 1`,
      [impiantoId, userId, userId]
    ) as RowDataPacket[];

    if (impianti.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Impianto non trovato o accesso negato'
      });
    }

    // Aggiungi impianto alla request per uso nei controller
    req.impianto = impianti[0];
    next();
  } catch (error) {
    console.error('Errore verifica accesso impianto:', error);
    res.status(500).json({
      success: false,
      error: 'Errore durante la verifica dei permessi'
    });
  }
};

/**
 * Middleware che verifica che l'utente sia il PROPRIETARIO dell'impianto
 * (non basta condivisione)
 */
export const requireImpiantoOwner = async (
  req: ImpiantoAccessRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const impiantoId = req.params.impiantoId || req.params.id;
    const userId = req.user?.userId;

    if (!impiantoId || !userId) {
      return res.status(400).json({
        success: false,
        error: 'Parametri mancanti'
      });
    }

    const impianti = await query(
      'SELECT * FROM impianti WHERE id = ? AND utente_id = ?',
      [impiantoId, userId]
    ) as RowDataPacket[];

    if (impianti.length === 0) {
      return res.status(403).json({
        success: false,
        error: 'Solo il proprietario può eseguire questa azione'
      });
    }

    req.impianto = impianti[0];
    next();
  } catch (error) {
    console.error('Errore verifica proprietario impianto:', error);
    res.status(500).json({
      success: false,
      error: 'Errore durante la verifica dei permessi'
    });
  }
};

/**
 * Middleware che verifica che l'utente abbia il permesso di controllare i dispositivi
 * Se proprietario/admin/installatore originale → sempre OK
 * Se condiviso → controlla puo_controllare_dispositivi
 */
export const requireDeviceControl = async (
  req: ImpiantoAccessRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const impiantoId = req.params.impiantoId || req.params.id || req.body.impiantoId;
    const userId = req.user?.userId;
    const ruolo = req.user?.ruolo;

    if (!impiantoId) {
      return res.status(400).json({
        success: false,
        error: 'ID impianto richiesto'
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Autenticazione richiesta'
      });
    }

    // Admin ha sempre accesso
    if (ruolo === 'admin') {
      return next();
    }

    // Verifica se è proprietario
    const impianti = await query(
      'SELECT * FROM impianti WHERE id = ? AND utente_id = ?',
      [impiantoId, userId]
    ) as RowDataPacket[];

    if (impianti.length > 0) {
      // Proprietario ha sempre controllo
      req.impianto = impianti[0];
      return next();
    }

    // Verifica se è installatore originale
    const impiantoInstallatore = await query(
      'SELECT * FROM impianti WHERE id = ? AND installatore_id = ?',
      [impiantoId, userId]
    ) as RowDataPacket[];

    if (impiantoInstallatore.length > 0) {
      // Installatore originale ha sempre controllo
      req.impianto = impiantoInstallatore[0];
      return next();
    }

    // Verifica condivisione
    const condivisioni = await query(
      `SELECT c.*, i.* FROM condivisioni_impianto c
       JOIN impianti i ON c.impianto_id = i.id
       WHERE c.impianto_id = ? AND c.utente_id = ? AND c.stato = 'accettato'
       LIMIT 1`,
      [impiantoId, userId]
    ) as RowDataPacket[];

    if (condivisioni.length === 0) {
      return res.status(403).json({
        success: false,
        error: 'Accesso negato'
      });
    }

    const condivisione = condivisioni[0];

    // Verifica permesso controllo dispositivi
    if (!condivisione.puo_controllare_dispositivi) {
      return res.status(403).json({
        success: false,
        error: 'Non hai i permessi per controllare i dispositivi',
        code: 'NO_DEVICE_CONTROL'
      });
    }

    req.impianto = condivisione;
    next();
  } catch (error) {
    console.error('Errore verifica permesso controllo:', error);
    res.status(500).json({
      success: false,
      error: 'Errore durante la verifica dei permessi'
    });
  }
};
