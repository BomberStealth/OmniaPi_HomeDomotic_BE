import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import {
  getGoogleDevices,
  executeGoogleCommand,
  getGoogleDeviceStates,
  getAlexaDevices,
  executeAlexaCommand
} from '../services/smartHomeService';

// ============================================
// SMART HOME CONTROLLER
// Google Home & Alexa Integration
// ============================================

// ============================================
// GOOGLE SMART HOME FULFILLMENT
// ============================================

export const googleFulfillment = async (req: AuthRequest, res: Response) => {
  try {
    const { requestId, inputs } = req.body;

    if (!inputs || inputs.length === 0) {
      return res.json({
        requestId,
        payload: { errorCode: 'protocolError' }
      });
    }

    const input = inputs[0];
    const { intent } = input;

    console.log(`📢 Google Smart Home: ${intent}`);

    switch (intent) {
      case 'action.devices.SYNC':
        return handleGoogleSync(req, res, requestId);

      case 'action.devices.QUERY':
        return handleGoogleQuery(req, res, requestId, input.payload);

      case 'action.devices.EXECUTE':
        return handleGoogleExecute(req, res, requestId, input.payload);

      case 'action.devices.DISCONNECT':
        return res.json({ requestId });

      default:
        return res.json({
          requestId,
          payload: { errorCode: 'notSupported' }
        });
    }
  } catch (error) {
    console.error('Errore Google fulfillment:', error);
    res.status(500).json({ error: 'Internal error' });
  }
};

// SYNC - Restituisce elenco dispositivi
const handleGoogleSync = async (req: AuthRequest, res: Response, requestId: string) => {
  const devices = await getGoogleDevices(req.user!.userId);

  res.json({
    requestId,
    payload: {
      agentUserId: `omnia-${req.user!.userId}`,
      devices
    }
  });
};

// QUERY - Restituisce stato dispositivi
const handleGoogleQuery = async (
  req: AuthRequest,
  res: Response,
  requestId: string,
  payload: any
) => {
  const deviceIds = payload.devices.map((d: any) => d.id);
  const states = await getGoogleDeviceStates(req.user!.userId, deviceIds);

  res.json({
    requestId,
    payload: {
      devices: states
    }
  });
};

// EXECUTE - Esegue comandi
const handleGoogleExecute = async (
  req: AuthRequest,
  res: Response,
  requestId: string,
  payload: any
) => {
  const results: any[] = [];

  for (const command of payload.commands) {
    const deviceIds = command.devices.map((d: any) => d.id);

    for (const execution of command.execution) {
      for (const deviceId of deviceIds) {
        const result = await executeGoogleCommand(
          req.user!.userId,
          deviceId,
          execution.command,
          execution.params || {}
        );

        if (result.success) {
          results.push({
            ids: [deviceId],
            status: 'SUCCESS',
            states: result.states
          });
        } else {
          results.push({
            ids: [deviceId],
            status: 'ERROR',
            errorCode: 'deviceNotFound'
          });
        }
      }
    }
  }

  res.json({
    requestId,
    payload: {
      commands: results
    }
  });
};

// ============================================
// ALEXA SMART HOME
// ============================================

export const alexaDiscovery = async (req: AuthRequest, res: Response) => {
  try {
    const devices = await getAlexaDevices(req.user!.userId);

    res.json({
      event: {
        header: {
          namespace: 'Alexa.Discovery',
          name: 'Discover.Response',
          payloadVersion: '3',
          messageId: `msg-${Date.now()}`
        },
        payload: {
          endpoints: devices
        }
      }
    });
  } catch (error) {
    console.error('Errore Alexa discovery:', error);
    res.status(500).json({ error: 'Internal error' });
  }
};

export const alexaControl = async (req: AuthRequest, res: Response) => {
  try {
    const { directive } = req.body;

    if (!directive) {
      return res.status(400).json({ error: 'Invalid directive' });
    }

    const { header, endpoint, payload } = directive;
    const { namespace, name, correlationToken, messageId } = header;
    const endpointId = endpoint?.endpointId;

    console.log(`📢 Alexa: ${namespace}.${name} -> ${endpointId}`);

    // Gestisci discovery
    if (namespace === 'Alexa.Discovery' && name === 'Discover') {
      return alexaDiscovery(req, res);
    }

    // Gestisci comandi
    if (namespace === 'Alexa.PowerController') {
      const result = await executeAlexaCommand(
        req.user!.userId,
        endpointId,
        namespace,
        name,
        payload
      );

      if (result.success) {
        return res.json({
          event: {
            header: {
              namespace: 'Alexa',
              name: 'Response',
              payloadVersion: '3',
              messageId: `msg-${Date.now()}`,
              correlationToken
            },
            endpoint: { endpointId },
            payload: {}
          },
          context: {
            properties: [{
              namespace: 'Alexa.PowerController',
              name: 'powerState',
              value: result.state?.powerState,
              timeOfSample: new Date().toISOString(),
              uncertaintyInMilliseconds: 0
            }]
          }
        });
      }
    }

    // Report State
    if (namespace === 'Alexa' && name === 'ReportState') {
      const states = await getGoogleDeviceStates(req.user!.userId, [endpointId]);
      const deviceState = states[endpointId];

      return res.json({
        event: {
          header: {
            namespace: 'Alexa',
            name: 'StateReport',
            payloadVersion: '3',
            messageId: `msg-${Date.now()}`,
            correlationToken
          },
          endpoint: { endpointId },
          payload: {}
        },
        context: {
          properties: [{
            namespace: 'Alexa.PowerController',
            name: 'powerState',
            value: deviceState?.on ? 'ON' : 'OFF',
            timeOfSample: new Date().toISOString(),
            uncertaintyInMilliseconds: 0
          }]
        }
      });
    }

    // Comando non supportato
    res.json({
      event: {
        header: {
          namespace: 'Alexa',
          name: 'ErrorResponse',
          payloadVersion: '3',
          messageId: `msg-${Date.now()}`
        },
        payload: {
          type: 'INVALID_DIRECTIVE',
          message: 'Directive not supported'
        }
      }
    });
  } catch (error) {
    console.error('Errore Alexa control:', error);
    res.status(500).json({ error: 'Internal error' });
  }
};

// ============================================
// TEST ENDPOINTS
// ============================================

// GET dispositivi disponibili per smart home
export const getDevices = async (req: AuthRequest, res: Response) => {
  try {
    const googleDevices = await getGoogleDevices(req.user!.userId);
    const alexaDevices = await getAlexaDevices(req.user!.userId);

    res.json({
      google: googleDevices,
      alexa: alexaDevices,
      count: googleDevices.length
    });
  } catch (error) {
    console.error('Errore get smart home devices:', error);
    res.status(500).json({ error: 'Errore durante il recupero dei dispositivi' });
  }
};

// POST test comando
export const testCommand = async (req: AuthRequest, res: Response) => {
  try {
    const { platform, deviceId, command, params } = req.body;

    if (!deviceId || !command) {
      return res.status(400).json({ error: 'deviceId e command sono richiesti' });
    }

    if (platform === 'alexa') {
      const result = await executeAlexaCommand(
        req.user!.userId,
        deviceId,
        'Alexa.PowerController',
        command,
        params
      );
      return res.json(result);
    }

    // Default: Google
    const result = await executeGoogleCommand(
      req.user!.userId,
      deviceId,
      command,
      params || {}
    );

    res.json(result);
  } catch (error) {
    console.error('Errore test command:', error);
    res.status(500).json({ error: 'Errore durante l\'esecuzione del comando' });
  }
};
