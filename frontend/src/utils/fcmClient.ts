import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, Messaging } from 'firebase/messaging';
import api from './api';
import toast from 'react-hot-toast';

let firebaseApp: FirebaseApp | null = null;
let messagingInstance: Messaging | null = null;
let foregroundListenerSetup = false;

export interface FirebasePublicConfig {
  active: boolean;
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  measurementId?: string;
  vapidKey?: string;
}

export const isNotificationSupported = (): boolean => {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
};

export const getNotificationPermission = (): NotificationPermission | 'unsupported' => {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
};

export const fetchFirebaseConfig = async (): Promise<FirebasePublicConfig | null> => {
  try {
    const { data } = await api.get('/settings/firebase-public-config');
    if (data?.success && data?.data?.active && data.data.apiKey && data.data.projectId) {
      return data.data;
    }
    return null;
  } catch (error) {
    console.warn('[FCM] Failed to fetch Firebase public config:', error);
    return null;
  }
};

export const getOrCreateFirebaseApp = (config: FirebasePublicConfig): FirebaseApp => {
  if (firebaseApp) return firebaseApp;
  const existingApps = getApps();
  if (existingApps.length > 0) {
    firebaseApp = getApp();
    return firebaseApp;
  }
  firebaseApp = initializeApp({
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    storageBucket: config.storageBucket,
    messagingSenderId: config.messagingSenderId,
    appId: config.appId,
    measurementId: config.measurementId,
  });
  return firebaseApp;
};

export const initFCMAndRegisterToken = async (options?: {
  promptUser?: boolean;
}): Promise<string | null> => {
  if (!isNotificationSupported()) {
    console.info('[FCM] Push notifications are not supported in this browser.');
    return null;
  }

  try {
    const config = await fetchFirebaseConfig();
    if (!config) {
      // Firebase is inactive or not configured in settings
      return null;
    }

    let permission = Notification.permission;
    if (permission === 'default' && options?.promptUser) {
      permission = await Notification.requestPermission();
    }

    if (permission !== 'granted') {
      return null;
    }

    const app = getOrCreateFirebaseApp(config);
    if (!messagingInstance) {
      messagingInstance = getMessaging(app);
    }

    // Register the service worker
    const swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/',
    });
    await navigator.serviceWorker.ready;

    // Get FCM registration token
    const token = await getToken(messagingInstance, {
      serviceWorkerRegistration: swRegistration,
      vapidKey: config.vapidKey || undefined,
    });

    if (token) {
      // Register token with backend
      await api.post('/auth/fcm-token', { token });
      localStorage.setItem('wt_fcm_token', token);

      // Listen for foreground notifications
      if (!foregroundListenerSetup && messagingInstance) {
        foregroundListenerSetup = true;
        onMessage(messagingInstance, (payload) => {
          const title = payload.notification?.title || payload.data?.title || 'Notification';
          const body = payload.notification?.body || payload.data?.body || '';
          
          toast(
            `${title}${body ? `: ${body}` : ''}`,
            {
              icon: '🔔',
              duration: 5000,
            }
          );

          // If browser notifications are permitted, we can also trigger Notification API in foreground
          if (Notification.permission === 'granted' && document.hidden) {
            new Notification(title, {
              body,
              icon: '/favicon.ico',
            });
          }
        });
      }

      return token;
    }

    return null;
  } catch (error: any) {
    console.warn('[FCM] Error initializing FCM client:', error?.message || error);
    return null;
  }
};

export const unregisterFCMToken = async (): Promise<void> => {
  try {
    const token = localStorage.getItem('wt_fcm_token');
    if (token) {
      await api.post('/auth/fcm-token/remove', { token });
      localStorage.removeItem('wt_fcm_token');
    }
  } catch (error) {
    console.warn('[FCM] Error removing FCM token:', error);
  }
};
