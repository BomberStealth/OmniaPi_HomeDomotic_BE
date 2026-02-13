import { Request, Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { emitGatewayUpdate } from '../socket';
import { discoverDevices } from '../services/presenceService';
import { onlineGateways, scanResults, clearScanResults, commissionResults } from '../config/mqtt';
import { getMQTTClient } from '../config/mqtt';
import { acquireGatewayLock, releaseGatewayLock, getGatewayBusyState } from '../services/omniapiState';

// ============================================
// GATEWAY CONTROLLER
// Gestione Gateway OmniaPi
// ============================================

/**
 * POST /api/gateway/register
 * Chiamato dal Gateway dopo connessione WiFi
 * PUBBLICO - no auth richiesta
 * Body: { mac: "XX:XX:XX:XX:XX:XX", ip: "192.168.1.205", version: "1.5.0" }
 */
export const registerGateway = async (req: Request, res: Response) => {
  try {
    const { mac, ip, version } = req.body;

    if (!mac) {
      return res.status(400).json({ error: 'MAC address richiesto' });
    }

    // Normalizza MAC address (uppercase, con :)
    const normalizedMac = mac.toUpperCase().replace(/-/g, ':');

    // Verifica se il gateway esiste già
    const existing: any = await query(
      'SELECT * FROM gateways WHERE mac_address = ?',
      [normalizedMac]
    );

    if (existing && existing.length > 0) {
      // Gateway già registrato - aggiorna info
      await query(
        `UPDATE gateways
         SET ip_address = ?, firmware_version = ?, status = 'online',
             last_seen = NOW(), mqtt_connected = TRUE
         WHERE mac_address = ?`,
        [ip || existing[0].ip_address, version || existing[0].firmware_version, normalizedMac]
      );

      const gateway = existing[0];
      console.log(`🔄 Gateway ${normalizedMac} aggiornato - IP: ${ip}, Impianto: ${gateway.impianto_id || 'non associato'}`);

      return res.json({
        success: true,
        message: 'Gateway aggiornato',
        gateway: {
          id: gateway.id,
          mac: normalizedMac,
          ip: ip || gateway.ip_address,
          impianto_id: gateway.impianto_id,
          status: gateway.impianto_id ? 'online' : 'pending'
        }
      });
    }

    // Nuovo gateway - crea record in stato pending
    const result: any = await query(
      `INSERT INTO gateways (mac_address, ip_address, firmware_version, status, last_seen, mqtt_connected)
       VALUES (?, ?, ?, 'pending', NOW(), TRUE)`,
      [normalizedMac, ip, version]
    );

    console.log(`✅ Nuovo Gateway registrato: ${normalizedMac} (ID: ${result.insertId})`);

    res.status(201).json({
      success: true,
      message: 'Gateway registrato, in attesa di associazione',
      gateway: {
        id: result.insertId,
        mac: normalizedMac,
        ip,
        status: 'pending'
      }
    });
  } catch (error: any) {
    console.error('Errore registerGateway:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Gateway già registrato' });
    }
    res.status(500).json({ error: 'Errore durante la registrazione del gateway' });
  }
};

/**
 * GET /api/gateway/pending
 * Lista gateway in attesa di associazione
 * Qualsiasi utente autenticato può vedere i gateway pending
 */
export const getPendingGateways = async (req: AuthRequest, res: Response) => {
  try {
    const gateways: any = await query(
      `SELECT id, mac_address, ip_address, firmware_version, status, last_seen, created_at
       FROM gateways
       WHERE impianto_id IS NULL
       ORDER BY last_seen DESC`
    );

    // Formatta risposta con campi attesi dal frontend
    const formattedGateways = (gateways || []).map((g: any) => ({
      id: g.id,
      mac: g.mac_address,
      ip: g.ip_address,
      version: g.firmware_version,
      status: g.status || 'pending',
      lastSeen: g.last_seen,
      createdAt: g.created_at
    }));

    res.json({
      gateways: formattedGateways,
      count: formattedGateways.length
    });
  } catch (error) {
    console.error('Errore getPendingGateways:', error);
    res.status(500).json({ error: 'Errore durante il recupero dei gateway' });
  }
};

/**
 * GET /api/impianti/:impiantoId/gateway
 * Ritorna info gateway dell'impianto
 */
