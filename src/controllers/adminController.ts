import { Request, Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { UserRole } from '../types';

// ============================================
// ADMIN CONTROLLER
// ============================================

// GET cerca utenti (solo admin)
export const searchUsers = async (req: AuthRequest, res: Response) => {
  try {
    const { q } = req.query;

    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: 'Query di ricerca richiesta' });
    }

    const utenti: any = await query(
      `SELECT id, email, nome, cognome, ruolo, creato_il
       FROM utenti
       WHERE email LIKE ? OR nome LIKE ? OR cognome LIKE ?
       ORDER BY email ASC
       LIMIT 50`,
      [`%${q}%`, `%${q}%`, `%${q}%`]
    );

    res.json(utenti);
  } catch (error) {
    console.error('Errore search users:', error);
    res.status(500).json({ error: 'Errore durante la ricerca utenti' });
  }
};

// GET permessi di un utente (solo admin)
export const getUserPermissions = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;

    // Verifica che l'utente esista
    const utenti: any = await query('SELECT * FROM utenti WHERE id = ?', [userId]);

    if (utenti.length === 0) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }

    const permessi: any = await query(
      'SELECT permesso, valore FROM permessi_utenti WHERE utente_id = ?',
      [userId]
    );

    // Permessi standard
    const permessiDefault = [
      'visualizza_impianti',
      'modifica_impianti',
      'elimina_impianti',
      'gestisci_utenti',
      'gestisci_dispositivi',
      'gestisci_scene'
    ];

    // Crea oggetto permessi con valori di default
    const permessiObj: any = {};
    permessiDefault.forEach(p => {
      const found = permessi.find((perm: any) => perm.permesso === p);
      permessiObj[p] = found ? found.valore : false;
    });

    res.json({
      utente: utenti[0],
      permessi: permessiObj
    });
  } catch (error) {
    console.error('Errore get user permissions:', error);
    res.status(500).json({ error: 'Errore durante il recupero dei permessi' });
  }
};

// PUT aggiorna permessi di un utente (solo admin)
export const updateUserPermissions = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { permessi } = req.body;

    if (!permessi || typeof permessi !== 'object') {
      return res.status(400).json({ error: 'Permessi richiesti' });
    }

    // Verifica che l'utente esista
    const utenti: any = await query('SELECT * FROM utenti WHERE id = ?', [userId]);

    if (utenti.length === 0) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }

    // Non permettere di modificare i permessi di un admin
    if (utenti[0].ruolo === UserRole.ADMIN) {
      return res.status(400).json({ error: 'Non puoi modificare i permessi di un admin' });
    }

    // Aggiorna ogni permesso
    for (const [permesso, valore] of Object.entries(permessi)) {
      await query(
        `INSERT INTO permessi_utenti (utente_id, permesso, valore)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE valore = ?`,
        [userId, permesso, valore, valore]
      );
    }

    res.json({ message: 'Permessi aggiornati con successo' });
  } catch (error) {
    console.error('Errore update user permissions:', error);
    res.status(500).json({ error: 'Errore durante l\'aggiornamento dei permessi' });
  }
};

// GET tutti gli utenti (solo admin)
export const getAllUsers = async (req: AuthRequest, res: Response) => {
  try {
    const utenti: any = await query(
      `SELECT id, email, nome, cognome, ruolo, creato_il, aggiornato_il
       FROM utenti
       ORDER BY creato_il DESC`
    );

    res.json(utenti);
  } catch (error) {
    console.error('Errore get all users:', error);
    res.status(500).json({ error: 'Errore durante il recupero degli utenti' });
  }
};

// PUT aggiorna ruolo utente (solo admin)
export const updateUserRole = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { ruolo } = req.body;

    if (!ruolo || !Object.values(UserRole).includes(ruolo)) {
      return res.status(400).json({ error: 'Ruolo non valido' });
    }

    // Verifica che l'utente esista
    const utenti: any = await query('SELECT * FROM utenti WHERE id = ?', [userId]);

    if (utenti.length === 0) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }

    // Non permettere di modificare il proprio ruolo
    if (utenti[0].id === req.user!.userId) {
      return res.status(400).json({ error: 'Non puoi modificare il tuo stesso ruolo' });
    }

    await query('UPDATE utenti SET ruolo = ? WHERE id = ?', [ruolo, userId]);

    res.json({ message: 'Ruolo aggiornato con successo' });
  } catch (error) {
    console.error('Errore update user role:', error);
    res.status(500).json({ error: 'Errore durante l\'aggiornamento del ruolo' });
  }
};

