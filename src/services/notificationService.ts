import admin from '../config/firebase';
import { query } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { emitNotification } from '../socket';

// ============================================
// NOTIFICATION SERVICE
// Firebase Cloud Messaging per push notifications
// ============================================

interface FcmToken extends RowDataPacket {
  id: number;
  user_id: number;
  token: string;
  device_info: string | null;
  created_at: Date;
  updated_at: Date;
}

interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  imageUrl?: string;
}

interface NotificationHistoryEntry {
  impiantoId: number;
  userId?: number;
  type: 'gateway_offline' | 'gateway_online' | 'device_offline' | 'device_online' | 'scene_executed' | 'relay_changed' | 'system';
  title: string;
  body: string;
  data?: Record<string, any>;
}

/**
 * Registra un token FCM per un utente
 */
export async function registerToken(userId: number, token: string, deviceInfo?: string): Promise<boolean> {
  try {
    // Verifica se il token esiste già
    const existing = await query(
      'SELECT id FROM fcm_tokens WHERE token = ?',
      [token]
    ) as FcmToken[];

    if (existing.length > 0) {
      // Aggiorna il token esistente (potrebbe essere di un altro utente)
      await query(
        'UPDATE fcm_tokens SET user_id = ?, device_info = ?, updated_at = NOW() WHERE token = ?',
        [userId, deviceInfo || null, token]
      );
    } else {
      // Inserisci nuovo token
      await query(
        'INSERT INTO fcm_tokens (user_id, token, device_info, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())',
        [userId, token, deviceInfo || null]
      );
    }

    console.log(`✅ FCM token registered for user ${userId}`);
    return true;
  } catch (error) {
    console.error('❌ Error registering FCM token:', error);
    return false;
  }
}

/**
 * Rimuove un token FCM
 */
export async function unregisterToken(token: string): Promise<boolean> {
  try {
    await query(
      'DELETE FROM fcm_tokens WHERE token = ?',
      [token]
    );
    console.log('✅ FCM token unregistered');
    return true;
  } catch (error) {
    console.error('❌ Error unregistering FCM token:', error);
    return false;
  }
}

/**
 * Invia notifica a un singolo utente
 */
export async function sendToUser(userId: number, notification: NotificationPayload): Promise<number> {
  try {
    const tokens = await query(
      'SELECT token FROM fcm_tokens WHERE user_id = ?',
      [userId]
    ) as FcmToken[];

    if (tokens.length === 0) {
      console.log(`No FCM tokens found for user ${userId}`);
      return 0;
    }

    const tokenList = tokens.map(t => t.token);
    return await sendToTokens(tokenList, notification);
  } catch (error) {
    console.error('❌ Error sending notification to user:', error);
    return 0;
  }
}

/**
 * Invia notifica a tutti gli utenti di un impianto
 * Include: proprietario (cliente_id), utente_id, e utenti con accesso condiviso
 */
export async function sendToImpianto(impiantoId: number, notification: NotificationPayload): Promise<number> {
  try {
    // Query che trova tutti gli utenti con accesso all'impianto:
    // 1. Proprietario (cliente_id)
    // 2. Utente associato (utente_id)
    // 3. Utenti con accesso condiviso (impianti_condivisi)
    const tokens = await query(
      `SELECT DISTINCT ft.token
       FROM fcm_tokens ft
       WHERE ft.user_id IN (
         -- Proprietario dell'impianto
         SELECT cliente_id FROM impianti WHERE id = ?
         UNION
         -- Utente associato (se diverso dal proprietario)
         SELECT utente_id FROM impianti WHERE id = ? AND utente_id IS NOT NULL
         UNION
         -- Utenti con accesso condiviso
         SELECT utente_id FROM impianti_condivisi WHERE impianto_id = ?
       )`,
      [impiantoId, impiantoId, impiantoId]
    ) as FcmToken[];

    if (tokens.length === 0) {
      console.log(`No FCM tokens found for impianto ${impiantoId}`);
      return 0;
    }

    const tokenList = tokens.map(t => t.token);
    return await sendToTokens(tokenList, notification);
  } catch (error) {
    console.error('❌ Error sending notification to impianto:', error);
    return 0;
  }
}

