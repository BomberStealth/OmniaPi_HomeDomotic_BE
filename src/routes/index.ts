import { Router } from 'express';
import * as authController from '../controllers/authController';
import * as impiantiController from '../controllers/impiantiController';
import * as dispositiviController from '../controllers/dispositiviController';
import * as sceneController from '../controllers/sceneController';
import * as tasmotaController from '../controllers/tasmotaController';
import * as adminController from '../controllers/adminController';
import * as stanzeController from '../controllers/stanzeController';
import * as backupController from '../controllers/backupController';
import { authMiddleware, roleMiddleware } from '../middleware/auth';
import { loginLimiter, registerLimiter } from '../middleware/rateLimiters';
import { validate, loginSchema, registerSchema } from '../middleware/validation';
import { UserRole } from '../types';

// ============================================
// ROUTES PRINCIPALI
// ============================================

const router = Router();

// ============================================
// AUTH ROUTES (con sicurezza avanzata)
// ============================================
router.post('/auth/login', loginLimiter, validate(loginSchema), authController.login);
// Registrazione pubblica (auto-registrazione clienti) - protetta da rate limiting
router.post('/auth/register', registerLimiter, validate(registerSchema), authController.register);
router.get('/auth/profile', authMiddleware, authController.getProfile);

// Health check per auth
router.get('/auth/health', (req, res) => {
  res.json({ status: 'ok', service: 'auth' });
});

// ============================================
// IMPIANTI ROUTES
// ============================================
router.get('/impianti', authMiddleware, impiantiController.getImpianti);
router.get('/impianti/:id', authMiddleware, impiantiController.getImpianto);
// Tutti gli utenti autenticati possono creare i propri impianti
router.post('/impianti', authMiddleware, impiantiController.createImpianto);
// Connetti ad impianto esistente tramite codice condivisione
router.post('/impianti/connetti', authMiddleware, impiantiController.connectImpianto);
router.put('/impianti/:id', authMiddleware, impiantiController.updateImpianto);
router.delete('/impianti/:id', authMiddleware, impiantiController.deleteImpianto);
// Gestione codice condivisione e condivisioni
router.post('/impianti/:id/regenerate-code', authMiddleware, impiantiController.regenerateCode);
router.get('/impianti/:id/condivisioni', authMiddleware, impiantiController.getCondivisioni);
router.delete('/condivisioni/:id', authMiddleware, impiantiController.revokeCondivisione);

// ============================================
// SCENE ROUTES
// ============================================
router.get('/impianti/:impiantoId/scene', authMiddleware, sceneController.getScene);
router.post('/impianti/:impiantoId/scene', authMiddleware, sceneController.createScena);
router.put('/scene/:id', authMiddleware, sceneController.updateScena);
router.delete('/scene/:id', authMiddleware, sceneController.deleteScena);
router.post('/scene/:id/execute', authMiddleware, sceneController.executeScena);

// ============================================
// STANZE ROUTES
// ============================================
router.get('/impianti/:impiantoId/stanze', authMiddleware, stanzeController.getStanze);
router.post('/impianti/:impiantoId/stanze', authMiddleware, stanzeController.createStanza);
router.put('/stanze/:id', authMiddleware, stanzeController.updateStanza);
router.delete('/stanze/:id', authMiddleware, stanzeController.deleteStanza);

// ============================================
// DISPOSITIVI TASMOTA ROUTES
// ============================================
router.get('/impianti/:impiantoId/dispositivi', authMiddleware, tasmotaController.getDispositivi);
router.post('/impianti/:impiantoId/dispositivi/scan', authMiddleware, tasmotaController.scanTasmota);
router.post('/impianti/:impiantoId/dispositivi', authMiddleware, tasmotaController.addDispositivo);
router.delete('/dispositivi/:id', authMiddleware, tasmotaController.deleteDispositivo);
router.put('/dispositivi/:id/stanza', authMiddleware, tasmotaController.updateStanzaDispositivo);
router.post('/dispositivi/:id/control', authMiddleware, tasmotaController.controlDispositivo);
router.put('/dispositivi/:id/blocco', authMiddleware, tasmotaController.toggleBloccaDispositivo);

// ============================================
// DISPOSITIVI ROUTES (vecchio sistema)
// ============================================
router.get('/dispositivi/stanza/:stanzaId', authMiddleware, dispositiviController.getDispositivi);
router.post('/dispositivi', authMiddleware, roleMiddleware(UserRole.INSTALLATORE, UserRole.ADMIN), dispositiviController.createDispositivo);

// ============================================
// BACKUP/RESTORE ROUTES
// ============================================
router.get('/impianti/:impiantoId/backup', authMiddleware, backupController.exportBackup);
router.post('/impianti/:impiantoId/restore', authMiddleware, backupController.importBackup);

// ============================================
// ADMIN ROUTES
// ============================================
router.get('/admin/users', authMiddleware, roleMiddleware(UserRole.ADMIN), adminController.getAllUsers);
router.get('/admin/users/search', authMiddleware, roleMiddleware(UserRole.ADMIN), adminController.searchUsers);
router.get('/admin/users/:userId/permissions', authMiddleware, roleMiddleware(UserRole.ADMIN), adminController.getUserPermissions);
router.put('/admin/users/:userId/permissions', authMiddleware, roleMiddleware(UserRole.ADMIN), adminController.updateUserPermissions);
router.put('/admin/users/:userId/role', authMiddleware, roleMiddleware(UserRole.ADMIN), adminController.updateUserRole);
router.delete('/admin/users/:userId', authMiddleware, roleMiddleware(UserRole.ADMIN), adminController.deleteUser);

export default router;
