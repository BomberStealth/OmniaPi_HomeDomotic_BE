import { Router } from 'express';
import * as authController from '../controllers/authController';
import * as impiantiController from '../controllers/impiantiController';
import * as dispositiviController from '../controllers/dispositiviController';
import { authMiddleware, roleMiddleware } from '../middleware/auth';
import { UserRole } from '../types';

// ============================================
// ROUTES PRINCIPALI
// ============================================

const router = Router();

// ============================================
// AUTH ROUTES
// ============================================
router.post('/auth/login', authController.login);
router.post('/auth/register', authMiddleware, roleMiddleware(UserRole.ADMIN), authController.register);
router.get('/auth/profile', authMiddleware, authController.getProfile);

// ============================================
// IMPIANTI ROUTES
// ============================================
router.get('/impianti', authMiddleware, impiantiController.getImpianti);
router.get('/impianti/:id', authMiddleware, impiantiController.getImpianto);
router.post('/impianti', authMiddleware, roleMiddleware(UserRole.INSTALLATORE, UserRole.ADMIN), impiantiController.createImpianto);
router.put('/impianti/:id', authMiddleware, roleMiddleware(UserRole.INSTALLATORE, UserRole.ADMIN), impiantiController.updateImpianto);
router.delete('/impianti/:id', authMiddleware, roleMiddleware(UserRole.INSTALLATORE, UserRole.ADMIN), impiantiController.deleteImpianto);

// ============================================
// DISPOSITIVI ROUTES
// ============================================
router.get('/dispositivi/stanza/:stanzaId', authMiddleware, dispositiviController.getDispositivi);
router.post('/dispositivi', authMiddleware, roleMiddleware(UserRole.INSTALLATORE, UserRole.ADMIN), dispositiviController.createDispositivo);
router.post('/dispositivi/:id/control', authMiddleware, dispositiviController.controlDispositivo);
router.delete('/dispositivi/:id', authMiddleware, roleMiddleware(UserRole.INSTALLATORE, UserRole.ADMIN), dispositiviController.deleteDispositivo);

export default router;