/**
 * Invia notifica a una lista di token
 */
export async function sendToTokens(tokens: string[], notification: NotificationPayload): Promise<number> {
  if (tokens.length === 0) return 0;

  try {
    // Tag per raggruppare notifiche dello stesso tipo
    const notificationTag = notification.data?.type || 'omniapi';

    const message: admin.messaging.MulticastMessage = {
      tokens,
      notification: {
        title: notification.title,
        body: notification.body,
        imageUrl: notification.imageUrl
      },
      data: notification.data,
      // Android: priorità alta per notifiche immediate
      android: {
        priority: 'high',
        collapseKey: notificationTag, // Raggruppa per tipo
        notification: {
          channelId: 'omniapi_notifications',
          priority: 'high',
          defaultSound: true,
          defaultVibrateTimings: true,
          tag: notificationTag, // Stesso tag = sovrascrive notifica precedente
        }
      },
      // iOS: priorità alta con suono
      apns: {
        payload: {
          aps: {
            alert: {
              title: notification.title,
              body: notification.body,
            },
            sound: 'default',
            badge: 1,
            'thread-id': notificationTag, // Raggruppa per thread su iOS
          }
        },
        headers: {
          'apns-priority': '10',
          'apns-collapse-id': notificationTag // Collapse ID per iOS
        }
      },
      // Web Push: urgenza alta con raggruppamento
      webpush: {
        headers: {
          Urgency: 'high',
          TTL: '86400'
        },
        notification: {
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          requireInteraction: false, // Si chiudono automaticamente
          tag: notificationTag, // Raggruppa per tipo
          renotify: true, // Vibra/suona anche se sostituisce
        },
        fcmOptions: {
          link: '/'
        }
      }
    };

    const response = await admin.messaging().sendEachForMulticast(message);

    console.log(`✅ Notifications sent: ${response.successCount} success, ${response.failureCount} failed`);

    // Rimuovi token non validi
    if (response.failureCount > 0) {
      const tokensToRemove: string[] = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const errorCode = resp.error?.code;
          if (errorCode === 'messaging/invalid-registration-token' ||
              errorCode === 'messaging/registration-token-not-registered') {
            tokensToRemove.push(tokens[idx]);
          }
        }
      });

      // Rimuovi token non validi dal database
      for (const token of tokensToRemove) {
        await unregisterToken(token);
      }
    }

    return response.successCount;
  } catch (error) {
    console.error('❌ Error sending notifications:', error);
    return 0;
  }
}

/**
 * Invia notifica a tutti gli utenti (broadcast)
 */
export async function sendBroadcast(notification: NotificationPayload): Promise<number> {
  try {
    const tokens = await query('SELECT token FROM fcm_tokens') as FcmToken[];

    if (tokens.length === 0) {
      console.log('No FCM tokens found for broadcast');
      return 0;
    }

    const tokenList = tokens.map(t => t.token);
    return await sendToTokens(tokenList, notification);
  } catch (error) {
    console.error('❌ Error sending broadcast:', error);
    return 0;
  }
}

// ============================================
// NOTIFICATION HISTORY FUNCTIONS
// ============================================

/**
 * Salva una notifica nello storico e invia push
 */