// DELETE elimina utente (solo admin)
export const deleteUser = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;

    // Verifica che l'utente esista
    const utenti: any = await query('SELECT * FROM utenti WHERE id = ?', [userId]);

    if (utenti.length === 0) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }

    // Non permettere di eliminare se stesso
    if (utenti[0].id === req.user!.userId) {
      return res.status(400).json({ error: 'Non puoi eliminare te stesso' });
    }

    // Non permettere di eliminare un admin
    if (utenti[0].ruolo === UserRole.ADMIN) {
      return res.status(400).json({ error: 'Non puoi eliminare un admin' });
    }

    await query('DELETE FROM utenti WHERE id = ?', [userId]);

    res.json({ message: 'Utente eliminato con successo' });
  } catch (error) {
    console.error('Errore delete user:', error);
    res.status(500).json({ error: 'Errore durante l\'eliminazione dell\'utente' });
  }
};

// GET ricerca impianti (solo admin)
export const searchImpianti = async (req: AuthRequest, res: Response) => {
  try {
    const { q } = req.query;

    if (!q || typeof q !== 'string' || q.length < 2) {
      return res.status(400).json({ error: 'Query di ricerca troppo corta (minimo 2 caratteri)' });
    }

    const searchTerm = `%${q}%`;
    const searchId = parseInt(q) || 0;

    // Cerca per: nome impianto, ID impianto, email proprietario, città, indirizzo
    const impianti: any = await query(
      `SELECT DISTINCT
        i.id,
        i.nome,
        i.indirizzo,
        i.citta,
        i.cap,
        i.email_proprietario,
        i.creato_il,
        u.nome as proprietario_nome,
        u.cognome as proprietario_cognome,
        u.email as proprietario_email
      FROM impianti i
      LEFT JOIN utenti u ON i.utente_id = u.id
      WHERE
        i.nome LIKE ?
        OR i.id = ?
        OR i.email_proprietario LIKE ?
        OR i.citta LIKE ?
        OR i.indirizzo LIKE ?
        OR u.email LIKE ?
        OR u.nome LIKE ?
        OR u.cognome LIKE ?
      ORDER BY i.creato_il DESC
      LIMIT 20`,
      [searchTerm, searchId, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm]
    );

    res.json({ impianti });
  } catch (error) {
    console.error('Errore ricerca impianti admin:', error);
    res.status(500).json({ error: 'Errore nella ricerca' });
  }
};

// POST pulizia azioni orfane nelle scene (solo admin)
export const cleanupOrphanActions = async (req: AuthRequest, res: Response) => {
  try {
    // 1. Ottieni tutti i dispositivi esistenti
    const dispositivi: any = await query('SELECT id FROM dispositivi');
    const dispositiviIds = new Set(dispositivi.map((d: any) => d.id));

    // 2. Ottieni tutte le scene
    const scene: any = await query('SELECT id, nome, azioni FROM scene');

    let sceneAggiornate = 0;
    let azioniRimosse = 0;

    for (const scena of scene) {
      let azioni = [];
      try {
        if (typeof scena.azioni === 'string' && scena.azioni.trim()) {
          azioni = JSON.parse(scena.azioni);
        } else if (Array.isArray(scena.azioni)) {
          azioni = scena.azioni;
        }
      } catch {
        continue;
      }

      if (!Array.isArray(azioni) || azioni.length === 0) continue;

      // Filtra azioni con dispositivi esistenti
      const azioniValide = azioni.filter((a: any) => {
        const deviceId = a.dispositivo_id;
        if (!deviceId) return true;
        return dispositiviIds.has(deviceId);
      });

      const rimosse = azioni.length - azioniValide.length;
      if (rimosse > 0) {
        azioniRimosse += rimosse;
        sceneAggiornate++;

        await query(
          'UPDATE scene SET azioni = ? WHERE id = ?',
          [JSON.stringify(azioniValide), scena.id]
        );
        console.log(`📝 Scena ${scena.id} (${scena.nome}): rimosse ${rimosse} azioni orfane`);
      }
    }

    console.log(`✅ Pulizia completata: ${sceneAggiornate} scene, ${azioniRimosse} azioni rimosse`);

    res.json({
      success: true,
      sceneAggiornate,
      azioniRimosse
    });
  } catch (error) {
    console.error('Errore cleanup orphan actions:', error);
    res.status(500).json({ error: 'Errore durante la pulizia' });
  }
};

