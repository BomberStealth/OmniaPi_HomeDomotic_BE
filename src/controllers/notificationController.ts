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
    const userId = (req as any).user?.id;
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
    const userId = (req as any).user?.id;

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