export const getImpiantoGateway = async (req: AuthRequest, res: Response) => {
  try {
    const { impiantoId } = req.params;

    // Admin bypass - admin ha sempre accesso
    if (req.user?.ruolo === 'admin') {
      const impianti: any = await query(
        'SELECT * FROM impianti WHERE id = ?',
        [impiantoId]
      );
      if (!impianti || impianti.length === 0) {
        return res.status(404).json({ error: 'Impianto non trovato' });
      }
    } else {
      // Verifica accesso all'impianto per utenti normali
      const impianti: any = await query(
        `SELECT i.* FROM impianti i
         LEFT JOIN condivisioni_impianto c ON i.id = c.impianto_id AND c.stato = 'accettato'
         WHERE i.id = ? AND (i.utente_id = ? OR c.utente_id = ?)`,
        [impiantoId, req.user!.userId, req.user!.userId]
      );

      if (!impianti || impianti.length === 0) {
        return res.status(404).json({ error: 'Impianto non trovato' });
      }
    }

    // Recupera gateway
    const gateways: any = await query(
      `SELECT id, mac_address, nome, ip_address, firmware_version, status,
              mqtt_connected, node_count, last_seen, created_at
       FROM gateways
       WHERE impianto_id = ?`,
      [impiantoId]
    );

    if (!gateways || gateways.length === 0) {
      return res.json({
        gateway: null,
        message: 'Nessun gateway associato'
      });
    }

    const gateway = gateways[0];

    // Usa il campo status dal DB (già aggiornato via MQTT) invece del calcolo basato su last_seen
    // Il campo status viene settato a 'online' da updateGatewayFromMqtt quando riceve messaggi
    // Questo evita problemi di timezone tra MySQL NOW() (UTC) e JavaScript Date (locale)
    const isOnline = gateway.status === 'online' && gateway.mqtt_connected;

    res.json({
      gateway: {
        id: gateway.id,
        mac: gateway.mac_address,
        nome: gateway.nome,
        ip: gateway.ip_address,
        version: gateway.firmware_version,
        status: isOnline ? 'online' : 'offline',
        mqttConnected: gateway.mqtt_connected,
        nodeCount: gateway.node_count,
        lastSeen: gateway.last_seen,
        createdAt: gateway.created_at
      }
    });
  } catch (error) {
    console.error('Errore getImpiantoGateway:', error);
    res.status(500).json({ error: 'Errore durante il recupero del gateway' });
  }
};

/**
 * POST /api/impianti/:impiantoId/gateway/associate
 * Associa un gateway all'impianto
 * Body: { mac: "XX:XX:XX:XX:XX:XX", nome?: "Nome Gateway" }
 */