// ============================================
// ADMIN MODE - Accesso temporaneo a impianti
// ============================================

// POST /api/admin/enter-impianto/:impiantoId
// Crea una condivisione temporanea per l'admin
export const enterImpiantoAsAdmin = async (req: AuthRequest, res: Response) => {
  try {
    const { impiantoId } = req.params;
    const userId = req.user!.userId;
    const ruolo = req.user!.ruolo;

    console.log('🔑 enterImpiantoAsAdmin - START');
    console.log('🔑 userId:', userId, 'ruolo:', ruolo, 'impiantoId:', impiantoId);

    // Solo admin può usare questa funzione
    if (ruolo !== 'admin') {
      console.log('🔑 DENIED - Not admin');
      return res.status(403).json({ error: 'Solo gli admin possono usare questa funzione' });
    }

    // Verifica che l'impianto esista
    const impianti: any = await query('SELECT * FROM impianti WHERE id = ?', [impiantoId]);
    if (impianti.length === 0) {
      return res.status(404).json({ error: 'Impianto non trovato' });
    }

    // Controlla se l'admin è già proprietario
    if (impianti[0].utente_id === userId) {
      return res.status(400).json({
        error: 'Sei il proprietario di questo impianto',
        alreadyMember: true
      });
    }

    // Controlla se l'admin ha già un invito normale (non admin_session)
    const inviti: any = await query(
      `SELECT * FROM condivisioni_impianto
       WHERE impianto_id = ? AND utente_id = ? AND is_admin_session = false AND stato = 'accettato'`,
      [impiantoId, userId]
    );

    if (inviti.length > 0) {
      return res.status(400).json({
        error: 'Sei già membro di questo impianto',
        alreadyMember: true
      });
    }

    // Elimina eventuali sessioni admin precedenti su ALTRI impianti
    await query(
      'DELETE FROM condivisioni_impianto WHERE utente_id = ? AND is_admin_session = true',
      [userId]
    );

    // Crea la condivisione temporanea admin con accesso completo
    // Nota: email_invitato e invitato_da sono required nella tabella
    console.log('🔑 Creating admin session condivisione...');
    const insertResult: any = await query(
      `INSERT INTO condivisioni_impianto
       (impianto_id, utente_id, email_invitato, invitato_da, stato, accesso_completo, is_admin_session, creato_il)
       VALUES (?, ?, 'admin@session', ?, 'accettato', true, true, NOW())`,
      [impiantoId, userId, userId]
    );
    console.log('🔑 Insert result:', insertResult.insertId || insertResult.affectedRows);

    console.log(`🔐 Admin ${userId} entered impianto ${impiantoId} in admin mode - SUCCESS`);

    // Ritorna l'impianto completo
    res.json({
      success: true,
      impianto: impianti[0],
      message: 'Accesso admin attivato'
    });

  } catch (error) {
    console.error('Errore enterImpiantoAsAdmin:', error);
    res.status(500).json({ error: 'Errore durante l\'accesso admin' });
  }
};

