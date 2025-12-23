import { Request, Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { exec } from 'child_process';
import { promisify } from 'util';
import { canControlDeviceById } from '../services/deviceGuard';

// @ts-ignore - evilscan non ha types
import Evilscan from 'evilscan';

const execAsync = promisify(exec);

// ============================================
// TASMOTA CONTROLLER
// ============================================

// GET dispositivi Tasmota per impianto
export const getDispositivi = async (req: AuthRequest, res: Response) => {
  try {
    const { impiantoId } = req.params;

    // Verifica che l'utente abbia accesso all'impianto
    const [impianti]: any = await query(
      `SELECT i.* FROM impianti i
       LEFT JOIN impianti_condivisi ic ON i.id = ic.impianto_id
       WHERE i.id = ? AND (i.utente_id = ? OR ic.utente_id = ?)`,
      [impiantoId, req.user!.userId, req.user!.userId]
    );

    if (impianti.length === 0) {
      return res.status(404).json({ error: 'Impianto non trovato' });
    }

    const [dispositivi]: any = await query(
      'SELECT * FROM dispositivi WHERE impianto_id = ? ORDER BY nome ASC',
      [impiantoId]
    );

    // Assicurati che sia sempre un array valido (no null/undefined)
    let dispositiviArray: any[] = [];
    if (Array.isArray(dispositivi)) {
      dispositiviArray = dispositivi.filter((d: any) => d !== null && d !== undefined);
    } else if (dispositivi && typeof dispositivi === 'object') {
      dispositiviArray = [dispositivi];
    }
    res.json(dispositiviArray);
  } catch (error) {
    console.error('Errore get dispositivi:', error);
    res.status(500).json({ error: 'Errore durante il recupero dei dispositivi' });
  }
};

// POST scansione rete per dispositivi Tasmota
export const scanTasmota = async (req: AuthRequest, res: Response) => {
  try {
    const { impiantoId } = req.params;
    const { networkRange } = req.body; // es. "192.168.1.0/24"

    // Verifica che l'utente abbia accesso all'impianto
    const [impianti]: any = await query(
      `SELECT i.* FROM impianti i
       LEFT JOIN impianti_condivisi ic ON i.id = ic.impianto_id
       WHERE i.id = ? AND (i.utente_id = ? OR ic.utente_id = ?)`,
      [impiantoId, req.user!.userId, req.user!.userId]
    );

    if (impianti.length === 0) {
      return res.status(404).json({ error: 'Impianto non trovato' });
    }

    // Determina range di rete (default: 192.168.1.0/24)
    let target = networkRange || '192.168.1.0/24';

    // Se non fornito, tenta di auto-rilevare
    if (!networkRange) {
      try {
        const { stdout } = await execAsync('ip route | grep default');
        const network = stdout.match(/(\d+\.\d+\.\d+\.)\d+/)?.[1];
        if (network) {
          target = `${network}0/24`;
        }
      } catch (err) {
        console.log('Auto-rilevamento rete fallito, uso default 192.168.1.0/24');
      }
    }

    console.log(`🔍 Avvio scansione rete: ${target} (porta 80)`);

    // Scansione porta 80 su range IP
    const openHosts: string[] = [];

    await new Promise<void>((resolve, reject) => {
      const scanner = new Evilscan({
        target,
        port: '80',
        status: 'O', // Solo porte aperte
        concurrency: 100,
        timeout: 2000
      });

      scanner.on('result', (data: any) => {
        if (data.status === 'open') {
          openHosts.push(data.ip);
          console.log(`✅ Porta 80 aperta su: ${data.ip}`);
        }
      });

      scanner.on('done', () => {
        resolve();
      });

      scanner.on('error', (err: any) => {
        console.error('Errore scanner:', err);
        reject(err);
      });

      scanner.run();
    });

    console.log(`📊 Trovati ${openHosts.length} host con porta 80 aperta`);

    // Verifica quali sono dispositivi Tasmota
    const dispositiviTrovati: any[] = [];

    for (const ip of openHosts) {
      try {
        // Tenta di chiamare endpoint Tasmota /cm?cmnd=Status%200
        const response = await fetch(`http://${ip}/cm?cmnd=Status%200`, {
          method: 'GET',
          signal: AbortSignal.timeout(3000)
        });

        if (response.ok) {
          const data = await response.json() as any;

          // Verifica se è un dispositivo Tasmota (ha campo "Status")
          if (data.Status || data.StatusNET || data.StatusPRM) {
            const deviceInfo = {
              ip_address: ip,
              nome: data.Status?.DeviceName || data.StatusNET?.Hostname || `Tasmota_${ip.split('.').pop()}`,
              mac: data.StatusNET?.Mac || 'unknown',
              firmware: data.StatusFWR?.Version || 'unknown',
              friendly_name: data.Status?.FriendlyName?.[0] || data.Status?.DeviceName || '',
              tasmota_model: data.Status?.Module || 'Generic',
              topic: data.Status?.Topic || `tasmota_${data.StatusNET?.Mac?.replace(/:/g, '')}`,
              potenza: data.StatusSNS?.ENERGY?.Power || 0,
              gia_aggiunto: false
            };

            // Verifica se già presente nel database
            const [existing]: any = await query(
              'SELECT id FROM dispositivi WHERE ip_address = ? AND impianto_id = ?',
              [ip, impiantoId]
            );

            if (existing && existing.length > 0 && existing[0] && existing[0].bloccato) {
              deviceInfo.gia_aggiunto = true;
            }

            dispositiviTrovati.push(deviceInfo);
            console.log(`🏠 Tasmota trovato: ${deviceInfo.nome} (${ip})`);
          }
        }
      } catch (err) {
        // Non è un dispositivo Tasmota o non risponde
        continue;
      }
    }

    console.log(`✅ Scansione completata: ${dispositiviTrovati.length} dispositivi Tasmota trovati`);

    res.json({
      success: true,
      message: 'Scansione completata',
      dispositivi: dispositiviTrovati,
      network: target,
      total_hosts_scanned: openHosts.length
    });
  } catch (error) {
    console.error('Errore scan Tasmota:', error);
    res.status(500).json({ error: 'Errore durante la scansione della rete' });
  }
};

// POST aggiungi dispositivo Tasmota
export const addDispositivo = async (req: AuthRequest, res: Response) => {
  try {
    const { impiantoId } = req.params;
    const { ip_address, nome, tipo } = req.body;

    if (!ip_address || !nome) {
      return res.status(400).json({ error: 'IP e nome sono richiesti' });
    }

    // Verifica che l'utente abbia accesso all'impianto
    const [impianti]: any = await query(
      `SELECT i.* FROM impianti i
       LEFT JOIN impianti_condivisi ic ON i.id = ic.impianto_id
       WHERE i.id = ? AND (i.utente_id = ? OR ic.utente_id = ?)`,
      [impiantoId, req.user!.userId, req.user!.userId]
    );

    if (impianti.length === 0) {
      return res.status(404).json({ error: 'Impianto non trovato' });
    }

    // Verifica se il dispositivo è già registrato (tramite MAC address)
    // In un'implementazione reale, fare una richiesta HTTP al dispositivo Tasmota
    // per ottenere MAC address e altre info
    const mac_address = `00:00:00:00:00:${Math.floor(Math.random() * 100).toString().padStart(2, '0')}`;

    const [existing]: any = await query(
      'SELECT * FROM dispositivi WHERE mac_address = ?',
      [mac_address]
    );

    if (existing && existing.length > 0 && existing[0].bloccato) {
      return res.status(400).json({
        error: 'Dispositivo già registrato su un altro account',
        impianto_id: existing[0].impianto_id
      });
    }

    const topic_mqtt = `tasmota_${mac_address.replace(/:/g, '')}`;

    try {
      const result: any = await query(
        `INSERT INTO dispositivi
         (impianto_id, nome, tipo, ip_address, mac_address, topic_mqtt, stato, bloccato)
         VALUES (?, ?, ?, ?, ?, ?, 'offline', FALSE)`,
        [impiantoId, nome, tipo || 'generico', ip_address, mac_address, topic_mqtt]
      );

      const [dispositivo]: any = await query('SELECT * FROM dispositivi WHERE id = ?', [result.insertId]);

      res.status(201).json(dispositivo[0]);
    } catch (insertError: any) {
      if (insertError.code === 'ER_DUP_ENTRY') {
        // Recupera info del dispositivo esistente per mostrare l'impianto
        const [existing]: any = await query(
          `SELECT d.*, i.nome as impianto_nome
           FROM dispositivi d
           JOIN impianti i ON d.impianto_id = i.id
           WHERE d.ip_address = ?`,
          [ip_address]
        );

        if (existing && existing.length > 0) {
          return res.status(409).json({
            error: `Dispositivo già collegato all'impianto "${existing[0].impianto_nome}"`,
            impianto_nome: existing[0].impianto_nome,
            impianto_id: existing[0].impianto_id
          });
        }
        return res.status(400).json({ error: 'Dispositivo già registrato' });
      }
      throw insertError;
    }
  } catch (error: any) {
    console.error('Errore add dispositivo:', error);
    res.status(500).json({ error: 'Errore durante l\'aggiunta del dispositivo' });
  }
};

// DELETE rimuovi dispositivo
export const deleteDispositivo = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Verifica che il dispositivo esista e che l'utente abbia accesso
    const [dispositivi]: any = await query(
      `SELECT d.* FROM dispositivi d
       JOIN impianti i ON d.impianto_id = i.id
       LEFT JOIN impianti_condivisi ic ON i.id = ic.impianto_id
       WHERE d.id = ? AND (i.utente_id = ? OR ic.utente_id = ?)`,
      [id, req.user!.userId, req.user!.userId]
    );

    if (dispositivi.length === 0) {
      return res.status(404).json({ error: 'Dispositivo non trovato' });
    }

    await query('DELETE FROM dispositivi WHERE id = ?', [id]);

    res.json({ message: 'Dispositivo rimosso con successo' });
  } catch (error) {
    console.error('Errore delete dispositivo:', error);
    res.status(500).json({ error: 'Errore durante la rimozione del dispositivo' });
  }
};