export const associateGateway = async (req: AuthRequest, res: Response) => {
  try {
    const { impiantoId } = req.params;
    const { mac, nome } = req.body;

    if (!mac) {
      return res.status(400).json({ error: 'MAC address richiesto' });
    }

    // Admin bypass - admin ha sempre accesso
    if (req.user?.ruolo !== 'admin') {
      // Verifica accesso all'impianto per utenti normali
      const impianti: any = await query(
        `SELECT i.* FROM impianti i
         LEFT JOIN condivisioni_impianto c ON i.id = c.impianto_id AND c.stato = 'accettato'
         WHERE i.id = ? AND (i.utente_id = ? OR c.utente_id = ?)`,
        [impiantoId, req.user!.userId, req.user!.userId]
      );

      if (!impianti || impianti.length === 0) {
        return res.status(404).json({ error: 'Impianto non trovato' });
      }
    }

    // Verifica che l'impianto non abbia già un gateway
    const existingGateway: any = await query(
      'SELECT id FROM gateways WHERE impianto_id = ?',
      [impiantoId]
    );

    if (existingGateway && existingGateway.length > 0) {
      return res.status(409).json({
        error: 'Impianto ha già un gateway associato',
        existingGatewayId: existingGateway[0].id
      });
    }

    // Normalizza MAC
    const normalizedMac = mac.toUpperCase().replace(/-/g, ':');

    // Verifica che il gateway esista
    let gateways: any = await query(
      'SELECT * FROM gateways WHERE mac_address = ?',
      [normalizedMac]
    );

    // Se il gateway non esiste nel DB (es. trovato via scan rete), crealo al volo
    if (!gateways || gateways.length === 0) {
      const { ip, version } = req.body;
      console.log(`📝 Gateway ${normalizedMac} non trovato nel DB, creazione automatica...`);
      const insertResult: any = await query(
        `INSERT INTO gateways (mac_address, ip_address, firmware_version, nome, status, last_seen, mqtt_connected)
         VALUES (?, ?, ?, ?, 'pending', NOW(), FALSE)`,
        [normalizedMac, ip || null, version || null, nome || 'Gateway OmniaPi']
      );
      // Rileggi il record appena creato
      gateways = await query(
        'SELECT * FROM gateways WHERE id = ?',
        [insertResult.insertId]
      );
      if (!gateways || gateways.length === 0) {
        return res.status(500).json({ error: 'Errore nella creazione del gateway' });
      }
      console.log(`✅ Gateway ${normalizedMac} creato con ID ${insertResult.insertId}`);
    }

    const gateway = gateways[0];

    // Verifica che non sia già associato ad altro impianto
    if (gateway.impianto_id && gateway.impianto_id !== parseInt(impiantoId)) {
      return res.status(409).json({
        error: 'Gateway già associato ad altro impianto',
        currentImpiantoId: gateway.impianto_id
      });
    }

    // Associa gateway all'impianto
    await query(
      `UPDATE gateways
       SET impianto_id = ?, nome = ?, status = 'online'
       WHERE mac_address = ?`,
      [impiantoId, nome || gateway.nome, normalizedMac]
    );

    console.log(`✅ Gateway ${normalizedMac} associato all'impianto ${impiantoId}`);

    const gatewayData = {
      id: gateway.id,
      mac: normalizedMac,
      nome: nome || gateway.nome,
      impianto_id: parseInt(impiantoId),
      status: 'online'
    };

    // Emit WebSocket per aggiornamento real-time
    emitGatewayUpdate(parseInt(impiantoId), gatewayData, 'associated');

    res.json({
      success: true,
      message: 'Gateway associato con successo',
      gateway: gatewayData
    });
  } catch (error) {
    console.error('Errore associateGateway:', error);
    res.status(500).json({ error: 'Errore durante l\'associazione del gateway' });
  }
};

/**
 * DELETE /api/impianti/:impiantoId/gateway
 * Disassocia gateway dall'impianto
 */
