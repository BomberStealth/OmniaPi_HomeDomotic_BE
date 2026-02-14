import { Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';

// ============================================
// BACKUP/RESTORE CONTROLLER
// ============================================

// Export backup completo impianto
export const exportBackup = async (req: AuthRequest, res: Response) => {
  try {
    const { impiantoId } = req.params;
    const userId = req.user?.userId;

    // Verifica accesso (proprietario o condivisione accettata)
    const impianti = await query(
      `SELECT i.* FROM impianti i
       LEFT JOIN condivisioni_impianto c ON i.id = c.impianto_id AND c.stato = 'accettato'
       WHERE i.id = ? AND (i.utente_id = ? OR c.utente_id = ?)`,
      [impiantoId, userId, userId]
    ) as any[];

    if (!impianti || impianti.length === 0) {
      return res.status(404).json({ error: 'Impianto non trovato' });
    }

    const impianto = impianti[0];

    // Ottieni tutti i dati associati
    const stanze = await query('SELECT * FROM stanze WHERE impianto_id = ?', [impiantoId]) as any[];
    const dispositivi = await query('SELECT * FROM dispositivi WHERE impianto_id = ?', [impiantoId]) as any[];
    const scene = await query('SELECT * FROM scene WHERE impianto_id = ?', [impiantoId]) as any[];

    const backup = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      impianto: {
        nome: impianto.nome,
        indirizzo: impianto.indirizzo,
        citta: impianto.citta,
        cap: impianto.cap,
        latitudine: impianto.latitudine,
        longitudine: impianto.longitudine,
        ha_fotovoltaico: impianto.ha_fotovoltaico,
        fotovoltaico_potenza: impianto.fotovoltaico_potenza
      },
      stanze: stanze || [],
      dispositivi: dispositivi || [],
      scene: scene || []
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="backup_impianto_${impiantoId}_${Date.now()}.json"`);
    res.json(backup);
  } catch (error) {
    console.error('Errore export backup:', error);
    res.status(500).json({ error: 'Errore durante l\'export del backup' });
  }
};

// Import/restore backup
export const importBackup = async (req: AuthRequest, res: Response) => {
  try {
    const { impiantoId } = req.params;
    const userId = req.user?.userId;
    const backup = req.body;

    // Verifica accesso (solo proprietario)
    const impianti = await query(
      'SELECT id FROM impianti WHERE id = ? AND utente_id = ?',
      [impiantoId, userId]
    ) as any[];

    if (!impianti || impianti.length === 0) {
      return res.status(404).json({ error: 'Impianto non trovato o non autorizzato' });
    }

    // Validate backup format
    if (!backup.version || !backup.impianto) {
      return res.status(400).json({ error: 'Formato backup non valido' });
    }

    // Restore impianto info
    await query(
      `UPDATE impianti SET
       nome = ?, indirizzo = ?, citta = ?, cap = ?,
       latitudine = ?, longitudine = ?,
       ha_fotovoltaico = ?, fotovoltaico_potenza = ?
       WHERE id = ?`,
      [
        backup.impianto.nome,
        backup.impianto.indirizzo,
        backup.impianto.citta,
        backup.impianto.cap,
        backup.impianto.latitudine || null,
        backup.impianto.longitudine || null,
        backup.impianto.ha_fotovoltaico || 0,
        backup.impianto.fotovoltaico_potenza || null,
        impiantoId
      ]
    );

    res.json({
      success: true,
      message: 'Backup ripristinato con successo'
    });
  } catch (error) {
    console.error('Errore import backup:', error);
    res.status(500).json({ error: 'Errore durante l\'import del backup' });
  }
};
