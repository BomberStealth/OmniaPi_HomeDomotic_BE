import { Router, raw } from 'express';
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
import * as ledController from '../controllers/ledController';
import * as sessionsController from '../controllers/sessionsController';
import * as condivisioniController from '../controllers/condivisioniController';
import * as otaController from '../controllers/otaController';
import deviceRoutes from './deviceRoutes';
import { authMiddleware, roleMiddleware } from '../middleware/auth';
import { requireImpiantoAccess, requireDeviceControl, requireStanzaAccess } from '../middleware/impiantoAccess';
// RATE LIMITING DISABILITATO - causava blocchi ingiustificati
// import { loginLimiter, registerLimiter } from '../middleware/rateLimiters';
import { validate, loginSchema, registerSchema } from '../middleware/validation';
import { UserRole } from '../types';

// ============================================
// ROUTES PRINCIPALI
// ============================================

const router = Router();

// ============================================
// VERSION ENDPOINT (per auto-update frontend)
// ============================================
router.get('/version', (req, res) => {
  res.json({ version: 'v1.7.0' });
});

// ============================================
// AUTH ROUTES (sicurezza: rate limiting disabilitato)
// ============================================
router.post('/auth/login', validate(loginSchema), authController.login);
// Registrazione pubblica (auto-registrazione clienti)
router.post('/auth/register', validate(registerSchema), authController.register);
router.get('/auth/profile', authMiddleware, authController.getProfile);
router.post('/auth/change-password', authMiddleware, authController.changePassword);
router.post('/auth/logout', authMiddleware, authController.logout);

// Verifica email (pubblico - link da email)
router.get('/auth/verify-email', authController.verifyEmail);
// Reinvia email verifica (pubblico)
router.post('/auth/resend-verification', authController.resendVerification);
// Reset password (pubblico)
router.post('/auth/forgot-password', authController.forgotPassword);
router.post('/auth/reset-password', authController.resetPassword);
// Aggiorna profilo (nome/cognome)
router.put('/auth/profile', authMiddleware, authController.updateProfile);
// GDPR: Elimina account e esporta dati (autenticato)
router.post('/auth/delete-account', authMiddleware, authController.deleteAccount);
router.get('/auth/export-data', authMiddleware, authController.exportData);

// Health check per auth
router.get('/auth/health', (req, res) => {
  res.json({ status: 'ok', service: 'auth' });
});

// ============================================
// SESSIONS ROUTES (Dispositivi Connessi)
// ============================================
router.get('/sessions', authMiddleware, sessionsController.getSessions);
router.delete('/sessions/all', authMiddleware, sessionsController.deleteAllSessions);
router.delete('/sessions/:id', authMiddleware, sessionsController.deleteSession);

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
// Gestione codice condivisione (legacy)
router.post('/impianti/:id/regenerate-code', authMiddleware, impiantiController.regenerateCode);

// ============================================
// CONDIVISIONI ROUTES (Sistema inviti/permessi)
// ============================================
router.get('/impianti/:id/miei-permessi', authMiddleware, condivisioniController.getMieiPermessi);
router.get('/impianti/:id/condivisioni', authMiddleware, condivisioniController.getCondivisioni);
router.post('/impianti/:id/condivisioni', authMiddleware, condivisioniController.invitaUtente);
router.put('/condivisioni/:id', authMiddleware, condivisioniController.modificaPermessi);
router.delete('/condivisioni/:id', authMiddleware, condivisioniController.rimuoviCondivisione);
router.post('/condivisioni/:id/accetta', authMiddleware, condivisioniController.accettaInvito);
router.post('/condivisioni/:id/rifiuta', authMiddleware, condivisioniController.rifiutaInvito);
router.get('/inviti/pendenti', authMiddleware, condivisioniController.getInvitiPendenti);
// Cessione ruolo installatore primario
router.post('/impianti/:id/cedi-primario', authMiddleware, condivisioniController.cediInstallatorePrimario);

// ============================================
// SCENE ROUTES
// ============================================
router.get('/impianti/:impiantoId/scene', authMiddleware, requireImpiantoAccess, sceneController.getScene);
router.post('/impianti/:impiantoId/scene', authMiddleware, requireDeviceControl, sceneController.createScena);
router.post('/impianti/:impiantoId/scene/auto-populate', authMiddleware, requireDeviceControl, sceneController.autoPopulateDefaultScenes);
router.put('/scene/:id', authMiddleware, sceneController.updateScena);
router.delete('/scene/:id', authMiddleware, sceneController.deleteScena);
// Note: executeScena ha già controllo accessi interno
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
router.get('/impianti/:impiantoId/stanze', authMiddleware, requireImpiantoAccess, stanzeController.getStanze);
router.post('/impianti/:impiantoId/stanze', authMiddleware, requireDeviceControl, stanzeController.createStanza);
router.put('/stanze/:id', authMiddleware, requireStanzaAccess, stanzeController.updateStanza);
router.delete('/stanze/:id', authMiddleware, requireStanzaAccess, stanzeController.deleteStanza);

