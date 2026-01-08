import admin from '../config/firebase';
import { query } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

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
 */
export async function sendToImpianto(impiantoId: number, notification: NotificationPayload): Promise<number> {
  try {
    const tokens = await query(
      `SELECT DISTINCT ft.token
       FROM fcm_tokens ft
       JOIN utenti_impianti ui ON ft.user_id = ui.utente_id
       WHERE ui.impianto_id = ?`,
      [impiantoId]
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
    const message: admin.messaging.MulticastMessage = {
      tokens,
      notification: {
        title: notification.title,
        body: notification.body,
        imageUrl: notification.imageUrl
      },
      data: notification.data,
      webpush: {
        notification: {
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png'
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
