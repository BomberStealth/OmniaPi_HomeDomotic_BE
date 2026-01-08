import { Router } from 'express';
import * as authController from '../controllers/authController';
import * as impiantiController from '../controllers/impiantiController';
import * as dispositiviController from '../controllers/dispositiviController';
import * as sceneController from '../controllers/sceneController';
import * as tasmotaController from '../controllers/tasmotaController';
import * as adminController from '../controllers/adminController';
import * as stanzeController from '../controllers/stanzeController';
import * as backupController from '../controllers/backupController';
import * as geofenceController from '../controllers/geofenceController';
import * as sensorController from '../controllers/sensorController';
import * as energyController from '../controllers/energyController';
import * as presenceController from '../controllers/presenceController';
import * as smartHomeController from '../controllers/smartHomeController';
import * as omniapiController from '../controllers/omniapiController';
import * as gatewayController from '../controllers/gatewayController';
import * as notificationController from '../controllers/notificationController';
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
router.post('/auth/change-password', authMiddleware, authController.changePassword);
router.post('/auth/logout', authMiddleware, authController.logout);

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
router.post('/impianti/:impiantoId/scene/auto-populate', authMiddleware, sceneController.autoPopulateDefaultScenes);
router.put('/scene/:id', authMiddleware, sceneController.updateScena);
router.delete('/scene/:id', authMiddleware, sceneController.deleteScena);
router.post('/scene/:id/execute', authMiddleware, sceneController.executeScena);
router.put('/scene/:id/shortcut', authMiddleware, sceneController.toggleShortcut);

// ============================================
// SUN TIMES ROUTES (Alba/Tramonto)
// ============================================
router.get('/impianti/:impiantoId/sun', authMiddleware, sceneController.getSunTimes);
router.get('/impianti/:impiantoId/sun/upcoming', authMiddleware, sceneController.getUpcomingSun);
router.get('/scheduling/stats', authMiddleware, sceneController.getSchedulingStats);

// ============================================
// GEOFENCING ROUTES
// ============================================
router.get('/impianti/:impiantoId/geofences', authMiddleware, geofenceController.getGeofences);
router.post('/impianti/:impiantoId/geofences', authMiddleware, geofenceController.createZone);
router.put('/geofences/:id', authMiddleware, geofenceController.updateZone);
router.delete('/geofences/:id', authMiddleware, geofenceController.deleteZone);
router.post('/location', authMiddleware, geofenceController.updateLocation);
router.get('/impianti/:impiantoId/geofences/history', authMiddleware, geofenceController.getHistory);
router.get('/impianti/:impiantoId/presence', authMiddleware, geofenceController.getPresence);

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
// Tutti i dispositivi (Tasmota + OmniaPi) - per Scene e Stanze
router.get('/impianti/:impiantoId/dispositivi/all', authMiddleware, dispositiviController.getAllDispositivi);
router.get('/impianti/:impiantoId/dispositivi', authMiddleware, tasmotaController.getDispositivi);
router.post('/impianti/:impiantoId/dispositivi/scan', authMiddleware, tasmotaController.scanTasmota);
router.post('/impianti/:impiantoId/dispositivi', authMiddleware, tasmotaController.addDispositivo);
router.delete('/dispositivi/:id', authMiddleware, tasmotaController.deleteDispositivo);
router.put('/dispositivi/:id/stanza', authMiddleware, tasmotaController.updateStanzaDispositivo);
router.post('/dispositivi/:id/control', authMiddleware, tasmotaController.controlDispositivo);
router.put('/dispositivi/:id/blocco', authMiddleware, tasmotaController.toggleBloccaDispositivo);
router.put('/dispositivi/:id/nome', authMiddleware, tasmotaController.renameDispositivo);
router.post('/dispositivi/trovami', authMiddleware, tasmotaController.trovamiDispositivo);

// ============================================
// SENSOR ROUTES (DHT22, BME280, etc.)
// ============================================
router.get('/impianti/:impiantoId/sensors', authMiddleware, sensorController.getSensors);
router.get('/impianti/:impiantoId/sensors/dashboard', authMiddleware, sensorController.getSensorDashboard);
router.get('/sensors/:id/readings', authMiddleware, sensorController.getDeviceReadings);
router.get('/sensors/:id/history', authMiddleware, sensorController.getHistory);
router.get('/sensors/:id/stats', authMiddleware, sensorController.getStats);
router.get('/sensors/:id/chart', authMiddleware, sensorController.getChartData);

// ============================================
// ENERGY MONITORING ROUTES (Shelly EM, etc.)
// ============================================
router.get('/impianti/:impiantoId/energy', authMiddleware, energyController.getImpiantoEnergy);
router.get('/impianti/:impiantoId/energy/dashboard', authMiddleware, energyController.getEnergyDashboard);
router.get('/energy/:id', authMiddleware, energyController.getDeviceEnergy);
router.get('/energy/:id/history', authMiddleware, energyController.getPowerHistoryData);
router.get('/energy/:id/chart/hourly', authMiddleware, energyController.getHourlyChart);
router.get('/energy/:id/chart/daily', authMiddleware, energyController.getDailyChart);

