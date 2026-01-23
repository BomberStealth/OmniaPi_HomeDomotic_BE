/**
 * LED Strip Controller
 * Handles LED Strip commands via MQTT and state retrieval
 */

import { Request, Response } from 'express';
import { getMQTTClient } from '../config/mqtt';
import {
  getLedState,
  getAllLedDevices
} from '../services/omniapiState';

const MQTT_LED_COMMAND = 'omniapi/led/command';

/**
 * POST /api/led/command
 * Send LED command to Gateway via MQTT
 * Body: { mac, action, r?, g?, b?, brightness?, effect?, speed? }
 */
export const sendLedCommand = async (req: Request, res: Response) => {
  const startTime = Date.now();
  try {
    const { mac, action, r, g, b, brightness, effect, speed } = req.body;

    console.log(`⏱️ [TIMING-LED] Command received: mac=${mac}, action=${action}`);

    if (!mac || !action) {
      return res.status(400).json({ error: 'mac and action required' });
    }

    const payload: any = { mac, action };

    switch (action) {
      case 'on':
      case 'off':
        // Only mac and action needed
        break;
      case 'color':
      case 'set_color':
        if (r === undefined || g === undefined || b === undefined) {
          return res.status(400).json({ error: 'r, g, b required for color' });
        }
        payload.action = 'set_color';
        payload.r = r;
        payload.g = g;
        payload.b = b;
        break;
      case 'brightness':
      case 'set_brightness':
        if (brightness === undefined) {
          return res.status(400).json({ error: 'brightness required' });
        }
        payload.action = 'set_brightness';
        payload.value = brightness;
        break;
      case 'effect':
      case 'set_effect':
        if (effect === undefined) {
          return res.status(400).json({ error: 'effect required' });
        }
        payload.action = 'set_effect';
        payload.effect = effect;
        break;
      case 'speed':
      case 'set_speed':
        if (speed === undefined) {
          return res.status(400).json({ error: 'speed required' });
        }
        payload.action = 'set_speed';
        payload.speed = speed;
        break;
      case 'num_leds':
      case 'set_num_leds':
        const { num_leds } = req.body;
        if (num_leds === undefined) {
          return res.status(400).json({ error: 'num_leds required' });
        }
        payload.action = 'set_num_leds';
        payload.num_leds = num_leds;
        break;
      case 'custom_effect':
      case 'set_custom_effect':
        const { colors } = req.body;
        if (!colors || !Array.isArray(colors) || colors.length !== 3) {
          return res.status(400).json({ error: 'colors array with 3 RGB objects required' });
        }
        // Validate each color has r, g, b
        for (const c of colors) {
          if (c.r === undefined || c.g === undefined || c.b === undefined) {
            return res.status(400).json({ error: 'Each color must have r, g, b values' });
          }
        }
        payload.action = 'set_custom_effect';
        payload.colors = colors;
        break;
      default:
        return res.status(400).json({ error: 'Invalid action' });
    }

    // Publish MQTT command
    const mqttStart = Date.now();
    const mqttClient = getMQTTClient();
    mqttClient.publish(MQTT_LED_COMMAND, JSON.stringify(payload), (err) => {
      const publishTime = Date.now() - mqttStart;
      console.log(`⏱️ [TIMING-LED] MQTT publish confirmed: ${publishTime}ms`);
    });
    console.log('📤 LED command sent:', payload);

    const totalTime = Date.now() - startTime;
    console.log(`⏱️ [TIMING-LED] sendLedCommand TOTAL: ${totalTime}ms`);

    res.json({ success: true, payload, timing_ms: totalTime });
  } catch (error) {
    console.error('LED command error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * GET /api/led/devices
 * Get all LED devices from in-memory state
 */
export const getLedDevices = async (req: Request, res: Response) => {
  try {
    const devices = getAllLedDevices();
    res.json({ devices, count: devices.length });
  } catch (error) {
    console.error('Get LED devices error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * GET /api/led/state/:mac
 * Get single LED device state by MAC address
 */
export const getLedStateByMac = async (req: Request, res: Response) => {
  try {
    const { mac } = req.params;
    const state = getLedState(mac);

    if (!state) {
      return res.status(404).json({ error: 'LED device not found' });
    }

    res.json(state);
  } catch (error) {
    console.error('Get LED state error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
