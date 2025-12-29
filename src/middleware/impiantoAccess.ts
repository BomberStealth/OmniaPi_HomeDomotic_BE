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

    // Query unificata: verifica proprietà O condivisione
    const impianti = await query(
      `SELECT i.* FROM impianti i
       LEFT JOIN impianti_condivisi ic ON i.id = ic.impianto_id
       WHERE i.id = ? AND (i.utente_id = ? OR ic.utente_id = ?)
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