// PUT aggiorna stanza dispositivo
export const updateStanzaDispositivo = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { stanza_id } = req.body;

    // Verifica che il dispositivo esista e che l'utente abbia accesso
    const [dispositivi]: any = await query(
      `SELECT d.* FROM dispositivi d
       JOIN impianti i ON d.impianto_id = i.id
       LEFT JOIN impianti_condivisi ic ON i.id = ic.impianto_id
       WHERE d.id = ? AND (i.utente_id = ? OR ic.utente_id = ?)`,
      [id, req.user!.userId, req.user!.userId]
    );

    if (dispositivi.length === 0) {
      return res.status(404).json({ error: 'Dispositivo non trovato' });
    }

    // Aggiorna stanza
    await query(
      'UPDATE dispositivi SET stanza_id = ? WHERE id = ?',
      [stanza_id || null, id]
    );

    res.json({
      success: true,
      message: 'Stanza aggiornata con successo'
    });
  } catch (error) {
    console.error('Errore update stanza dispositivo:', error);
    res.status(500).json({ error: 'Errore durante l\'aggiornamento della stanza' });
  }
};

// Interfaccia per risposta Tasmota HTTP
interface TasmotaHttpResponse {
  POWER?: 'ON' | 'OFF';
  POWER1?: 'ON' | 'OFF';
  WARNING?: string;
}

