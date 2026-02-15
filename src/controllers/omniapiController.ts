import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { getGatewayState, getAllNodes, getNode, getAllLedDevices, getLedState, removeNode, acquireGatewayLock, releaseGatewayLock, getGatewayBusyState, addPendingCommand, updateNodeState } from '../services/omniapiState';
import { omniapiCommand, omniapiDeleteNode } from '../config/mqtt';
import { query } from '../config/database';
import { emitDispositivoUpdate, invalidateMacCache, emitCommandTimeout } from '../socket';
import { logOperation } from '../services/operationLog';

// ============================================
// OMNIAPI CONTROLLER
// Gateway e Nodes ESP-NOW via MQTT
// ============================================

/**
 * GET /api/omniapi/gateway
 * Restituisce lo stato del Gateway OmniaPi
 */
export const getGatewayStatus = async (req: AuthRequest, res: Response) => {
  try {
    const gateway = getGatewayState();

    if (!gateway) {
      return res.json({
        online: false,
        message: 'Gateway non ancora connesso'
      });
    }

    res.json(gateway);
  } catch (error) {
    console.error('Errore getGatewayStatus:', error);
    res.status(500).json({ error: 'Errore durante il recupero dello stato gateway' });
  }
};

/**
 * GET /api/omniapi/nodes
 * Restituisce la lista di tutti i nodi ESP-NOW
 */
export const getNodes = async (req: AuthRequest, res: Response) => {
  try {
    const nodes = getAllNodes();

    res.json({
      nodes,
      count: nodes.length
    });
  } catch (error) {
    console.error('Errore getNodes:', error);
    res.status(500).json({ error: 'Errore durante il recupero dei nodi' });
  }
};

/**
 * GET /api/omniapi/nodes/:mac
 * Restituisce lo stato di un singolo nodo
 */
export const getNodeByMac = async (req: AuthRequest, res: Response) => {
  try {
    const { mac } = req.params;

    if (!mac) {
      return res.status(400).json({ error: 'MAC address richiesto' });
    }

    const node = getNode(mac);

    if (!node) {
      return res.status(404).json({ error: 'Nodo non trovato' });
    }

    res.json(node);
  } catch (error) {
    console.error('Errore getNodeByMac:', error);
    res.status(500).json({ error: 'Errore durante il recupero del nodo' });
  }
};

/**
 * POST /api/omniapi/command
 * Invia comando relay a un nodo
 * Body: { node_mac: string, channel: number, action: "on"|"off"|"toggle" }
 */
export const sendCommand = async (req: AuthRequest, res: Response) => {
  const startTime = Date.now();
  try {
    const { node_mac, channel, action } = req.body;

    // Validazione
    if (!node_mac) {
      return res.status(400).json({ error: 'node_mac richiesto' });
    }

    if (!channel || ![1, 2].includes(channel)) {
      return res.status(400).json({ error: 'channel deve essere 1 o 2' });
    }

    if (!action || !['on', 'off', 'toggle'].includes(action)) {
      return res.status(400).json({ error: 'action deve essere on, off, o toggle' });
    }

    // Verifica che il nodo esista
    const nodeCheckStart = Date.now();
    const node = getNode(node_mac);
    console.log(`⏱️ [TIMING] getNode: ${Date.now() - nodeCheckStart}ms`);

    if (!node) {
      return res.status(404).json({ error: 'Nodo non trovato. Attendere la discovery.' });
    }

    if (!node.online) {
      return res.status(503).json({ error: 'Nodo offline' });
    }

    // Invia comando via MQTT
    const mqttStart = Date.now();
    omniapiCommand(node_mac, channel, action as 'on' | 'off' | 'toggle');
    console.log(`⏱️ [TIMING] MQTT publish: ${Date.now() - mqttStart}ms`);

    const totalTime = Date.now() - startTime;
    console.log(`⏱️ [TIMING] sendCommand TOTAL: ${totalTime}ms`);

    res.json({
      success: true,
      message: `Comando inviato: ${node_mac} ch${channel} ${action}`,
      node_mac,
      channel,
      action,
      timing_ms: totalTime
    });
  } catch (error) {
    console.error('Errore sendCommand:', error);
    res.status(500).json({ error: 'Errore durante l\'invio del comando' });
  }
};

