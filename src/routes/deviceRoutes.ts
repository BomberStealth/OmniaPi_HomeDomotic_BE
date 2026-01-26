/**
 * Device Routes - Unified API for all device types
 *
 * Routes structure:
 * - /api/devices/*           - Operations by device ID
 * - /api/devices/mac/*       - Operations by MAC address
 * - /api/impianti/:id/devices/* - Operations scoped to impianto
 * - /api/stanze/:id/devices  - Operations scoped to room
 *
 * Middleware "a cipolla":
 * 1. authMiddleware (applicato nel router principale)
 * 2. requireImpiantoAccess - verifica accesso all'impianto
 * 3. requireDeviceControl - verifica permesso controllo dispositivi
 * 4. requireStanzaAccess - verifica accesso alla stanza (per ospiti)
 */

import { Router } from 'express';
import * as deviceController from '../controllers/deviceController';
import { requireImpiantoAccess, requireDeviceControl, requireStanzaAccess } from '../middleware/impiantoAccess';

const router = Router();

// ============================================
// DEVICE BY ID ROUTES
// /api/devices/*
// Nota: questi verificano accesso nel controller
// perché il device contiene già impiantoId
// ============================================

// GET single device by ID
router.get('/devices/:id', deviceController.getDeviceById);

// UPDATE device by ID (richiede controllo)
router.put('/devices/:id', deviceController.updateDevice);

// DELETE device by ID (richiede controllo)
router.delete('/devices/:id', deviceController.deleteDevice);

// POST command to device by ID (richiede controllo)
router.post('/devices/:id/command', deviceController.sendCommandById);

// POST test device by ID (blink/toggle to identify)
router.post('/devices/:id/test', deviceController.testDeviceById);

// ============================================
// DEVICE BY MAC ROUTES
// /api/devices/mac/*
// ============================================

// GET device by MAC
router.get('/devices/mac/:mac', deviceController.getDeviceByMac);

// POST command to device by MAC (richiede controllo)
router.post('/devices/mac/:mac/command', deviceController.sendCommandByMac);

// POST test device by MAC
router.post('/devices/mac/:mac/test', deviceController.testDeviceByMac);

// ============================================
// IMPIANTO-SCOPED ROUTES
// /api/impianti/:impiantoId/devices/*
// ============================================

// GET all registered devices for impianto
router.get('/impianti/:impiantoId/devices', requireImpiantoAccess, deviceController.getDevices);

// GET available (unregistered) devices for impianto
router.get('/impianti/:impiantoId/devices/available', requireImpiantoAccess, deviceController.getAvailableDevices);

// GET device count statistics for impianto
router.get('/impianti/:impiantoId/devices/count', requireImpiantoAccess, deviceController.getDeviceCount);

// POST register new device to impianto (richiede controllo)
router.post('/impianti/:impiantoId/devices', requireDeviceControl, deviceController.registerDevice);

// ============================================
// ROOM-SCOPED ROUTES
// /api/stanze/:stanzaId/devices
// ============================================

// GET devices by room (verifica accesso stanza per ospiti)
router.get('/stanze/:stanzaId/devices', requireStanzaAccess, deviceController.getDevicesByRoom);

export default router;
