import admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';
import { Settings } from '../models/Settings';
import User from '../models/User';

let isInitialized = false;

export const initFCM = async () => {
  if (isInitialized || admin.apps.length > 0) {
    isInitialized = true;
    return true;
  }

  try {
    const settings = await Settings.findOne();
    if (!settings || settings.firebaseServiceStatus !== 'active') {
      return false;
    }

    // Look for the service account key
    const serviceAccountPath = path.join(__dirname, '../../firebase-service-account.json');
    if (fs.existsSync(serviceAccountPath)) {
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      isInitialized = true;
      console.log('Firebase Admin SDK initialized successfully with service account');
      return true;
    }

    // Fallback to legacy server key check
    if (settings.firebaseServerKey) {
      console.log('FCM initialized in legacy mode using Server Key');
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error initializing FCM:', error);
    return false;
  }
};

export interface PushNotificationPayload {
  title: string;
  body: string;
  url?: string;
  data?: Record<string, any>;
}

export const sendPushNotification = async (token: string, title: string, body: string, data?: any, url?: string) => {
  const settings = await Settings.findOne();
  if (!settings || settings.firebaseServiceStatus !== 'active') {
    throw new Error('FCM is not active in settings');
  }

  // Initialize if not already initialized
  await initFCM();

  const formattedData: Record<string, string> = data
    ? Object.keys(data).reduce((acc, key) => {
        acc[key] = String(data[key]);
        return acc;
      }, {} as Record<string, string>)
    : {};

  if (url) {
    formattedData.url = url;
  }

  if (isInitialized && admin.apps.length > 0) {
    // Send notification using firebase-admin SDK
    const message: admin.messaging.Message = {
      notification: {
        title,
        body,
      },
      data: formattedData,
      webpush: {
        notification: {
          title,
          body,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
        },
        fcmOptions: url ? { link: url } : undefined,
      },
      token,
    };

    const response = await admin.messaging().send(message);
    return response;
  }

  if (settings.firebaseServerKey) {
    // Legacy API fallback
    const response = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `key=${settings.firebaseServerKey}`,
      },
      body: JSON.stringify({
        to: token,
        notification: {
          title,
          body,
          sound: 'default',
          click_action: url,
        },
        data: formattedData,
        priority: 'high',
      }),
    });

    const result = (await response.json()) as any;
    if (!response.ok || (result && result.failure > 0)) {
      const errorMsg = result?.results?.[0]?.error || JSON.stringify(result);
      throw new Error(`FCM Legacy API error: ${errorMsg}`);
    }
    return result;

  }

  throw new Error('No Firebase Server Key or Service Account credentials found');
};

const isInvalidTokenError = (error: any): boolean => {
  const code = error?.code || error?.errorInfo?.code || '';
  const message = error?.message || String(error);
  return (
    code === 'messaging/registration-token-not-registered' ||
    code === 'messaging/invalid-registration-token' ||
    code === 'messaging/invalid-argument' ||
    message.includes('NotRegistered') ||
    message.includes('InvalidRegistration')
  );
};

export const sendPushToUser = async (
  userId: string | any,
  payload: PushNotificationPayload
): Promise<void> => {
  if (!userId) return;

  try {
    const user = await User.findById(userId);
    if (!user || !user.fcmTokens || user.fcmTokens.length === 0) return;

    const invalidTokens: string[] = [];
    const sendPromises = user.fcmTokens.map(async (token) => {
      try {
        await sendPushNotification(token, payload.title, payload.body, payload.data, payload.url);
      } catch (err: any) {
        if (isInvalidTokenError(err)) {
          invalidTokens.push(token);
        } else {
          console.warn(`[FCM] Failed to deliver push to token for user ${user.name}:`, err.message || err);
        }
      }
    });

    await Promise.all(sendPromises);

    if (invalidTokens.length > 0) {
      await User.findByIdAndUpdate(user._id, {
        $pull: { fcmTokens: { $in: invalidTokens } },
      });
    }
  } catch (err: any) {
    console.warn('[FCM] Error in sendPushToUser:', err.message || err);
  }
};

export const sendPushToUsers = async (
  userIds: Array<string | any>,
  payload: PushNotificationPayload
): Promise<void> => {
  if (!userIds || userIds.length === 0) return;
  const uniqueIds = Array.from(new Set(userIds.map(id => String(id))));
  await Promise.all(uniqueIds.map(id => sendPushToUser(id, payload)));
};

