/**
 * Device Routes - Unified API for all device types
 *
 * Routes structure:
 * - /api/devices/*           - Operations by device ID
 * - /api/devices/mac/*       - Operations by MAC address
 * - /api/impianti/:id/devices/* - Operations scoped to impianto
 * - /api/stanze/:id/devices  - Operations scoped to room
 */

import { Router } from 'express';
import * as deviceController from '../controllers/deviceController';

const router = Router();

// ============================================
// DEVICE BY ID ROUTES
// /api/devices/*
// ============================================

// GET single device by ID
router.get('/devices/:id', deviceController.getDeviceById);

// UPDATE device by ID
router.put('/devices/:id', deviceController.updateDevice);

// DELETE device by ID
router.delete('/devices/:id', deviceController.deleteDevice);

// POST command to device by ID
router.post('/devices/:id/command', deviceController.sendCommandById);

// POST test device by ID (blink/toggle to identify)
router.post('/devices/:id/test', deviceController.testDeviceById);

// ============================================
// DEVICE BY MAC ROUTES
// /api/devices/mac/*
// ============================================

// GET device by MAC
router.get('/devices/mac/:mac', deviceController.getDeviceByMac);

// POST command to device by MAC
router.post('/devices/mac/:mac/command', deviceController.sendCommandByMac);

// POST test device by MAC
router.post('/devices/mac/:mac/test', deviceController.testDeviceByMac);

// ============================================
// IMPIANTO-SCOPED ROUTES
// /api/impianti/:impiantoId/devices/*
// ============================================

// GET all registered devices for impianto
router.get('/impianti/:impiantoId/devices', deviceController.getDevices);

// GET available (unregistered) devices for impianto
router.get('/impianti/:impiantoId/devices/available', deviceController.getAvailableDevices);

// GET device count statistics for impianto
router.get('/impianti/:impiantoId/devices/count', deviceController.getDeviceCount);

// POST register new device to impianto
router.post('/impianti/:impiantoId/devices', deviceController.registerDevice);

// ============================================
// ROOM-SCOPED ROUTES
// /api/stanze/:stanzaId/devices
// ============================================

// GET devices by room
router.get('/stanze/:stanzaId/devices', deviceController.getDevicesByRoom);

export default router;