export const disassociateGateway = async (req: AuthRequest, res: Response) => {
  try {
    const { impiantoId } = req.params;

    // Admin bypass - admin ha sempre accesso
    if (req.user?.ruolo !== 'admin') {
      // Verifica accesso all'impianto per utenti normali
      const impianti: any = await query(
        `SELECT i.* FROM impianti i
         LEFT JOIN condivisioni_impianto c ON i.id = c.impianto_id AND c.stato = 'accettato'
         WHERE i.id = ? AND (i.utente_id = ? OR c.utente_id = ?)`,
        [impiantoId, req.user!.userId, req.user!.userId]
      );

      if (!impianti || impianti.length === 0) {
        return res.status(404).json({ error: 'Impianto non trovato' });
      }
    }

    // Trova gateway prima di disassociare (per emit)
    const gateways: any = await query(
      'SELECT id, mac_address, nome FROM gateways WHERE impianto_id = ?',
      [impiantoId]
    );

    // Disassocia gateway
    const result: any = await query(
      `UPDATE gateways
       SET impianto_id = NULL, status = 'pending'
       WHERE impianto_id = ?`,
      [impiantoId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Nessun gateway associato a questo impianto' });
    }

    console.log(`🔓 Gateway disassociato dall'impianto ${impiantoId}`);

    // Emit WebSocket per aggiornamento real-time
    if (gateways && gateways.length > 0) {
      emitGatewayUpdate(parseInt(impiantoId), {
        id: gateways[0].id,
        mac: gateways[0].mac_address,
        nome: gateways[0].nome,
        impianto_id: null,
        status: 'pending'
      }, 'disassociated');
    }

    res.json({
      success: true,
      message: 'Gateway disassociato con successo'
    });
  } catch (error) {
    console.error('Errore disassociateGateway:', error);
    res.status(500).json({ error: 'Errore durante la disassociazione del gateway' });
  }
};

/**
 * PUT /api/gateway/:id
 * Aggiorna info gateway (nome, etc)
 */
export const updateGateway = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { nome } = req.body;

    let gateways: any;

    // Admin bypass - admin ha sempre accesso
    if (req.user?.ruolo === 'admin') {
      gateways = await query(
        'SELECT * FROM gateways WHERE id = ?',
        [id]
      );
    } else {
      // Verifica che l'utente abbia accesso al gateway (tramite impianto)
      gateways = await query(
        `SELECT g.* FROM gateways g
         JOIN impianti i ON g.impianto_id = i.id
         LEFT JOIN condivisioni_impianto c ON i.id = c.impianto_id AND c.stato = 'accettato'
         WHERE g.id = ? AND (i.utente_id = ? OR c.utente_id = ?)`,
        [id, req.user!.userId, req.user!.userId]
      );
    }

    if (!gateways || gateways.length === 0) {
      return res.status(404).json({ error: 'Gateway non trovato' });
    }

    // Aggiorna
    const updates: string[] = [];
    const values: any[] = [];

    if (nome !== undefined) {
      updates.push('nome = ?');
      values.push(nome);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nessun campo da aggiornare' });
    }

    values.push(id);
    await query(
      `UPDATE gateways SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    const gateway = gateways[0];

    // Emit WebSocket per aggiornamento real-time
    if (gateway.impianto_id) {
      emitGatewayUpdate(gateway.impianto_id, {
        id: gateway.id,
        mac: gateway.mac_address,
        nome: nome !== undefined ? nome : gateway.nome,
        impianto_id: gateway.impianto_id,
        status: gateway.status
      }, 'updated');
    }

    res.json({
      success: true,
      message: 'Gateway aggiornato con successo'
    });
  } catch (error) {
    console.error('Errore updateGateway:', error);
    res.status(500).json({ error: 'Errore durante l\'aggiornamento del gateway' });
  }
};

/**
 * GET /api/gateway/scan
 * Scansiona la rete locale per trovare gateway OmniaPi
 * Usa ping sweep + verifica endpoint /api/status su ogni IP trovato
 */
export const scanGateways = async (req: AuthRequest, res: Response) => {
  try {
    // Rileva subnet dalla rete locale
    let subnet = '192.168.1';
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      const { stdout } = await execAsync("ip route | grep default | awk '{print $3}' | head -1");
      const gatewayIp = stdout.trim();
      if (gatewayIp) {
        const parts = gatewayIp.split('.');
        if (parts.length === 4) {
          subnet = `${parts[0]}.${parts[1]}.${parts[2]}`;
        }
      }
    } catch {
      // Fallback a 192.168.1
    }

    console.log(`🔍 Scan gateway OmniaPi sulla subnet ${subnet}.0/24...`);

    // Usa il discovery esistente per trovare tutti i device in rete
    const devices = await discoverDevices(subnet);
    console.log(`[SCAN] Found ${devices.length} hosts:`, devices.map((d: any) => d.ip_address));
    const gateways: any[] = [];

    // Prova ogni IP trovato in parallelo (con timeout 2s)
    const checkPromises = devices.map(async (device: any) => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);

        console.log(`[SCAN] Trying http://${device.ip_address}/api/status ...`);
        const response = await fetch(`http://${device.ip_address}/api/status`, {
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!response.ok) {
          console.log(`[SCAN] ${device.ip_address} responded ${response.status}`);
          return null;
        }

        const data: any = await response.json();
        console.log(`[SCAN] ${device.ip_address} responded OK:`, JSON.stringify(data));

        // Verifica se è un gateway OmniaPi:
        // Accetta sia "version" che "firmware" come campo versione
        // Deve avere mac address per essere identificabile
        const version = data.version || data.firmware;
        if (data && data.mac && version) {
          return {
            ip: device.ip_address,
            mac: data.mac || device.mac_address,
            version: version,
            nodeCount: data.nodeCount || data.nodes_count || data.node_count || 0,
            mqttConnected: data.mqttConnected || data.mqtt_connected || false,
            uptime: data.uptime || 0,
            source: 'network_scan' as const,
          };
        }
        console.log(`[SCAN] ${device.ip_address} not a gateway (missing mac or version/firmware)`);
      } catch (err: any) {
        // Non è un gateway o non risponde
      }
      return null;
    });

    const results = await Promise.all(checkPromises);
    for (const gw of results) {
      if (gw) gateways.push(gw);
    }

    console.log(`✅ Scan completato: ${gateways.length} gateway trovati su ${devices.length} host`);

    res.json({ gateways });
  } catch (error: any) {
    console.error('Errore scanGateways:', error);
    res.status(500).json({ error: error.message || 'Errore durante la scansione' });
  }
};

// ============================================
// FUNZIONI HELPER (per uso interno/MQTT)
// ============================================

