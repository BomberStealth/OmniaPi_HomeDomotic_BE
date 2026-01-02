import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { getGatewayState, getAllNodes, getNode } from '../services/omniapiState';
import { omniapiCommand } from '../config/mqtt';

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
    const node = getNode(node_mac);
    if (!node) {
      return res.status(404).json({ error: 'Nodo non trovato. Attendere la discovery.' });
    }

    if (!node.online) {
      return res.status(503).json({ error: 'Nodo offline' });
    }

    // Invia comando via MQTT
    omniapiCommand(node_mac, channel, action as 'on' | 'off' | 'toggle');

    res.json({
      success: true,
      message: `Comando inviato: ${node_mac} ch${channel} ${action}`,
      node_mac,
      channel,
      action
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