/**
 * POST /api/omniapi/discover
 * Trigger discovery dei nodi (opzionale, il Gateway lo fa automaticamente)
 */
export const triggerDiscovery = async (req: AuthRequest, res: Response) => {
  try {
    // Il Gateway fa discovery automaticamente via heartbeat
    // Questo endpoint è solo per forzare un refresh
    res.json({
      success: true,
      message: 'Discovery richiesta. I nodi verranno aggiornati automaticamente.'
    });
  } catch (error) {
    console.error('Errore triggerDiscovery:', error);
    res.status(500).json({ error: 'Errore durante la discovery' });
  }
};

/**
 * POST /api/omniapi/nodes/:mac/test
 * Test dispositivo - fa toggle 3 volte per identificarlo fisicamente
 */
export const testNode = async (req: AuthRequest, res: Response) => {
  try {
    const { mac } = req.params;

    if (!mac) {
      return res.status(400).json({ error: 'MAC address richiesto' });
    }

    // Verifica che il nodo esista
    const node = getNode(mac);
    if (!node) {
      return res.status(404).json({ error: 'Nodo non trovato' });
    }

    if (!node.online) {
      return res.status(503).json({ error: 'Nodo offline' });
    }

    // Funzione helper per sleep
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    // Esegui 3 toggle con delay (asincrono, non blocca la response)
    (async () => {
      for (let i = 0; i < 3; i++) {
        omniapiCommand(mac, 1, 'on');
        await sleep(400);
        omniapiCommand(mac, 1, 'off');
        await sleep(400);
      }
      console.log(`🔦 Test completato per nodo ${mac}`);
    })();

    res.json({
      success: true,
      message: `Test avviato per ${mac} - toggle 3 volte`
    });
  } catch (error) {
    console.error('Errore testNode:', error);
    res.status(500).json({ error: 'Errore durante il test del nodo' });
  }
};

// ============================================
// REGISTRAZIONE NODI NEL DATABASE
// ============================================

/**
 * GET /api/impianti/:impiantoId/omniapi/nodes
 * Restituisce i nodi OmniaPi registrati per un impianto (dal DB)
 */
export const getRegisteredNodes = async (req: AuthRequest, res: Response) => {
  const startTime = Date.now();
  try {
    const { impiantoId } = req.params;

    // Verifica accesso all'impianto
    const accessCheckStart = Date.now();
    const impianti: any = await query(
      `SELECT i.* FROM impianti i
       LEFT JOIN condivisioni_impianto c ON i.id = c.impianto_id AND c.stato = 'accettato'
       WHERE i.id = ? AND (i.utente_id = ? OR c.utente_id = ?)`,
      [impiantoId, req.user!.userId, req.user!.userId]
    );
    console.log(`⏱️ [TIMING] Access check query: ${Date.now() - accessCheckStart}ms`);

    if (!impianti || impianti.length === 0) {
      return res.status(404).json({ error: 'Impianto non trovato' });
    }

    // Recupera dispositivi OmniaPi dal DB
    const devicesQueryStart = Date.now();
    const dispositivi: any = await query(
      `SELECT d.*, s.nome as stanza_nome
       FROM dispositivi d
       LEFT JOIN stanze s ON d.stanza_id = s.id
       WHERE d.impianto_id = ? AND d.device_type = 'omniapi_node'
       ORDER BY d.nome ASC`,
      [impiantoId]
    );
    console.log(`⏱️ [TIMING] Devices query: ${Date.now() - devicesQueryStart}ms`);

    // Arricchisci con stato real-time dalla memoria
    const enrichStart = Date.now();
    const nodesWithState = (dispositivi || []).map((d: any) => {
      const liveNode = getNode(d.mac_address);
      return {
        // Map mac_address to mac for frontend compatibility
        mac: d.mac_address,
        ...d,
        // Sovrascrivi con dati live se disponibili
        online: liveNode?.online ?? false,
        rssi: liveNode?.rssi ?? d.omniapi_info?.rssi ?? 0,
        relay1: liveNode?.relay1 ?? false,
        relay2: liveNode?.relay2 ?? false,
        firmware_version: liveNode?.version ?? d.omniapi_info?.version ?? 'unknown',
        lastSeen: liveNode?.lastSeen ?? d.aggiornato_il
      };
    });
    console.log(`⏱️ [TIMING] State enrichment: ${Date.now() - enrichStart}ms`);

    const totalTime = Date.now() - startTime;
    console.log(`⏱️ [TIMING] getRegisteredNodes TOTAL: ${totalTime}ms (${nodesWithState.length} nodes)`);

    res.json({
      nodes: nodesWithState,
      count: nodesWithState.length,
      timing_ms: totalTime
    });
  } catch (error) {
    console.error('Errore getRegisteredNodes:', error);
    res.status(500).json({ error: 'Errore durante il recupero dei nodi registrati' });
  }
};

