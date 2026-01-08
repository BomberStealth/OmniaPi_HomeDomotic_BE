import { Router } from 'express';
import * as notificationController from '../controllers/notificationController';
import { authenticateToken } from '../middleware/auth';

// ============================================
// NOTIFICATION ROUTES
// /api/notifications
// ============================================

const router = Router();

// Tutte le routes richiedono autenticazione
router.use(authenticateToken);

// POST /api/notifications/register - Registra token FCM
router.post('/register', notificationController.registerToken);

// DELETE /api/notifications/unregister - Rimuovi token FCM
router.delete('/unregister', notificationController.unregisterToken);

// POST /api/notifications/test - Invia notifica di test
router.post('/test', notificationController.sendTestNotification);

export default router;