// ============================================
// PRESENCE DETECTION ROUTES
// ============================================
router.get('/impianti/:impiantoId/tracked-devices', authMiddleware, presenceController.getDevices);
router.post('/impianti/:impiantoId/tracked-devices', authMiddleware, presenceController.addDevice);
router.put('/tracked-devices/:id', authMiddleware, presenceController.updateDevice);
router.delete('/tracked-devices/:id', authMiddleware, presenceController.removeDevice);
router.get('/impianti/:impiantoId/presence-status', authMiddleware, presenceController.getStatus);
router.get('/impianti/:impiantoId/presence-history', authMiddleware, presenceController.getHistory);
router.post('/presence/discover', authMiddleware, presenceController.discover);

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
// SMART HOME ROUTES (Google Home / Alexa)
// ============================================
router.post('/smarthome/google/fulfillment', authMiddleware, smartHomeController.googleFulfillment);
router.post('/smarthome/alexa/discovery', authMiddleware, smartHomeController.alexaDiscovery);
router.post('/smarthome/alexa/control', authMiddleware, smartHomeController.alexaControl);
router.get('/smarthome/devices', authMiddleware, smartHomeController.getDevices);
router.post('/smarthome/test', authMiddleware, smartHomeController.testCommand);

// ============================================
// GATEWAY ROUTES (Registrazione e Gestione)
// ============================================
// Registrazione gateway (pubblico - chiamato dal gateway dopo connessione WiFi)
router.post('/gateway/register', gatewayController.registerGateway);
// Lista gateway in attesa di associazione (qualsiasi utente autenticato)
router.get('/gateway/pending', authMiddleware, gatewayController.getPendingGateways);
// Pulizia gateway orfani (solo admin)
router.post('/gateway/cleanup-orphans', authMiddleware, roleMiddleware(UserRole.ADMIN), gatewayController.cleanupOrphanGateways);
// Reset manuale gateway a pending (utente autenticato con accesso)
router.post('/gateway/reset/:mac', authMiddleware, gatewayController.resetGateway);
// Aggiorna info gateway
router.put('/gateway/:id', authMiddleware, gatewayController.updateGateway);
// Gateway dell'impianto
router.get('/impianti/:impiantoId/gateway', authMiddleware, gatewayController.getImpiantoGateway);
// Associa gateway all'impianto
router.post('/impianti/:impiantoId/gateway/associate', authMiddleware, gatewayController.associateGateway);
// Disassocia gateway dall'impianto
router.delete('/impianti/:impiantoId/gateway', authMiddleware, gatewayController.disassociateGateway);

// ============================================
// OMNIAPI GATEWAY ROUTES (ESP-NOW Nodes)
// ============================================
// Stato gateway e nodi (in-memory, real-time)
router.get('/omniapi/gateway', omniapiController.getGatewayStatus);
router.get('/omniapi/nodes', omniapiController.getNodes);
router.get('/omniapi/nodes/:mac', omniapiController.getNodeByMac);
router.post('/omniapi/command', omniapiController.sendCommand);
router.post('/omniapi/discover', omniapiController.triggerDiscovery);

// Gestione nodi registrati (DB) - richiede autenticazione
router.get('/impianti/:impiantoId/omniapi/nodes', authMiddleware, omniapiController.getRegisteredNodes);
router.get('/impianti/:impiantoId/omniapi/available', authMiddleware, omniapiController.getAvailableNodes);
router.post('/impianti/:impiantoId/omniapi/register', authMiddleware, omniapiController.registerNode);
router.delete('/omniapi/nodes/:id', authMiddleware, omniapiController.unregisterNode);
router.put('/omniapi/nodes/:id', authMiddleware, omniapiController.updateRegisteredNode);
router.post('/omniapi/nodes/:id/control', authMiddleware, omniapiController.controlRegisteredNode);

// ============================================
// ADMIN ROUTES
// ============================================
router.get('/admin/users', authMiddleware, roleMiddleware(UserRole.ADMIN), adminController.getAllUsers);
router.get('/admin/users/search', authMiddleware, roleMiddleware(UserRole.ADMIN), adminController.searchUsers);
router.get('/admin/users/:userId/permissions', authMiddleware, roleMiddleware(UserRole.ADMIN), adminController.getUserPermissions);
router.put('/admin/users/:userId/permissions', authMiddleware, roleMiddleware(UserRole.ADMIN), adminController.updateUserPermissions);
router.put('/admin/users/:userId/role', authMiddleware, roleMiddleware(UserRole.ADMIN), adminController.updateUserRole);
router.delete('/admin/users/:userId', authMiddleware, roleMiddleware(UserRole.ADMIN), adminController.deleteUser);
router.post('/admin/cleanup-scenes', authMiddleware, roleMiddleware(UserRole.ADMIN), adminController.cleanupOrphanActions);

// ============================================
// NOTIFICATIONS ROUTES (Firebase Cloud Messaging)
// ============================================
router.post('/notifications/register', authMiddleware, notificationController.registerToken);
router.delete('/notifications/unregister', authMiddleware, notificationController.unregisterToken);
router.post('/notifications/test', authMiddleware, notificationController.sendTestNotification);

export default router;