/**
 * GET /api/impianti/:impiantoId/omniapi/available
 * Restituisce i nodi E LED Strip disponibili (online ma non ancora registrati)
 */
export const getAvailableNodes = async (req: AuthRequest, res: Response) => {
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

    // Prendi tutti i nodi relay live
    const liveNodes = getAllNodes();

    // Prendi tutti i LED Strip live
    const liveLedDevices = getAllLedDevices();

    // Prendi i MAC già registrati (sia relay che LED)
    const registered: any = await query(
      `SELECT mac_address, device_type FROM dispositivi WHERE device_type IN ('omniapi_node', 'omniapi_led')`
    );
    const registeredMacs = new Set((registered || []).map((r: any) => r.mac_address));

    // Filtra relay nodes non registrati
    const availableNodes = liveNodes
      .filter(node => !registeredMacs.has(node.mac))
      .map(node => ({
        ...node,
        device_type: 'omniapi_node' as const
      }));

    // Filtra LED Strip non registrati
    const availableLeds = liveLedDevices
      .filter(led => !registeredMacs.has(led.mac))
      .map(led => ({
        mac: led.mac,
        online: led.online,
        rssi: 0, // LED non hanno rssi
        version: 'LED',
        relay1: false,
        relay2: false,
        lastSeen: led.lastSeen,
        device_type: 'omniapi_led' as const,
        // Dati LED specifici
        ledState: {
          power: led.power,
          r: led.r,
          g: led.g,
          b: led.b,
          brightness: led.brightness,
          effect: led.effect
        }
      }));

    // Combina entrambi
    const allAvailable = [...availableNodes, ...availableLeds];

    res.json({
      nodes: allAvailable,
      count: allAvailable.length
    });
  } catch (error) {
    console.error('Errore getAvailableNodes:', error);
    res.status(500).json({ error: 'Errore durante il recupero dei nodi disponibili' });
  }
};

/**
 * POST /api/impianti/:impiantoId/omniapi/register
 * Registra un nodo ESP-NOW o LED Strip come dispositivo nel database
 * Body: { mac: string, nome: string, stanza_id?: number, device_type?: 'omniapi_node' | 'omniapi_led' }
 */