// POST controlla dispositivo (ON/OFF)
export const controlDispositivo = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { comando } = req.body;

    if (!comando || !['ON', 'OFF', 'TOGGLE'].includes(comando)) {
      return res.status(400).json({ error: 'Comando non valido (ON/OFF/TOGGLE)' });
    }

    // ========================================
    // DEVICE GUARD - Verifica centralizzata
    // ========================================
    const guardResult = await canControlDeviceById(parseInt(id));

    if (!guardResult.allowed) {
      return res.status(403).json({
        error: guardResult.reason,
        blocked: true,
        device_name: guardResult.device?.nome
      });
    }

    // Verifica che il dispositivo esista e che l'utente abbia accesso
    const dispositivi: any = await query(
      `SELECT d.* FROM dispositivi d
       JOIN impianti i ON d.impianto_id = i.id
       LEFT JOIN impianti_condivisi ic ON i.id = ic.impianto_id
       WHERE d.id = ? AND (i.utente_id = ? OR ic.utente_id = ?)`,
      [id, req.user!.userId, req.user!.userId]
    );

    if (dispositivi.length === 0) {
      return res.status(404).json({ error: 'Dispositivo non trovato' });
    }

    const dispositivo = dispositivi[0];

    // Invia comando HTTP al dispositivo Tasmota (più affidabile di MQTT)
    try {
      const httpCommand = 'TOGGLE'; // Usa sempre TOGGLE per far scattare il relè
      const url = `http://${dispositivo.ip_address}/cm?cmnd=Power%20${httpCommand}`;

      console.log(`📤 Sending HTTP: ${url} (requested: ${comando})`);

      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json() as TasmotaHttpResponse;
      console.log(`✅ HTTP response:`, result);

      // Aggiorna lo stato del dispositivo nel database basandosi sulla risposta
      const tasmotaPowerState = (result.POWER === 'ON') || (result.POWER1 === 'ON');
      await query(
        'UPDATE dispositivi SET power_state = ? WHERE id = ?',
        [tasmotaPowerState, id]
      );

      res.json({
        message: 'Comando inviato con successo',
        dispositivo: dispositivo.nome,
        comando,
        power_state: tasmotaPowerState,
        tasmota_response: result
      });
    } catch (httpError: any) {
      console.error('Errore HTTP command:', httpError);
      return res.status(503).json({
        error: `Dispositivo non raggiungibile via HTTP: ${httpError.message}`
      });
    }
  } catch (error) {
    console.error('Errore control dispositivo:', error);
    res.status(500).json({ error: 'Errore durante il controllo del dispositivo' });
  }
};