/**
 * Aggiorna stato gateway da MQTT
 * Può cercare per MAC o IP
 */
export const updateGatewayFromMqtt = async (
  mac: string | undefined,
  ip?: string,
  version?: string,
  nodeCount?: number
): Promise<void> => {
  try {
    let existing: any = null;
    let normalizedMac: string | undefined;

    // Prima prova a cercare per MAC (se fornito)
    if (mac) {
      normalizedMac = mac.toUpperCase().replace(/-/g, ':');
      existing = await query(
        'SELECT id, impianto_id, mac_address FROM gateways WHERE mac_address = ?',
        [normalizedMac]
      );
    }

    // Se non trovato per MAC, cerca per IP (fallback)
    if ((!existing || existing.length === 0) && ip) {
      existing = await query(
        'SELECT id, impianto_id, mac_address FROM gateways WHERE ip_address = ?',
        [ip]
      );
      if (existing && existing.length > 0) {
        normalizedMac = existing[0].mac_address;
        console.log(`📡 Gateway trovato per IP ${ip} → MAC: ${normalizedMac}`);
      }
    }

    if (existing && existing.length > 0) {
      // Aggiorna
      const gatewayMac = normalizedMac || existing[0].mac_address;
      await query(
        `UPDATE gateways
         SET ip_address = COALESCE(?, ip_address),
             firmware_version = COALESCE(?, firmware_version),
             node_count = COALESCE(?, node_count),
             status = CASE WHEN impianto_id IS NOT NULL THEN 'online' ELSE 'pending' END,
             last_seen = NOW(),
             mqtt_connected = TRUE
         WHERE mac_address = ?`,
        [ip, version, nodeCount, gatewayMac]
      );
    } else if (normalizedMac) {
      // Crea nuovo solo se abbiamo un MAC (in stato pending)
      await query(
        `INSERT INTO gateways (mac_address, ip_address, firmware_version, node_count, status, last_seen, mqtt_connected)
         VALUES (?, ?, ?, ?, 'pending', NOW(), TRUE)`,
        [normalizedMac, ip, version, nodeCount || 0]
      );
      console.log(`✅ Gateway ${normalizedMac} registrato automaticamente via MQTT`);
    }
  } catch (error) {
    console.error('Errore updateGatewayFromMqtt:', error);
  }
};

/**
 * Segna gateway come offline (per disconnessione MQTT)
 */
export const markGatewayOffline = async (mac: string): Promise<void> => {
  try {
    const normalizedMac = mac.toUpperCase().replace(/-/g, ':');
    await query(
      `UPDATE gateways SET status = 'offline', mqtt_connected = FALSE WHERE mac_address = ?`,
      [normalizedMac]
    );
  } catch (error) {
    console.error('Errore markGatewayOffline:', error);
  }
};

/**
 * POST /api/gateway/cleanup-orphans
 * Resetta i gateway associati a impianti inesistenti
 * Solo ADMIN può eseguire questa operazione
 */
export const cleanupOrphanGateways = async (req: AuthRequest, res: Response) => {
  try {
    // Trova gateway orfani (impianto_id non nullo ma impianto non esiste)
    const orphanGateways: any = await query(
      `SELECT g.id, g.mac_address, g.impianto_id
       FROM gateways g
       WHERE g.impianto_id IS NOT NULL
       AND g.impianto_id NOT IN (SELECT id FROM impianti)`
    );

    if (!orphanGateways || orphanGateways.length === 0) {
      return res.json({
        success: true,
        message: 'Nessun gateway orfano trovato',
        resetCount: 0
      });
    }

    // Resetta i gateway orfani
    const result: any = await query(
      `UPDATE gateways
       SET impianto_id = NULL, status = 'pending'
       WHERE impianto_id IS NOT NULL
       AND impianto_id NOT IN (SELECT id FROM impianti)`
    );

    console.log(`🧹 Reset ${result.affectedRows} gateway orfani:`, orphanGateways.map((g: any) => g.mac_address));

    res.json({
      success: true,
      message: `Reset ${result.affectedRows} gateway orfani`,
      resetCount: result.affectedRows,
      gateways: orphanGateways.map((g: any) => ({
        id: g.id,
        mac: g.mac_address,
        previousImpiantoId: g.impianto_id
      }))
    });
  } catch (error) {
    console.error('Errore cleanupOrphanGateways:', error);
    res.status(500).json({ error: 'Errore durante la pulizia dei gateway orfani' });
  }
};

