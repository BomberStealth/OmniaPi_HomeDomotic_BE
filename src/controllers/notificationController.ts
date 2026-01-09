import { Request, Response } from 'express';
import * as notificationService from '../services/notificationService';

// ============================================
// NOTIFICATION CONTROLLER
// API endpoints per gestione notifiche push
// ============================================

/**
 * Registra un token FCM per l'utente corrente
 * POST /api/notifications/register
 */
export async function registerToken(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.userId;
    const { token, deviceInfo } = req.body;

    if (!userId) {
      res.status(401).json({ error: 'Non autenticato' });
      return;
    }

    if (!token) {
      res.status(400).json({ error: 'Token mancante' });
      return;
    }

    const success = await notificationService.registerToken(userId, token, deviceInfo);

    if (success) {
      res.json({ message: 'Token registrato con successo' });
    } else {
      res.status(500).json({ error: 'Errore durante la registrazione del token' });
    }
  } catch (error) {
    console.error('Error in registerToken:', error);
    res.status(500).json({ error: 'Errore interno del server' });
  }
}

/**
 * Rimuove un token FCM
 * DELETE /api/notifications/unregister
 */
export async function unregisterToken(req: Request, res: Response): Promise<void> {
  try {
    const { token } = req.body;

    if (!token) {
      res.status(400).json({ error: 'Token mancante' });
      return;
    }

    const success = await notificationService.unregisterToken(token);

    if (success) {
      res.json({ message: 'Token rimosso con successo' });
    } else {
      res.status(500).json({ error: 'Errore durante la rimozione del token' });
    }
  } catch (error) {
    console.error('Error in unregisterToken:', error);
    res.status(500).json({ error: 'Errore interno del server' });
  }
}

/**
 * Invia una notifica di test all'utente corrente
 * POST /api/notifications/test
 */
export async function sendTestNotification(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      res.status(401).json({ error: 'Non autenticato' });
      return;
    }

    const count = await notificationService.sendToUser(userId, {
      title: '🏠 OmniaPi Test',
      body: 'Le notifiche funzionano correttamente!',
      data: { type: 'test' }
    });

    if (count > 0) {
      res.json({ message: `Notifica inviata a ${count} dispositivo/i` });
    } else {
      res.status(404).json({ error: 'Nessun dispositivo registrato per le notifiche' });
    }
  } catch (error) {
    console.error('Error in sendTestNotification:', error);
    res.status(500).json({ error: 'Errore interno del server' });
  }
}

/**
 * Recupera storico notifiche
 * GET /api/notifications/history
 */
export async function getHistory(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.userId;
    const impiantoId = parseInt(req.query.impiantoId as string);
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    if (!userId) {
      res.status(401).json({ error: 'Non autenticato' });
      return;
    }

    if (!impiantoId) {
      res.status(400).json({ error: 'impiantoId richiesto' });
      return;
    }

    const history = await notificationService.getHistory(impiantoId, limit, offset);
    const unreadCount = await notificationService.getUnreadCount(impiantoId, userId);

    res.json({ notifications: history, unreadCount });
  } catch (error) {
    console.error('Error in getHistory:', error);
    res.status(500).json({ error: 'Errore interno del server' });
  }
}

/**
 * Segna notifica come letta
 * POST /api/notifications/:id/read
 */
export async function markAsRead(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.userId;
    const notificationId = parseInt(req.params.id);

    if (!userId) {
      res.status(401).json({ error: 'Non autenticato' });
      return;
    }

    const success = await notificationService.markAsRead(notificationId, userId);
    res.json({ success });
  } catch (error) {
    console.error('Error in markAsRead:', error);
    res.status(500).json({ error: 'Errore interno del server' });
  }
}

/**
 * Segna tutte le notifiche come lette
 * POST /api/notifications/read-all
 */
export async function markAllAsRead(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.userId;
    const { impiantoId } = req.body;

    if (!userId) {
      res.status(401).json({ error: 'Non autenticato' });
      return;
    }

    if (!impiantoId) {
      res.status(400).json({ error: 'impiantoId richiesto' });
      return;
    }

    const success = await notificationService.markAllAsRead(impiantoId, userId);
    res.json({ success });
  } catch (error) {
    console.error('Error in markAllAsRead:', error);
    res.status(500).json({ error: 'Errore interno del server' });
  }
}