export async function sendAndSave(entry: NotificationHistoryEntry): Promise<number> {
  try {
    // Salva nello storico
    const result = await query(
      `INSERT INTO notifications_history (impianto_id, user_id, type, title, body, data)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [entry.impiantoId, entry.userId || null, entry.type, entry.title, entry.body, JSON.stringify(entry.data || {})]
    ) as ResultSetHeader;

    console.log(`✅ Notification saved to history: ${entry.title}`);

    // Emit via WebSocket per aggiornamento real-time
    emitNotification(entry.impiantoId, {
      id: result.insertId,
      impiantoId: entry.impiantoId,
      type: entry.type,
      title: entry.title,
      body: entry.body,
      data: entry.data,
      created_at: new Date().toISOString()
    });

    // Invia push a tutti gli utenti dell'impianto
    const sent = await sendToImpianto(entry.impiantoId, {
      title: entry.title,
      body: entry.body,
      data: {
        type: entry.type,
        notificationId: result.insertId.toString(),
        ...Object.fromEntries(Object.entries(entry.data || {}).map(([k, v]) => [k, String(v)]))
      }
    });

    return sent;
  } catch (error) {
    console.error('❌ Error in sendAndSave:', error);
    return 0;
  }
}

/**
 * Recupera storico notifiche per un impianto
 */
export async function getHistory(impiantoId: number, limit: number = 50, offset: number = 0): Promise<any[]> {
  try {
    // Ensure limit and offset are valid integers for MySQL prepared statements
    const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 50));
    const safeOffset = Math.max(0, Number(offset) || 0);

    const notifications = await query(
      `SELECT nh.*, u.nome as user_name
       FROM notifications_history nh
       LEFT JOIN utenti u ON nh.user_id = u.id
       WHERE nh.impianto_id = ?
       ORDER BY nh.created_at DESC
       LIMIT ${safeLimit} OFFSET ${safeOffset}`,
      [impiantoId]
    ) as any[];
    return notifications;
  } catch (error) {
    console.error('❌ Error getting notification history:', error);
    return [];
  }
}

/**
 * Helper: Parse read_by field (può essere stringa JSON o array già parsato da MySQL)
 */
function parseReadBy(readByField: any): number[] {
  if (!readByField) return [];
  if (Array.isArray(readByField)) return readByField;
  if (typeof readByField === 'string') {
    try {
      const parsed = JSON.parse(readByField);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Segna una notifica come letta da un utente
 */
export async function markAsRead(notificationId: number, userId: number): Promise<boolean> {
  try {
    const notifications = await query(
      'SELECT read_by FROM notifications_history WHERE id = ?',
      [notificationId]
    ) as any[];

    if (!notifications || notifications.length === 0) return false;
    const notification = notifications[0];

    const readBy = parseReadBy(notification.read_by);

    if (!readBy.includes(userId)) {
      readBy.push(userId);
      await query(
        'UPDATE notifications_history SET read_by = ? WHERE id = ?',
        [JSON.stringify(readBy), notificationId]
      );
    }

    return true;
  } catch (error) {
    console.error('❌ Error marking notification as read:', error);
    return false;
  }
}

/**
 * Segna tutte le notifiche come lette per un utente
 */
export async function markAllAsRead(impiantoId: number, userId: number): Promise<boolean> {
  try {
    const notifications = await query(
      'SELECT id, read_by FROM notifications_history WHERE impianto_id = ?',
      [impiantoId]
    ) as any[];

    for (const notif of notifications || []) {
      const readBy = parseReadBy(notif.read_by);

      if (!readBy.includes(userId)) {
        readBy.push(userId);
        await query(
          'UPDATE notifications_history SET read_by = ? WHERE id = ?',
          [JSON.stringify(readBy), notif.id]
        );
      }
    }

    return true;
  } catch (error) {
    console.error('❌ Error marking all as read:', error);
    return false;
  }
}

/**
 * Conta notifiche non lette per un utente
 */
export async function getUnreadCount(impiantoId: number, userId: number): Promise<number> {
  try {
    const notifications = await query(
      'SELECT read_by FROM notifications_history WHERE impianto_id = ?',
      [impiantoId]
    ) as any[];

    let unread = 0;
    for (const notif of notifications || []) {
      const readBy = parseReadBy(notif.read_by);

      if (!readBy.includes(userId)) {
        unread++;
      }
    }

    return unread;
  } catch (error) {
    console.error('❌ Error getting unread count:', error);
    return 0;
  }
}