export const registerNode = async (req: AuthRequest, res: Response) => {
  try {
    const { impiantoId } = req.params;
    const { mac, nome, stanza_id, device_type } = req.body;

    console.log('📝 registerNode called:', { impiantoId, mac, nome, device_type, stanza_id });

    if (!mac || !nome) {
      console.log('📝 registerNode: MAC o nome mancanti');
      return res.status(400).json({ error: 'MAC e nome sono richiesti' });
    }

    // Determina il tipo di dispositivo (default: omniapi_node)
    const deviceType = device_type === 'omniapi_led' ? 'omniapi_led' : 'omniapi_node';
    const isLed = deviceType === 'omniapi_led';
    console.log('📝 registerNode: deviceType=', deviceType, 'isLed=', isLed);

    // Verifica accesso all'impianto
    const impianti: any = await query(
      `SELECT i.* FROM impianti i
       LEFT JOIN condivisioni_impianto c ON i.id = c.impianto_id AND c.stato = 'accettato'
       WHERE i.id = ? AND (i.utente_id = ? OR c.utente_id = ?)`,
      [impiantoId, req.user!.userId, req.user!.userId]
    );

    console.log('📝 registerNode: impianti trovati:', impianti?.length);

    if (!impianti || impianti.length === 0) {
      return res.status(404).json({ error: 'Impianto non trovato' });
    }

    // Verifica che il dispositivo esista (sia online)
    let liveDevice: any = null;
    if (isLed) {
      liveDevice = getLedState(mac);
      console.log('📝 registerNode: getLedState result:', liveDevice);
      if (!liveDevice) {
        return res.status(404).json({ error: 'LED Strip non trovato. Assicurati che sia online.' });
      }
    } else {
      liveDevice = getNode(mac);
      console.log('📝 registerNode: getNode result:', liveDevice);
      if (!liveDevice) {
        return res.status(404).json({ error: 'Nodo non trovato. Assicurati che sia online.' });
      }
    }

    // Verifica che non sia già registrato
    const existing: any = await query(
      `SELECT * FROM dispositivi WHERE mac_address = ?`,
      [mac]
    );

    if (existing && existing.length > 0) {
      return res.status(409).json({
        error: 'Dispositivo già registrato',
        impianto_id: existing[0].impianto_id
      });
    }

    // Recupera IP gateway
    const gateway = getGatewayState();
    const gatewayIp = gateway?.ip || '192.168.1.205';

    // Costruisci omniapi_info in base al tipo
    const omniapiInfo = isLed
      ? {
          type: 'led_strip',
          power: liveDevice.power,
          r: liveDevice.r,
          g: liveDevice.g,
          b: liveDevice.b,
          brightness: liveDevice.brightness,
          effect: liveDevice.effect
        }
      : {
          version: liveDevice.version,
          rssi: liveDevice.rssi,
          relay1: liveDevice.relay1,
          relay2: liveDevice.relay2
        };

    // Determina power_state dal dispositivo live
    const powerState = isLed
      ? (liveDevice.power ? 1 : 0)
      : (liveDevice.relay1 ? 1 : 0);

    // Inserisci nel DB con stato real-time
    const result: any = await query(
      `INSERT INTO dispositivi
       (impianto_id, stanza_id, tipo, device_type, nome, mac_address, gateway_ip, stato, power_state, omniapi_info)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'online', ?, ?)`,
      [
        impiantoId,
        stanza_id || null,
        isLed ? 'led_strip' : 'luce',
        deviceType,
        nome,
        mac,
        gatewayIp,
        powerState,
        JSON.stringify(omniapiInfo)
      ]
    );

    // Recupera il dispositivo appena creato
    const dispositivo: any = await query(
      `SELECT * FROM dispositivi WHERE id = ?`,
      [result.insertId]
    );

    const nuovoDispositivo = dispositivo?.[0] || dispositivo;

    // Invalida cache MAC→impianto (ora il MAC è associato a un impianto)
    invalidateMacCache(mac);

    // Emit WebSocket per aggiornamento real-time
    emitDispositivoUpdate(parseInt(impiantoId), nuovoDispositivo, 'created');

    logOperation(parseInt(impiantoId), 'commission', 'success', { mac, nome, device_type: deviceType });

    res.status(201).json({
      success: true,
      message: isLed ? 'LED Strip registrato con successo' : 'Nodo registrato con successo',
      dispositivo: nuovoDispositivo
    });
  } catch (error: any) {
    console.error('Errore registerNode:', error);
    logOperation(parseInt(req.params.impiantoId) || null, 'commission', 'error', { mac: req.body?.mac, error: error.message });
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Dispositivo già registrato' });
    }
    res.status(500).json({ error: 'Errore durante la registrazione del dispositivo' });
  }
};