// GET /api/admin/operations
// Log delle operazioni critiche (admin/installatore)
export const getOperations = async (req: AuthRequest, res: Response) => {
  try {
    const { tipo, limit: limitStr, impianto_id } = req.query;
    const limit = Math.min(parseInt(limitStr as string) || 100, 500);

    let sql = 'SELECT * FROM operation_log WHERE 1=1';
    const params: any[] = [];

    if (tipo && typeof tipo === 'string') {
      sql += ' AND tipo = ?';
      params.push(tipo);
    }
    if (impianto_id && typeof impianto_id === 'string') {
      sql += ' AND impianto_id = ?';
      params.push(parseInt(impianto_id));
    }

    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const rows: any = await query(sql, params);

    res.json({ success: true, operations: rows, count: rows.length });
  } catch (error) {
    console.error('Errore getOperations:', error);
    res.status(500).json({ error: 'Errore durante il recupero delle operazioni' });
  }
};

// POST /api/admin/exit-impianto
// Elimina la condivisione temporanea admin
export const exitImpiantoAsAdmin = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    // Elimina tutte le sessioni admin dell'utente
    const result: any = await query(
      'DELETE FROM condivisioni_impianto WHERE utente_id = ? AND is_admin_session = true',
      [userId]
    );

    console.log(`🔐 Admin ${userId} exited admin mode, deleted ${result.affectedRows || 0} sessions`);

    res.json({
      success: true,
      message: 'Accesso admin terminato',
      deletedSessions: result.affectedRows || 0
    });

  } catch (error) {
    console.error('Errore exitImpiantoAsAdmin:', error);
    res.status(500).json({ error: 'Errore durante l\'uscita admin' });
  }
};

// ============================================
// MONITORAGGIO GLOBALE GATEWAY
// ============================================

// GET /api/admin/gateways?q=&limit=10
export const getAllGatewaysAdmin = async (req: AuthRequest, res: Response) => {
  try {
    const { q } = req.query;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);

    let sql = `
      SELECT
        g.id,
        g.mac_address,
        g.ip_address,
        g.firmware_version,
        g.status,
        g.last_seen,
        g.mqtt_connected,
        i.id   AS impianto_id,
        i.nome AS impianto_nome,
        COALESCE(g.node_count, 0) AS node_count
      FROM gateways g
      LEFT JOIN impianti i ON g.impianto_id = i.id
    `;
    const params: any[] = [];

    if (q && typeof q === 'string' && q.trim().length > 0) {
      sql += ` WHERE i.nome LIKE ? OR g.mac_address LIKE ?`;
      params.push(`%${q}%`, `%${q}%`);
    }

    sql += ` ORDER BY g.last_seen DESC LIMIT ?`;
    params.push(limit);

    const rows: any = await query(sql, params);

    res.json({
      gateways: (rows || []).map((r: any) => ({
        id: r.id,
        mac: r.mac_address,
        ip: r.ip_address,
        version: r.firmware_version,
        status: r.status,
        lastSeen: r.last_seen,
        mqttConnected: !!r.mqtt_connected,
        impiantoId: r.impianto_id,
        impiantoNome: r.impianto_nome || null,
        nodeCount: parseInt(r.node_count) || 0,
      })),
      count: rows?.length || 0,
    });
  } catch (error) {
    console.error('Errore getAllGatewaysAdmin:', error);
    res.status(500).json({ error: 'Errore durante il recupero dei gateway' });
  }
};

// GET /api/admin/gateways/:id/nodes
export const getGatewayNodesAdmin = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const gateways: any = await query(
      'SELECT impianto_id FROM gateways WHERE id = ?',
      [id]
    );

    if (!gateways || gateways.length === 0) {
      return res.status(404).json({ error: 'Gateway non trovato' });
    }

    const impiantoId = gateways[0].impianto_id;

    if (!impiantoId) {
      return res.json({ nodes: [] });
    }

    const nodes: any = await query(
      `SELECT id, mac_address AS mac, nome, tipo, stanza_id
       FROM dispositivi
       WHERE impianto_id = ? AND device_type IN ('omniapi_node', 'omniapi_led')
       ORDER BY nome ASC`,
      [impiantoId]
    );

    res.json({ nodes: nodes || [] });
  } catch (error) {
    console.error('Errore getGatewayNodesAdmin:', error);
    res.status(500).json({ error: 'Errore durante il recupero dei nodi' });
  }
};