// PUT blocca/sblocca dispositivo (SOLO ADMIN)
export const toggleBloccaDispositivo = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { bloccato } = req.body;

    // Solo admin può bloccare/sbloccare dispositivi
    if (req.user!.ruolo !== 'admin') {
      return res.status(403).json({ error: 'Solo gli amministratori possono bloccare dispositivi' });
    }

    // Verifica che il dispositivo esista
    const dispositivi: any = await query(
      'SELECT * FROM dispositivi WHERE id = ?',
      [id]
    );

    if (dispositivi.length === 0) {
      return res.status(404).json({ error: 'Dispositivo non trovato' });
    }

    // Aggiorna stato bloccato
    await query(
      'UPDATE dispositivi SET bloccato = ? WHERE id = ?',
      [bloccato, id]
    );

    res.json({
      message: `Dispositivo ${bloccato ? 'bloccato' : 'sbloccato'} con successo`,
      bloccato
    });
  } catch (error) {
    console.error('Errore toggle blocco dispositivo:', error);
    res.status(500).json({ error: 'Errore durante il blocco/sblocco del dispositivo' });
  }
};

// POST TROVAMI - lampeggia dispositivo 3 volte
export const trovamiDispositivo = async (req: AuthRequest, res: Response) => {
  try {
    const { ip_address } = req.body;

    if (!ip_address) {
      return res.status(400).json({ error: 'IP address richiesto' });
    }

    console.log(`🔍 TROVAMI: lampeggio dispositivo ${ip_address}`);

    // Invia 3 toggle ON/OFF con delay
    for (let i = 0; i < 3; i++) {
      await fetch(`http://${ip_address}/cm?cmnd=Power%20ON`, {
        signal: AbortSignal.timeout(3000)
      });
      await new Promise(resolve => setTimeout(resolve, 400));
      await fetch(`http://${ip_address}/cm?cmnd=Power%20OFF`, {
        signal: AbortSignal.timeout(3000)
      });
      await new Promise(resolve => setTimeout(resolve, 400));
    }

    res.json({ success: true, message: 'Dispositivo lampeggiato' });
  } catch (error) {
    console.error('Errore TROVAMI:', error);
    res.status(500).json({ error: 'Impossibile comunicare con il dispositivo' });
  }
};

// PUT rinomina dispositivo
export const renameDispositivo = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { nome } = req.body;

    if (!nome || !nome.trim()) {
      return res.status(400).json({ error: 'Nome richiesto' });
    }

    // Verifica che il dispositivo esista e che l'utente abbia accesso
    const dispositivi: any = await query(
      `SELECT d.* FROM dispositivi d
       JOIN impianti i ON d.impianto_id = i.id
       LEFT JOIN impianti_condivisi ic ON i.id = ic.impianto_id
       WHERE d.id = ? AND (i.utente_id = ? OR ic.utente_id = ?)`,
      [id, req.user!.userId, req.user!.userId]
    );

    if (dispositivi.length === 0) {
      return res.status(404).json({ error: 'Dispositivo non trovato' });
    }

    // Aggiorna nome
    await query(
      'UPDATE dispositivi SET nome = ? WHERE id = ?',
      [nome.trim(), id]
    );

    res.json({
      success: true,
      message: 'Dispositivo rinominato con successo'
    });
  } catch (error) {
    console.error('Errore rename dispositivo:', error);
    res.status(500).json({ error: 'Errore durante la rinomina del dispositivo' });
  }
};