/**
 * DELETE /api/omniapi/nodes/:id
 * Rimuove un nodo dal database E da tutte le scene
 */
export const unregisterNode = async (req: AuthRequest, res: Response) => {
  if (!acquireGatewayLock('delete')) {
    const busy = getGatewayBusyState();
    return res.status(409).json({ error: 'Gateway occupato', operation: busy.operation, started_at: busy.started_at });
  }

  try {
    const { id } = req.params;
    const deviceId = parseInt(id);

    // Verifica che il dispositivo esista e sia un nodo OmniaPi
    const dispositivi: any = await query(
      `SELECT d.*, d.impianto_id FROM dispositivi d
       JOIN impianti i ON d.impianto_id = i.id
       LEFT JOIN condivisioni_impianto c ON i.id = c.impianto_id AND c.stato = 'accettato'
       WHERE d.id = ? AND d.device_type IN ('omniapi_node', 'omniapi_led')
       AND (i.utente_id = ? OR c.utente_id = ?)`,
      [deviceId, req.user!.userId, req.user!.userId]
    );

    if (!dispositivi || dispositivi.length === 0) {
      return res.status(404).json({ error: 'Nodo non trovato' });
    }

    const dispositivo = dispositivi[0];

    // 1. Rimuovi il dispositivo dalle scene dell'impianto (cascade)
    const sceneAggiornate = await removeDeviceFromScenes(deviceId, dispositivo.impianto_id);

    // 2. Elimina dal DB
    await query('DELETE FROM dispositivi WHERE id = ?', [deviceId]);

    // Invalida cache MAC→impianto (il MAC non è più associato)
    if (dispositivo.mac_address) invalidateMacCache(dispositivo.mac_address);

    // 3. Pubblica comando MQTT al gateway per rimuovere il nodo dalla mesh
    const mac = dispositivo.mac_address;
    let gatewayConfirmed = false;

    console.log(`🔍 [DELETE-NODE] MAC from DB: "${mac}" (type: ${typeof mac})`);
    if (mac) {
      omniapiDeleteNode(mac);
      removeNode(mac);
      console.log(`🔍 [DELETE-NODE] MQTT publish + memory cleanup done for ${mac}`);

      // Poll in-memory state to verify gateway processed the delete
      const normalizedMac = mac.toUpperCase().replace(/-/g, ':');
      const POLL_INTERVAL = 2000;
      const POLL_TIMEOUT = 15000;
      const pollStart = Date.now();

      while (Date.now() - pollStart < POLL_TIMEOUT) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL));
        const nodes = getAllNodes();
        const stillExists = nodes.some(n => n.mac.toUpperCase().replace(/-/g, ':') === normalizedMac);
        if (!stillExists) {
          gatewayConfirmed = true;
          console.log(`🔍 [DELETE-NODE] Gateway confirmed: ${mac} no longer in mesh`);
          break;
        }
      }

      if (!gatewayConfirmed) {
        console.warn(`⚠️ [DELETE-NODE] Timeout: ${mac} may still be in gateway mesh`);
      }
    } else {
      console.warn(`⚠️ [DELETE-NODE] No mac_address for device ID ${deviceId}, skipping MQTT`);
      gatewayConfirmed = true; // No MAC = nothing to confirm
    }

    console.log(`🗑️ Nodo ${dispositivo.nome} (ID: ${deviceId}, MAC: ${mac}) eliminato. Scene aggiornate: ${sceneAggiornate}. Gateway confirmed: ${gatewayConfirmed}`);

    // Emit WebSocket per aggiornamento real-time
    emitDispositivoUpdate(dispositivo.impianto_id, { id: deviceId, ...dispositivo }, 'deleted');

    logOperation(dispositivo.impianto_id, 'delete_node', gatewayConfirmed ? 'success' : 'timeout', {
      mac, nome: dispositivo.nome, device_id: deviceId, gateway_confirmed: gatewayConfirmed, scene_aggiornate: sceneAggiornate
    });

    releaseGatewayLock();
    res.json({
      success: true,
      message: 'Nodo rimosso con successo',
      sceneAggiornate,
      gateway_confirmed: gatewayConfirmed
    });
  } catch (error: any) {
    releaseGatewayLock();
    console.error('Errore unregisterNode:', error);
    logOperation(null, 'delete_node', 'error', { device_id: req.params.id, error: error.message });
    res.status(500).json({ error: 'Errore durante la rimozione del nodo' });
  }
};