/**
 * POST /api/gateway/reset/:mac
 * Resetta manualmente un gateway specifico a pending
 * Solo utenti autenticati
 */
export const resetGateway = async (req: AuthRequest, res: Response) => {
  try {
    const { mac } = req.params;
    const normalizedMac = mac.toUpperCase().replace(/-/g, ':');

    // Verifica che il gateway esista
    const gateways: any = await query(
      'SELECT * FROM gateways WHERE mac_address = ?',
      [normalizedMac]
    );

    if (!gateways || gateways.length === 0) {
      return res.status(404).json({ error: 'Gateway non trovato' });
    }

    const gateway = gateways[0];

    // Se ha un impianto associato, verifica che l'utente abbia accesso
    if (gateway.impianto_id) {
      const hasAccess: any = await query(
        `SELECT i.id FROM impianti i
         LEFT JOIN condivisioni_impianto c ON i.id = c.impianto_id AND c.stato = 'accettato'
         WHERE i.id = ? AND (i.utente_id = ? OR c.utente_id = ?)`,
        [gateway.impianto_id, req.user!.userId, req.user!.userId]
      );

      if (!hasAccess || hasAccess.length === 0) {
        return res.status(403).json({ error: 'Non hai accesso a questo gateway' });
      }
    }

    // Resetta il gateway
    await query(
      `UPDATE gateways SET impianto_id = NULL, status = 'pending' WHERE mac_address = ?`,
      [normalizedMac]
    );

    console.log(`🔄 Gateway ${normalizedMac} resettato a pending`);

    res.json({
      success: true,
      message: 'Gateway resettato a pending',
      gateway: {
        id: gateway.id,
        mac: normalizedMac,
        previousImpiantoId: gateway.impianto_id
      }
    });
  } catch (error) {
    console.error('Errore resetGateway:', error);
    res.status(500).json({ error: 'Errore durante il reset del gateway' });
  }
};

// ============================================
// DISCOVER - Trova gateway sulla stessa rete (via IP pubblico)
// ============================================

/**
 * GET /api/gateway/discover
 * Filtra i gateway online che hanno lo stesso IP pubblico dell'utente
 * Per ogni gateway controlla nel DB se è già associato a un impianto
 */
export const discover = async (req: AuthRequest, res: Response) => {
  try {
    // IP dell'utente (da nginx X-Forwarded-For o socket diretto)
    const forwarded = req.headers['x-forwarded-for'];
    const clientIp = typeof forwarded === 'string'
      ? forwarded.split(',')[0].trim()
      : req.socket.remoteAddress || '';

    // Normalizza IPv6-mapped IPv4 (::ffff:127.0.0.1 → 127.0.0.1)
    const normalizedIp = clientIp.replace(/^::ffff:/, '');

    // Se l'IP è locale/privato, l'utente è sulla stessa rete del backend
    // → mostra TUTTI i gateway online (sono per forza sulla stessa LAN)
    const isLocalIp = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|localhost)/.test(normalizedIp);

    console.log(`🔍 [discover] clientIp=${clientIp}, normalized=${normalizedIp}, isLocal=${isLocalIp}, onlineGateways=${onlineGateways.size}`);

    const matchingGateways: any[] = [];
    for (const [, gw] of onlineGateways) {
      if (isLocalIp || gw.public_ip === normalizedIp) {
        matchingGateways.push(gw);
      }
    }

    // Per ogni gateway, controlla nel DB se è associato a un impianto
    const results = await Promise.all(
      matchingGateways.map(async (gw) => {
        const existing: any = await query(
          `SELECT g.impianto_id, i.nome as impianto_nome
           FROM gateways g
           LEFT JOIN impianti i ON g.impianto_id = i.id
           WHERE g.mac_address = ? AND g.impianto_id IS NOT NULL`,
          [gw.mac]
        );

        const isAssociated = existing && existing.length > 0;

        return {
          mac: gw.mac,
          ip: gw.ip,
          version: gw.version,
          uptime: gw.uptime,
          nodes_count: gw.nodes_count,
          available: !isAssociated,
          impianto_nome: isAssociated ? existing[0].impianto_nome : null
        };
      })
    );

    res.json({ success: true, gateways: results });
  } catch (error) {
    console.error('Errore discover:', error);
    res.status(500).json({ error: 'Errore durante la discovery dei gateway' });
  }
};

