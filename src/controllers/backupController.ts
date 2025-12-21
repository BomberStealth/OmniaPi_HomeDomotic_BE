import { Request, Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { RowDataPacket } from 'mysql2';

// ============================================
// BACKUP/RESTORE CONTROLLER
// ============================================

// Export backup completo impianto
export const exportBackup = async (req: AuthRequest, res: Response) => {
  try {
    const { impiantoId } = req.params;
    const userId = req.user?.userId;

    // Verifica accesso
    const [impianti] = await query(
      'SELECT * FROM impianti WHERE id = ? AND utente_id = ?',
      [impiantoId, userId]
    ) as RowDataPacket[];

    if (impianti.length === 0) {
      return res.status(404).json({ error: 'Impianto non trovato' });
    }

    const impianto = impianti[0];

    // Ottieni tutti i dati associati
    const [stanze] = await query('SELECT * FROM stanze WHERE impianto_id = ?', [impiantoId]) as RowDataPacket[];
    const [dispositivi] = await query('SELECT * FROM dispositivi WHERE impianto_id = ?', [impiantoId]) as RowDataPacket[];
    const [scene] = await query('SELECT * FROM scene WHERE impianto_id = ?', [impiantoId]) as RowDataPacket[];

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
      stanze: stanze[0],
      dispositivi: dispositivi[0],
      scene: scene[0]
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

    // Verifica accesso
    const [impianti] = await query(
      'SELECT id FROM impianti WHERE id = ? AND utente_id = ?',
      [impiantoId, userId]
    ) as RowDataPacket[];

    if (impianti.length === 0) {
      return res.status(404).json({ error: 'Impianto non trovato' });
    }

    // Restore impianto info
    if (backup.impianto) {
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
          backup.impianto.latitudine,
          backup.impianto.longitudine,
          backup.impianto.ha_fotovoltaico,
          backup.impianto.fotovoltaico_potenza,
          impiantoId
        ]
      );
    }

    res.json({
      success: true,
      message: 'Backup ripristinato con successo'
    });
  } catch (error) {
    console.error('Errore import backup:', error);
    res.status(500).json({ error: 'Errore durante l\'import del backup' });
  }
};
