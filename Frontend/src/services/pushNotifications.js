import { getToken } from 'firebase/messaging';
import API from '../utils/api';
import { getFirebaseMessaging } from './firebase';

const PUSH_SW_PATH = '/firebase-messaging-sw.js';
// Own scope so this worker never collides with the PWA caching worker.
const PUSH_SW_SCOPE = '/firebase-cloud-messaging-push-scope';

const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;

export function isPushConfigured() {
  return Boolean(
    vapidKey &&
      import.meta.env.VITE_FIREBASE_API_KEY &&
      import.meta.env.VITE_FIREBASE_PROJECT_ID &&
      import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID &&
      import.meta.env.VITE_FIREBASE_APP_ID
  );
}

export function isPushSupported() {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

export function getPermissionState() {
  if (!isPushSupported()) return 'unsupported';
  if (!isPushConfigured()) return 'unconfigured';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

async function registerWorker() {
  return navigator.serviceWorker.register(PUSH_SW_PATH, {
    scope: PUSH_SW_SCOPE,
  });
}

/**
 * Gets an FCM token for this browser and registers it with the backend.
 * Assumes notification permission is already granted.
 */
export async function registerDeviceToken() {
  const messaging = await getFirebaseMessaging();

  if (!messaging) {
    throw new Error('Push notifications are not supported in this browser.');
  }

  const registration = await registerWorker();

  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration,
  });

  if (!token) {
    throw new Error('No push token was issued for this browser.');
  }

  await API.post('/auth/device-token', { token, platform: 'web' });

  return token;
}

/**
 * Asks the user for permission (must be called from a click handler),
 * then registers the device. Resolves to the resulting permission.
 */
export async function enablePushNotifications() {
  if (!isPushSupported()) {
    throw new Error('This browser does not support push notifications.');
  }

  if (!isPushConfigured()) {
    throw new Error('Push notifications are not configured for this deployment.');
  }

  const permission = await Notification.requestPermission();

  if (permission !== 'granted') {
    return permission;
  }

  await registerDeviceToken();

  return permission;
}
