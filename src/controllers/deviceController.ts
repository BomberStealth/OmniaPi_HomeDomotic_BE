/**
 * Device Controller - Unified API Endpoints
 * Handles all device types: Relay, LED, Sensor, Dimmer, Tasmota
 */

import { Request, Response } from 'express';
import * as deviceService from '../services/deviceService';
import { DeviceCommand } from '../types/device';
import { DeviceType } from '../config/deviceTypes';

// ============================================
// GET ENDPOINTS
// ============================================

/**
 * GET /api/impianti/:impiantoId/devices
 * Get all registered devices for an impianto
 */
export const getDevices = async (req: Request, res: Response) => {
  try {
    const impiantoId = parseInt(req.params.impiantoId);
    if (isNaN(impiantoId)) {
      return res.status(400).json({ success: false, error: 'Invalid impianto ID' });
    }

    const devices = await deviceService.getAllDevices(impiantoId);

    res.json({
      success: true,
      devices,
      count: devices.length
    });
  } catch (error: any) {
    console.error('Error getting devices:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/impianti/:impiantoId/devices/available
 * Get available devices (online but not registered)
 */
export const getAvailableDevices = async (req: Request, res: Response) => {
  try {
    const impiantoId = parseInt(req.params.impiantoId);
    if (isNaN(impiantoId)) {
      return res.status(400).json({ success: false, error: 'Invalid impianto ID' });
    }

    const devices = await deviceService.getAvailableDevices(impiantoId);

    res.json({
      success: true,
      devices,
      count: devices.length
    });
  } catch (error: any) {
    console.error('Error getting available devices:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/devices/:id
 * Get device by database ID
 */
export const getDeviceById = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid device ID' });
    }

    const device = await deviceService.getDeviceById(id);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }

    res.json({
      success: true,
      device
    });
  } catch (error: any) {
    console.error('Error getting device by ID:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/devices/mac/:mac
 * Get device by MAC address
 */
export const getDeviceByMac = async (req: Request, res: Response) => {
  try {
    const mac = req.params.mac;
    if (!mac) {
      return res.status(400).json({ success: false, error: 'MAC address required' });
    }

    const device = await deviceService.getDeviceByMac(mac);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }

    res.json({
      success: true,
      device
    });
  } catch (error: any) {
    console.error('Error getting device by MAC:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/impianti/:impiantoId/devices/count
 * Get device count statistics
 */
export const getDeviceCount = async (req: Request, res: Response) => {
  try {
    const impiantoId = parseInt(req.params.impiantoId);
    if (isNaN(impiantoId)) {
      return res.status(400).json({ success: false, error: 'Invalid impianto ID' });
    }

    const count = await deviceService.getDeviceCount(impiantoId);

    res.json({
      success: true,
      ...count
    });
  } catch (error: any) {
    console.error('Error getting device count:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/stanze/:stanzaId/devices
 * Get devices by room
 */
export const getDevicesByRoom = async (req: Request, res: Response) => {
  try {
    const stanzaId = parseInt(req.params.stanzaId);
    if (isNaN(stanzaId)) {
      return res.status(400).json({ success: false, error: 'Invalid stanza ID' });
    }

    const devices = await deviceService.getDevicesByRoom(stanzaId);

    res.json({
      success: true,
      devices,
      count: devices.length
    });
  } catch (error: any) {
    console.error('Error getting devices by room:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ============================================
// POST ENDPOINTS
// ============================================

/**
 * POST /api/impianti/:impiantoId/devices
 * Register a new device
 */
export const registerDevice = async (req: Request, res: Response) => {
  try {
    const impiantoId = parseInt(req.params.impiantoId);
    if (isNaN(impiantoId)) {
      return res.status(400).json({ success: false, error: 'Invalid impianto ID' });
    }

    const { mac, nome, stanza_id, device_type } = req.body;

    if (!mac) {
      return res.status(400).json({ success: false, error: 'MAC address required' });
    }

    if (!nome) {
      return res.status(400).json({ success: false, error: 'Device name required' });
    }

    const device = await deviceService.registerDevice(
      impiantoId,
      mac,
      nome,
      stanza_id,
      device_type as DeviceType | undefined
    );

    res.status(201).json({
      success: true,
      device,
      message: `Device ${nome} registered successfully`
    });
  } catch (error: any) {
    console.error('Error registering device:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST /api/devices/:id/command
 * Send command to device by ID
 */
export const sendCommandById = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid device ID' });
    }

    const { action, params } = req.body;

    if (!action) {
      return res.status(400).json({ success: false, error: 'Action required' });
    }

    const command: DeviceCommand = {
      mac: '', // Will be resolved by service
      action,
      params
    };

    const result = await deviceService.sendCommandById(id, command);

    res.json(result);
  } catch (error: any) {
    console.error('Error sending command by ID:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST /api/devices/mac/:mac/command
 * Send command to device by MAC
 */
export const sendCommandByMac = async (req: Request, res: Response) => {
  try {
    const mac = req.params.mac;
    if (!mac) {
      return res.status(400).json({ success: false, error: 'MAC address required' });
    }

    const { action, params } = req.body;

    if (!action) {
      return res.status(400).json({ success: false, error: 'Action required' });
    }

    const command: DeviceCommand = {
      mac,
      action,
      params
    };

    const result = await deviceService.sendCommand(mac, command);

    res.json(result);
  } catch (error: any) {
    console.error('Error sending command by MAC:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST /api/devices/:id/test
 * Test device (blink/toggle to identify)
 */
export const testDeviceById = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid device ID' });
    }

    const device = await deviceService.getDeviceById(id);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }

    const result = await deviceService.testDevice(device.mac);

    res.json({
      success: result.success,
      message: result.success ? 'Device test initiated' : 'Test failed'
    });
  } catch (error: any) {
    console.error('Error testing device:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST /api/devices/mac/:mac/test
 * Test device by MAC
 */
export const testDeviceByMac = async (req: Request, res: Response) => {
  try {
    const mac = req.params.mac;
    if (!mac) {
      return res.status(400).json({ success: false, error: 'MAC address required' });
    }

    const result = await deviceService.testDevice(mac);

    res.json({
      success: result.success,
      message: result.success ? 'Device test initiated' : 'Test failed'
    });
  } catch (error: any) {
    console.error('Error testing device:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ============================================
// PUT ENDPOINTS
// ============================================

/**
 * PUT /api/devices/:id
 * Update device properties
 */
export const updateDevice = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid device ID' });
    }

    const { nome, stanza_id } = req.body;

    const device = await deviceService.updateDevice(id, { nome, stanza_id });

    if (!device) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }

    res.json({
      success: true,
      device,
      message: 'Device updated successfully'
    });
  } catch (error: any) {
    console.error('Error updating device:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ============================================
// DELETE ENDPOINTS
// ============================================

/**
 * DELETE /api/devices/:id
 * Unregister (delete) a device
 */
export const deleteDevice = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid device ID' });
    }

    const success = await deviceService.unregisterDevice(id);

    if (!success) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }

    res.json({
      success: true,
      message: 'Device deleted successfully'
    });
  } catch (error: any) {
    console.error('Error deleting device:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