/**
 * PUT /api/omniapi/nodes/:id
 * Aggiorna nome o stanza di un nodo
 * Body: { nome?: string, stanza_id?: number }
 */
export const updateRegisteredNode = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { nome, stanza_id } = req.body;

    // Verifica che il dispositivo esista e sia un nodo OmniaPi
    const dispositivi: any = await query(
      `SELECT d.* FROM dispositivi d
       JOIN impianti i ON d.impianto_id = i.id
       LEFT JOIN condivisioni_impianto c ON i.id = c.impianto_id AND c.stato = 'accettato'
       WHERE d.id = ? AND d.device_type = 'omniapi_node'
       AND (i.utente_id = ? OR c.utente_id = ?)`,
      [id, req.user!.userId, req.user!.userId]
    );

    if (!dispositivi || dispositivi.length === 0) {
      return res.status(404).json({ error: 'Nodo non trovato' });
    }

    // Costruisci query di update
    const updates: string[] = [];
    const values: any[] = [];

    if (nome !== undefined) {
      updates.push('nome = ?');
      values.push(nome);
    }

    if (stanza_id !== undefined) {
      updates.push('stanza_id = ?');
      values.push(stanza_id || null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nessun campo da aggiornare' });
    }

    values.push(id);
    await query(
      `UPDATE dispositivi SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    const dispositivo = dispositivi[0];

    // Recupera dispositivo aggiornato per emit
    const dispositivoAggiornato: any = await query(
      'SELECT * FROM dispositivi WHERE id = ?',
      [id]
    );

    // Emit WebSocket per aggiornamento real-time
    if (dispositivoAggiornato && dispositivoAggiornato.length > 0) {
      emitDispositivoUpdate(dispositivo.impianto_id, dispositivoAggiornato[0], 'updated');
    }

    res.json({
      success: true,
      message: 'Nodo aggiornato con successo'
    });
  } catch (error) {
    console.error('Errore updateRegisteredNode:', error);
    res.status(500).json({ error: 'Errore durante l\'aggiornamento del nodo' });
  }
};

/**
 * POST /api/omniapi/nodes/:id/control
 * Controlla un nodo registrato (alternativa a /api/omniapi/command)
 * Body: { channel: 1|2, action: "on"|"off"|"toggle" }
 */
export const controlRegisteredNode = async (req: AuthRequest, res: Response) => {
  const startTime = Date.now();
  try {
    const { id } = req.params;
    const { channel, action } = req.body;

    // Validazione
    if (!channel || ![1, 2].includes(channel)) {
      return res.status(400).json({ error: 'channel deve essere 1 o 2' });
    }

    if (!action || !['on', 'off', 'toggle'].includes(action)) {
      return res.status(400).json({ error: 'action deve essere on, off, o toggle' });
    }

    // Verifica che il dispositivo esista e sia un nodo OmniaPi
    const dbQueryStart = Date.now();
    const dispositivi: any = await query(
      `SELECT d.* FROM dispositivi d
       JOIN impianti i ON d.impianto_id = i.id
       LEFT JOIN condivisioni_impianto c ON i.id = c.impianto_id AND c.stato = 'accettato'
       WHERE d.id = ? AND d.device_type = 'omniapi_node'
       AND (i.utente_id = ? OR c.utente_id = ?)`,
      [id, req.user!.userId, req.user!.userId]
    );
    console.log(`⏱️ [TIMING] DB device lookup: ${Date.now() - dbQueryStart}ms`);

    if (!dispositivi || dispositivi.length === 0) {
      return res.status(404).json({ error: 'Nodo non trovato' });
    }

    const dispositivo = dispositivi[0];
    const mac = dispositivo.mac_address;

    // Verifica che il nodo sia online
    const nodeCheckStart = Date.now();
    const liveNode = getNode(mac);
    console.log(`⏱️ [TIMING] getNode (memory): ${Date.now() - nodeCheckStart}ms`);

    if (!liveNode?.online) {
      return res.status(503).json({ error: 'Nodo offline' });
    }

    // Invia comando via MQTT
    const mqttStart = Date.now();
    omniapiCommand(mac, channel, action as 'on' | 'off' | 'toggle');
    console.log(`⏱️ [TIMING] MQTT publish: ${Date.now() - mqttStart}ms`);

    // Register pending command with 5s timeout
    const impiantoId = dispositivo.impianto_id;
    addPendingCommand(mac, channel, action, impiantoId, (_key, cmd) => {
      // Timeout: command not confirmed, but node may still be online
      // (don't mark offline — gateway heartbeat is the source of truth for online status)
      // Emit COMMAND_TIMEOUT to frontend so it can rollback the optimistic update
      emitCommandTimeout(impiantoId, { mac: cmd.mac, channel: cmd.channel });
    });

    const totalTime = Date.now() - startTime;
    console.log(`⏱️ [TIMING] controlRegisteredNode TOTAL: ${totalTime}ms`);

    res.json({
      success: true,
      message: `Comando inviato: ${dispositivo.nome} ch${channel} ${action}`,
      dispositivo_id: id,
      channel,
      action,
      timing_ms: totalTime
    });
  } catch (error) {
    console.error('Errore controlRegisteredNode:', error);
    res.status(500).json({ error: 'Errore durante il controllo del nodo' });
  }
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Rimuove un dispositivo da tutte le scene dell'impianto
 * @returns numero di scene aggiornate
 */
async function removeDeviceFromScenes(deviceId: number, impiantoId?: number): Promise<number> {
  try {
    // Recupera le scene (filtra per impianto se specificato)
    const scene: any = impiantoId
      ? await query('SELECT id, azioni FROM scene WHERE impianto_id = ?', [impiantoId])
      : await query('SELECT id, azioni FROM scene');

    let sceneAggiornate = 0;
    for (const scena of scene || []) {
      try {
        // Gestisci sia stringa JSON che array già parsato
        let azioni: any[] = [];
        if (typeof scena.azioni === 'string' && scena.azioni.trim()) {
          azioni = JSON.parse(scena.azioni);
        } else if (Array.isArray(scena.azioni)) {
          azioni = scena.azioni;
        }

        if (!Array.isArray(azioni) || azioni.length === 0) continue;

        // Filtra le azioni che non contengono questo dispositivo
        const azioniAggiornate = azioni.filter((a: any) =>
          a.dispositivo_id !== deviceId && a.device_id !== deviceId
        );

        // Se c'è stata una modifica, aggiorna la scena
        if (azioniAggiornate.length !== azioni.length) {
          await query(
            'UPDATE scene SET azioni = ? WHERE id = ?',
            [JSON.stringify(azioniAggiornate), scena.id]
          );
          sceneAggiornate++;
          console.log(`📝 Rimosso dispositivo ${deviceId} dalla scena ${scena.id}`);
        }
      } catch (parseError) {
        console.error(`Errore parsing azioni scena ${scena.id}:`, parseError);
      }
    }

    if (sceneAggiornate > 0) {
      console.log(`✅ Dispositivo ${deviceId} rimosso da ${sceneAggiornate} scene`);
    }
    return sceneAggiornate;
  } catch (error) {
    console.error('Errore removeDeviceFromScenes:', error);
    return 0;
  }
}
