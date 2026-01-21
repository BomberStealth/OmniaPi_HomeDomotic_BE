import { Request, Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';

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

    // Verifica accesso all'impianto
    const impianti: any = await query(
      `SELECT i.* FROM impianti i
       LEFT JOIN condivisioni_impianto c ON i.id = c.impianto_id AND c.stato = 'accettato'
       WHERE i.id = ? AND (i.utente_id = ? OR c.utente_id = ?)`,
      [impiantoId, req.user!.userId, req.user!.userId]
    );

    if (!impianti || impianti.length === 0) {
      return res.status(404).json({ error: 'Impianto non trovato' });
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

    // Calcola se è online (last_seen negli ultimi 2 minuti)
    const isOnline = gateway.last_seen &&
      (new Date().getTime() - new Date(gateway.last_seen).getTime()) < 120000;

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

    // Verifica accesso all'impianto
    const impianti: any = await query(
      `SELECT i.* FROM impianti i
       LEFT JOIN condivisioni_impianto c ON i.id = c.impianto_id AND c.stato = 'accettato'
       WHERE i.id = ? AND (i.utente_id = ? OR c.utente_id = ?)`,
      [impiantoId, req.user!.userId, req.user!.userId]
    );

    if (!impianti || impianti.length === 0) {
      return res.status(404).json({ error: 'Impianto non trovato' });
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
    const gateways: any = await query(
      'SELECT * FROM gateways WHERE mac_address = ?',
      [normalizedMac]
    );

    if (!gateways || gateways.length === 0) {
      return res.status(404).json({ error: 'Gateway non trovato. Assicurati che sia online.' });
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

    res.json({
      success: true,
      message: 'Gateway associato con successo',
      gateway: {
        id: gateway.id,
        mac: normalizedMac,
        nome: nome || gateway.nome,
        impianto_id: parseInt(impiantoId)
      }
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

    // Verifica accesso all'impianto
    const impianti: any = await query(
      `SELECT i.* FROM impianti i
       LEFT JOIN condivisioni_impianto c ON i.id = c.impianto_id AND c.stato = 'accettato'
       WHERE i.id = ? AND (i.utente_id = ? OR c.utente_id = ?)`,
      [impiantoId, req.user!.userId, req.user!.userId]
    );

    if (!impianti || impianti.length === 0) {
      return res.status(404).json({ error: 'Impianto non trovato' });
    }

    // Trova e disassocia gateway
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

    // Verifica che l'utente abbia accesso al gateway (tramite impianto)
    const gateways: any = await query(
      `SELECT g.* FROM gateways g
       JOIN impianti i ON g.impianto_id = i.id
       LEFT JOIN condivisioni_impianto c ON i.id = c.impianto_id AND c.stato = 'accettato'
       WHERE g.id = ? AND (i.utente_id = ? OR c.utente_id = ?)`,
      [id, req.user!.userId, req.user!.userId]
    );

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

    res.json({
      success: true,
      message: 'Gateway aggiornato con successo'
    });
  } catch (error) {
    console.error('Errore updateGateway:', error);
    res.status(500).json({ error: 'Errore durante l\'aggiornamento del gateway' });
  }
};

// ============================================
// FUNZIONI HELPER (per uso interno/MQTT)
// ============================================

/**
 * Aggiorna stato gateway da MQTT
 */
export const updateGatewayFromMqtt = async (
  mac: string,
  ip?: string,
  version?: string,
  nodeCount?: number
): Promise<void> => {
  try {
    const normalizedMac = mac.toUpperCase().replace(/-/g, ':');

    // Verifica se esiste
    const existing: any = await query(
      'SELECT id, impianto_id FROM gateways WHERE mac_address = ?',
      [normalizedMac]
    );

    if (existing && existing.length > 0) {
      // Aggiorna
      await query(
        `UPDATE gateways
         SET ip_address = COALESCE(?, ip_address),
             firmware_version = COALESCE(?, firmware_version),
             node_count = COALESCE(?, node_count),
             status = CASE WHEN impianto_id IS NOT NULL THEN 'online' ELSE 'pending' END,
             last_seen = NOW(),
             mqtt_connected = TRUE
         WHERE mac_address = ?`,
        [ip, version, nodeCount, normalizedMac]
      );
    } else {
      // Crea nuovo (in stato pending)
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
