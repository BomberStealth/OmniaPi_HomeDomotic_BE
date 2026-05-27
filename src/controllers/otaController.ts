/**
 * OTA Controller
 * Proxy endpoints for gateway and node firmware updates.
 * All endpoints require admin role.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { getGatewayState, acquireGatewayLock, releaseGatewayLock, getGatewayBusyState } from '../services/omniapiState';
import { onlineGateways, getMQTTClient } from '../config/mqtt';
import { logOperation } from '../services/operationLog';

function getLocalLanIp(): string {
  const ifaces = os.networkInterfaces();
  for (const addrs of Object.values(ifaces)) {
    for (const addr of addrs || []) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address;
    }
  }
  return '127.0.0.1';
}

// Firmware storage directory (BE root/firmware/)
const FIRMWARE_DIR = path.join(__dirname, '../../firmware');
if (!fs.existsSync(FIRMWARE_DIR)) {
  fs.mkdirSync(FIRMWARE_DIR, { recursive: true });
}

// ============================================
// HELPER: Resolve gateway IP
// ============================================

function getGatewayIp(): string | null {
  // 1. Try in-memory state (updated by MQTT heartbeat)
  const gw = getGatewayState();
  if (gw?.ip) return gw.ip;

  // 2. Fallback: first entry in onlineGateways Map
  for (const [, entry] of onlineGateways) {
    if (entry.ip) return entry.ip;
  }

  return null;
}

// ============================================
// POST /api/admin/ota/gateway
// Upload firmware to gateway, wait for reboot, verify new version
// ============================================

export const uploadGatewayFirmware = async (req: AuthRequest, res: Response) => {
  if (!acquireGatewayLock('ota_gateway')) {
    const busy = getGatewayBusyState();
    return res.status(409).json({ error: 'Gateway occupato', operation: busy.operation, started_at: busy.started_at });
  }

  try {
    const gatewayIp = getGatewayIp();
    if (!gatewayIp) {
      releaseGatewayLock();
      return res.status(400).json({ error: 'Gateway non raggiungibile — nessun IP disponibile' });
    }

    // req.body is a Buffer (from express.raw middleware)
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      releaseGatewayLock();
      return res.status(400).json({ error: 'Nessun file firmware ricevuto' });
    }

    const firmwareSize = req.body.length;
    console.log(`🔧 [OTA] Gateway firmware upload started — ${firmwareSize} bytes`);

    // Step 1: Query current status (heap check + old version)
    let oldVersion = 'unknown';
    try {
      const statusRes = await fetch(`http://${gatewayIp}/api/status`, {
        signal: AbortSignal.timeout(5000),
      });
      const status = await statusRes.json() as any;
      oldVersion = status.firmware || status.version || 'unknown';

      console.log(`🔧 [OTA] Gateway status: heap_free=${status.heap_free}, version=${oldVersion}`);

      // Heap check — reboot if low
      if (status.heap_free && status.heap_free < 60000) {
        console.log(`🔧 [OTA] Low heap (${status.heap_free}) — rebooting gateway first`);
        try {
          const client = getMQTTClient();
          client.publish('omniapi/gateway/cmd/reboot', JSON.stringify({}));
        } catch {
          // Try HTTP reboot as fallback
          await fetch(`http://${gatewayIp}/api/reboot`, {
            method: 'POST',
            signal: AbortSignal.timeout(3000),
          }).catch(() => {});
        }
        // Wait for reboot
        await new Promise(r => setTimeout(r, 15000));

        // Re-check status
        try {
          const reStatus = await fetch(`http://${gatewayIp}/api/status`, {
            signal: AbortSignal.timeout(5000),
          });
          const reData = await reStatus.json() as any;
          console.log(`🔧 [OTA] Post-reboot heap: ${reData.heap_free}`);
        } catch {
          console.log('🔧 [OTA] Gateway not yet online after reboot — proceeding anyway');
        }
      }
    } catch (err) {
      console.log('🔧 [OTA] Could not query gateway status — proceeding with upload');
    }

    // Step 2: Forward firmware binary to gateway
    console.log(`🔧 [OTA] Uploading firmware to http://${gatewayIp}/api/ota/upload`);
    const uploadRes = await fetch(`http://${gatewayIp}/api/ota/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(firmwareSize),
        'Expect': '',
      },
      body: req.body,
      signal: AbortSignal.timeout(120000),
    });

    let uploadData: any;
    try {
      uploadData = await uploadRes.json();
    } catch {
      uploadData = { success: uploadRes.ok };
    }

    if (!uploadRes.ok && !uploadData?.success) {
      console.error('🔧 [OTA] Gateway rejected firmware:', uploadData);
      return res.status(500).json({
        error: uploadData?.message || 'Gateway ha rifiutato il firmware',
      });
    }

    console.log('🔧 [OTA] Firmware accepted — gateway rebooting in 3s');

    // Step 3: Wait for gateway reboot
    await new Promise(r => setTimeout(r, 5000));

    // Step 4: Poll for new version (max 60s)
    let newVersion = oldVersion;
    for (let i = 0; i < 12; i++) {
      try {
        const pollRes = await fetch(`http://${gatewayIp}/api/status`, {
          signal: AbortSignal.timeout(3000),
        });
        const pollData = await pollRes.json() as any;
        newVersion = pollData.firmware || pollData.version || newVersion;

        if (newVersion !== oldVersion) {
          console.log(`🔧 [OTA] Gateway updated: ${oldVersion} → ${newVersion}`);
          break;
        }
      } catch {
        // Gateway still rebooting
      }
      await new Promise(r => setTimeout(r, 5000));
    }

    logOperation(null, 'ota_gateway', 'success', { old_version: oldVersion, new_version: newVersion, firmware_size: firmwareSize });

    releaseGatewayLock();
    res.json({
      success: true,
      old_version: oldVersion,
      new_version: newVersion,
      reboot_required: true,
      firmware_size: firmwareSize,
    });
  } catch (error: any) {
    releaseGatewayLock();
    console.error('🔧 [OTA] Gateway upload error:', error.message);
    logOperation(null, 'ota_gateway', 'error', { error: error.message });
    res.status(500).json({ error: error.message || 'Errore durante l\'aggiornamento firmware gateway' });
  }
};

// ============================================
// POST /api/admin/ota/node/:mac
// Upload firmware to node via gateway mesh
// ============================================

export const uploadNodeFirmware = async (req: AuthRequest, res: Response) => {
  if (!acquireGatewayLock('ota_node')) {
    const busy = getGatewayBusyState();
    return res.status(409).json({ error: 'Gateway occupato', operation: busy.operation, started_at: busy.started_at });
  }

  try {
    const gatewayIp = getGatewayIp();
    if (!gatewayIp) {
      releaseGatewayLock();
      return res.status(400).json({ error: 'Gateway non raggiungibile — nessun IP disponibile' });
    }

    const mac = (req.params.mac || '').toUpperCase().replace(/-/g, ':');
    if (!mac) {
      releaseGatewayLock();
      return res.status(400).json({ error: 'MAC address mancante' });
    }

    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      releaseGatewayLock();
      return res.status(400).json({ error: 'Nessun file firmware ricevuto' });
    }

    const firmwareSize = req.body.length;
    console.log(`🔧 [OTA] Node ${mac} firmware upload — ${firmwareSize} bytes`);

    // Forward to gateway
    const uploadRes = await fetch(
      `http://${gatewayIp}/api/node/ota?mac=${encodeURIComponent(mac)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(firmwareSize),
          'Expect': '',
        },
        body: req.body,
        signal: AbortSignal.timeout(120000),
      }
    );

    let data: any;
    try {
      data = await uploadRes.json();
    } catch {
      data = { success: uploadRes.ok };
    }

    if (!uploadRes.ok && !data?.success) {
      releaseGatewayLock();
      console.error(`🔧 [OTA] Node ${mac} firmware rejected:`, data);
      return res.status(500).json({
        error: data?.message || 'Gateway ha rifiutato il firmware per il nodo',
      });
    }

    console.log(`🔧 [OTA] Node ${mac} firmware accepted — OTA in progress`);

    logOperation(null, 'ota_node', 'success', { mac, firmware_size: firmwareSize });

    releaseGatewayLock();
    res.json({
      success: true,
      message: data?.message || 'Firmware inviato al nodo',
      firmware_size: firmwareSize,
      target_mac: mac,
    });
  } catch (error: any) {
    releaseGatewayLock();
    console.error('🔧 [OTA] Node upload error:', error.message);
    logOperation(null, 'ota_node', 'error', { mac: req.params.mac, error: error.message });
    res.status(500).json({ error: error.message || 'Errore durante l\'aggiornamento firmware nodo' });
  }
};

// ============================================
// GET /api/admin/ota/status
// Combined OTA status from gateway
// ============================================

export const getOtaStatus = async (req: AuthRequest, res: Response) => {
  try {
    const gatewayIp = getGatewayIp();
    if (!gatewayIp) {
      return res.status(400).json({ success: false, error: 'Gateway non raggiungibile' });
    }

    // Fetch both status endpoints in parallel
    const [otaResult, nodeOtaResult] = await Promise.allSettled([
      fetch(`http://${gatewayIp}/api/ota/status`, { signal: AbortSignal.timeout(5000) })
        .then(r => r.json()),
      fetch(`http://${gatewayIp}/api/node/ota/status`, { signal: AbortSignal.timeout(5000) })
        .then(r => r.json()),
    ]);

    res.json({
      success: true,
      gateway_ota: otaResult.status === 'fulfilled' ? otaResult.value : null,
      node_ota: nodeOtaResult.status === 'fulfilled' ? nodeOtaResult.value : null,
    });
  } catch (error: any) {
    console.error('🔧 [OTA] Status error:', error.message);
    res.status(500).json({ success: false, error: 'Errore lettura stato OTA' });
  }
};

// ============================================
// POST /api/admin/firmware?name=filename.bin
// Upload e salva firmware sul server BE
// ============================================

export const uploadFirmwareFile = async (req: AuthRequest, res: Response) => {
  const rawName = (req.query.name as string) || '';
  const safeName = path.basename(rawName).replace(/[^a-zA-Z0-9._-]/g, '_');

  if (!safeName || !safeName.endsWith('.bin')) {
    return res.status(400).json({ error: 'Nome file .bin richiesto come query param ?name=' });
  }

  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: 'Nessun file firmware ricevuto' });
  }

  const filePath = path.join(FIRMWARE_DIR, safeName);
  fs.writeFileSync(filePath, req.body);

  const sha256 = crypto.createHash('sha256').update(req.body).digest('hex');
  console.log(`📦 [FIRMWARE] Salvato: ${safeName} (${req.body.length} bytes, sha256=${sha256.slice(0, 16)}...)`);

  res.json({ success: true, filename: safeName, size: req.body.length, sha256 });
};

// ============================================
// GET /api/admin/firmware
// Lista firmware disponibili sul server
// ============================================

export const listFirmwareFiles = async (req: AuthRequest, res: Response) => {
  const files = fs.readdirSync(FIRMWARE_DIR)
    .filter(f => f.endsWith('.bin'))
    .map(f => {
      const stat = fs.statSync(path.join(FIRMWARE_DIR, f));
      return { filename: f, size: stat.size, uploadedAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));

  res.json({ files });
};

// ============================================
// DELETE /api/admin/firmware/:filename
// Elimina firmware dal server
// ============================================

export const deleteFirmwareFile = async (req: AuthRequest, res: Response) => {
  const safeName = path.basename(req.params.filename || '').replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = path.join(FIRMWARE_DIR, safeName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Firmware non trovato' });
  }

  fs.unlinkSync(filePath);
  res.json({ success: true });
};

// ============================================
// POST /api/admin/gateways/:mac/ota
// Trigger OTA via MQTT per gateway specifico
// ============================================

export const triggerGatewayOtaMqtt = async (req: AuthRequest, res: Response) => {
  const { mac } = req.params;
  const { filename } = req.body;

  if (!filename) {
    return res.status(400).json({ error: 'filename richiesto nel body' });
  }

  const safeName = path.basename(filename as string).replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = path.join(FIRMWARE_DIR, safeName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Firmware non trovato sul server' });
  }

  const fileBuffer = fs.readFileSync(filePath);
  const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  const size = fileBuffer.length;

  // URL locale LAN (il gateway è sulla stessa rete del Pi — usa IP locale + porta 3000 diretta)
  const localIp = getLocalLanIp();
  const downloadUrl = `http://${localIp}:3000/firmware/${safeName}`;

  // Estrai versione dal nome file (es. omniapi_gateway_v1.19.2.bin → 1.19.2)
  const versionMatch = safeName.match(/v?(\d+\.\d+\.\d+)/);
  const version = versionMatch ? versionMatch[1] : '0.0.0';

  // Normalizza MAC → senza separatori, uppercase
  const macNoColon = (mac as string).replace(/[:-]/g, '').toUpperCase();

  const payload = {
    url: downloadUrl,
    version,
    sha256,
    size,
    device_type: 0xFF, // DEVICE_TYPE_GATEWAY
  };

  try {
    const client = getMQTTClient();
    client.publish(`omniapi/gateway/${macNoColon}/ota/start`, JSON.stringify(payload));
    console.log(`🔧 [OTA-MQTT] Trigger OTA → gateway ${mac}: ${safeName} @ ${downloadUrl}`);

    logOperation(null, 'ota_gateway', 'success', { mac, firmware: safeName, version, size, method: 'mqtt' });

    res.json({ success: true, gateway_mac: mac, firmware: safeName, version, size, url: downloadUrl });
  } catch (err: any) {
    console.error('🔧 [OTA-MQTT] MQTT error:', err.message);
    res.status(500).json({ error: 'MQTT non disponibile: ' + err.message });
  }
};

// ============================================
// GET /api/admin/gateway/status
// Gateway busy state + info
// ============================================

export const getGatewayFullStatus = async (req: AuthRequest, res: Response) => {
  try {
    const busy = getGatewayBusyState();
    const gw = getGatewayState();

    // Try to get live info from gateway
    let liveInfo: any = null;
    const gatewayIp = getGatewayIp();
    if (gatewayIp) {
      try {
        const statusRes = await fetch(`http://${gatewayIp}/api/status`, {
          signal: AbortSignal.timeout(3000),
        });
        liveInfo = await statusRes.json();
      } catch {
        // Gateway unreachable
      }
    }

    res.json({
      ...busy,
      gateway: {
        online: gw?.online ?? false,
        ip: gw?.ip ?? gatewayIp ?? null,
        version: liveInfo?.firmware ?? liveInfo?.version ?? gw?.version ?? null,
        heap_free: liveInfo?.heap_free ?? null,
        uptime: liveInfo?.uptime ?? null,
        nodes_count: liveInfo?.nodes_count ?? gw?.nodeCount ?? null,
      },
    });
  } catch (error: any) {
    console.error('🔧 [STATUS] Error:', error.message);
    res.status(500).json({ error: 'Errore lettura stato gateway' });
  }
};