// ============================================
// SCAN NODI - Avvia/ferma scan e leggi risultati
// ============================================

/**
 * POST /api/gateway/scan/start
 * Avvia scan nodi non commissionati via MQTT
 */
export const startScan = async (req: AuthRequest, res: Response) => {
  if (!acquireGatewayLock('scan')) {
    const busy = getGatewayBusyState();
    return res.status(409).json({ error: 'Gateway occupato', operation: busy.operation, started_at: busy.started_at });
  }

  try {
    const client = getMQTTClient();
    clearScanResults();
    client.publish('omniapi/gateway/scan', JSON.stringify({ action: 'start' }));
    releaseGatewayLock(); // Fire-and-forget: gateway gestisce la scan autonomamente
    console.log('🔍 Scan nodi avviato via MQTT');
    res.json({ success: true, message: 'Scan avviato' });
  } catch (error) {
    releaseGatewayLock();
    console.error('Errore startScan:', error);
    res.status(500).json({ error: 'Errore durante l\'avvio dello scan' });
  }
};

/**
 * POST /api/gateway/scan/stop
 * Ferma scan nodi via MQTT
 */
export const stopScan = async (req: AuthRequest, res: Response) => {
  try {
    const client = getMQTTClient();
    client.publish('omniapi/gateway/scan', JSON.stringify({ action: 'stop' }));
    releaseGatewayLock(); // Release scan lock
    console.log('🛑 Scan nodi fermato via MQTT');
    res.json({ success: true, message: 'Scan fermato' });
  } catch (error) {
    releaseGatewayLock();
    console.error('Errore stopScan:', error);
    res.status(500).json({ error: 'Errore durante lo stop dello scan' });
  }
};

/**
 * GET /api/gateway/scan/results
 * Ritorna i risultati dell'ultimo scan
 */
export const getScanResults = async (req: AuthRequest, res: Response) => {
  try {
    if (scanResults) {
      res.json({ success: true, nodes: scanResults.nodes, count: scanResults.count });
    } else {
      res.json({ success: true, nodes: [], count: 0 });
    }
  } catch (error) {
    console.error('Errore getScanResults:', error);
    res.status(500).json({ error: 'Errore durante il recupero dei risultati scan' });
  }
};

// ============================================
// COMMISSIONING NODI
// ============================================

/**
 * POST /api/gateway/commission
 * Avvia commissioning di un nodo via MQTT
 * Body: { mac: "XX:XX:XX:XX:XX:XX", name?: "Nome" }
 */
export const commissionNode = async (req: AuthRequest, res: Response) => {
  if (!acquireGatewayLock('commission')) {
    const busy = getGatewayBusyState();
    return res.status(409).json({ error: 'Gateway occupato', operation: busy.operation, started_at: busy.started_at });
  }

  try {
    const { mac, name } = req.body;

    if (!mac) {
      releaseGatewayLock();
      return res.status(400).json({ error: 'MAC address richiesto' });
    }

    const normalizedMac = mac.toUpperCase().replace(/-/g, ':');

    // Rimuovi eventuale risultato precedente per questo MAC
    commissionResults.delete(normalizedMac);

    const payload: any = { mac: normalizedMac };
    if (name) payload.name = name;

    const client = getMQTTClient();
    client.publish('omniapi/gateway/commission', JSON.stringify(payload));
    console.log(`🔧 Commissioning avviato per ${normalizedMac}`);

    // Commission is a short operation — release after sending
    releaseGatewayLock();
    res.json({ success: true, message: 'Commissioning avviato' });
  } catch (error) {
    releaseGatewayLock();
    console.error('Errore commissionNode:', error);
    res.status(500).json({ error: 'Errore durante il commissioning' });
  }
};

/**
 * GET /api/gateway/commission/result/:mac
 * Ritorna il risultato del commissioning per un MAC
 */
export const getCommissionResult = async (req: AuthRequest, res: Response) => {
  try {
    const { mac } = req.params;
    const normalizedMac = mac.toUpperCase().replace(/-/g, ':');

    const result = commissionResults.get(normalizedMac);

    if (result) {
      res.json({
        success: true,
        commissioned: result.success,
        message: result.message
      });
    } else {
      res.json({
        success: true,
        commissioned: null,
        message: 'In attesa di risposta'
      });
    }
  } catch (error) {
    console.error('Errore getCommissionResult:', error);
    res.status(500).json({ error: 'Errore durante il recupero del risultato' });
  }
};