// ============================================
// DISPOSITIVI TASMOTA ROUTES
// ============================================
// Tutti i dispositivi (Tasmota + OmniaPi) - per Scene e Stanze
router.get('/impianti/:impiantoId/dispositivi/all', authMiddleware, requireImpiantoAccess, dispositiviController.getAllDispositivi);
router.get('/impianti/:impiantoId/dispositivi', authMiddleware, requireImpiantoAccess, tasmotaController.getDispositivi);
router.post('/impianti/:impiantoId/dispositivi/scan', authMiddleware, requireDeviceControl, tasmotaController.scanTasmota);
router.post('/impianti/:impiantoId/dispositivi', authMiddleware, requireDeviceControl, tasmotaController.addDispositivo);
router.delete('/dispositivi/:id', authMiddleware, tasmotaController.deleteDispositivo);
router.put('/dispositivi/:id/stanza', authMiddleware, tasmotaController.updateStanzaDispositivo);
// Note: controlDispositivo ha già controllo accessi interno
router.post('/dispositivi/:id/control', authMiddleware, tasmotaController.controlDispositivo);
router.put('/dispositivi/:id/blocco', authMiddleware, tasmotaController.toggleBloccaDispositivo);
router.put('/dispositivi/:id/nome', authMiddleware, tasmotaController.renameDispositivo);
router.post('/dispositivi/trovami', authMiddleware, tasmotaController.trovamiDispositivo);

// ============================================
// SENSOR ROUTES (DHT22, BME280, etc.)
// ============================================
router.get('/impianti/:impiantoId/sensors', authMiddleware, requireImpiantoAccess, sensorController.getSensors);
router.get('/impianti/:impiantoId/sensors/dashboard', authMiddleware, requireImpiantoAccess, sensorController.getSensorDashboard);
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
// Scan nodi non commissionati (via MQTT al gateway)
router.post('/gateway/scan/start', authMiddleware, gatewayController.startScan);
router.post('/gateway/scan/stop', authMiddleware, gatewayController.stopScan);
router.get('/gateway/scan/results', authMiddleware, gatewayController.getScanResults);
// Commissioning nodi (via MQTT al gateway)
router.post('/gateway/commission', authMiddleware, gatewayController.commissionNode);
router.get('/gateway/commission/result/:mac', authMiddleware, gatewayController.getCommissionResult);
// Scan rete locale per trovare gateway OmniaPi
router.get('/gateway/scan', authMiddleware, gatewayController.scanGateways);
// Discover gateway sulla stessa rete (match IP pubblico)
router.get('/gateway/discover', authMiddleware, gatewayController.discover);
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
router.post('/omniapi/nodes/:mac/test', authMiddleware, omniapiController.testNode);

// Gestione nodi registrati (DB) - richiede autenticazione
router.get('/impianti/:impiantoId/omniapi/nodes', authMiddleware, omniapiController.getRegisteredNodes);
router.get('/impianti/:impiantoId/omniapi/available', authMiddleware, omniapiController.getAvailableNodes);
router.post('/impianti/:impiantoId/omniapi/register', authMiddleware, omniapiController.registerNode);
router.delete('/omniapi/nodes/:id', authMiddleware, omniapiController.unregisterNode);
router.put('/omniapi/nodes/:id', authMiddleware, omniapiController.updateRegisteredNode);
// Note: controlRegisteredNode ha già controllo accessi interno (righe 595-606)
router.post('/omniapi/nodes/:id/control', authMiddleware, omniapiController.controlRegisteredNode);

// ============================================
// LED STRIP ROUTES (OmniaPi LED Strip devices)
// ============================================
router.post('/led/command', ledController.sendLedCommand);
router.get('/led/devices', ledController.getLedDevices);
router.get('/led/state/:mac', ledController.getLedStateByMac);

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
router.get('/admin/impianti/search', authMiddleware, roleMiddleware(UserRole.ADMIN), adminController.searchImpianti);
// Admin mode - entra/esci da impianto con condivisione temporanea
router.post('/admin/enter-impianto/:impiantoId', authMiddleware, roleMiddleware(UserRole.ADMIN), adminController.enterImpiantoAsAdmin);
router.post('/admin/exit-impianto', authMiddleware, roleMiddleware(UserRole.ADMIN), adminController.exitImpiantoAsAdmin);

// OPERATIONS LOG (Admin/Installatore)
router.get('/admin/operations', authMiddleware, roleMiddleware(UserRole.INSTALLATORE, UserRole.ADMIN), adminController.getOperations);

// OTA ROUTES (Admin only — firmware updates via gateway proxy)
router.post('/admin/ota/gateway', authMiddleware, roleMiddleware(UserRole.ADMIN), raw({ type: 'application/octet-stream', limit: '10mb' }), otaController.uploadGatewayFirmware);
router.post('/admin/ota/node/:mac', authMiddleware, roleMiddleware(UserRole.ADMIN), raw({ type: 'application/octet-stream', limit: '10mb' }), otaController.uploadNodeFirmware);
router.get('/admin/ota/status', authMiddleware, roleMiddleware(UserRole.ADMIN), otaController.getOtaStatus);
// Gateway busy status + live info
router.get('/admin/gateway/status', authMiddleware, otaController.getGatewayFullStatus);

// ============================================
// NOTIFICATIONS ROUTES (Firebase Cloud Messaging)
// ============================================
router.post('/notifications/register', authMiddleware, notificationController.registerToken);
router.delete('/notifications/unregister', authMiddleware, notificationController.unregisterToken);
router.post('/notifications/test', authMiddleware, notificationController.sendTestNotification);
router.get('/notifications/history', authMiddleware, notificationController.getHistory);
router.post('/notifications/:id/read', authMiddleware, notificationController.markAsRead);
router.post('/notifications/read-all', authMiddleware, notificationController.markAllAsRead);

// ============================================
// UNIFIED DEVICE API ROUTES (NEW - Phase 2)
// /api/devices/* - Unified API for all device types
// Coexists with legacy routes for backward compatibility
// ============================================
router.use('/', authMiddleware, deviceRoutes);

export default router;
