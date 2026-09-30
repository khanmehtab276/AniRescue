import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import {
  getFirebaseMessaging,
  onMessage,
} from '../services/firebase.js';
import {
  getPermissionState,
  registerDeviceToken,
} from '../services/pushNotifications.js';

/**
 * Renders nothing. Mounted once, inside the router, alongside the navbar.
 */
export default function PushBridge() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const isLoggedIn = Boolean(user?.id);

  // Users who already granted permission get their token re-registered
  // on each session, so token rotation and new devices keep working.
  // This never prompts — prompting only happens from an explicit click
  // in Profile.
  useEffect(() => {
    if (!isLoggedIn) return;
    if (getPermissionState() !== 'granted') return;

    registerDeviceToken().catch((err) => {
      console.warn('Push token registration failed:', err);
    });
  }, [isLoggedIn]);

  // Foreground FCM messages are delivered directly to the page.
  // The push service worker is reserved for background/closed-app
  // notifications, so an open mobile PWA gets the same in-app behavior
  // without depending on service-worker scope/control.
  useEffect(() => {
    if (!isLoggedIn || getPermissionState() !== 'granted') {
      return undefined;
    }

    let unsubscribe;

    getFirebaseMessaging()
      .then((messaging) => {
        if (!messaging) return;

        unsubscribe = onMessage(messaging, (payload) => {
          const notification = payload?.notification || {};
          const data = payload?.data || {};

          const title = notification.title || data.title || 'AniRescue';
          const body = notification.body || data.body || '';

          showToast(
            [title, body].filter(Boolean).join(' — ') ||
              'You have a new update.',
            'info',
          );

          window.dispatchEvent(
            new Event('anirescue:notifications-updated'),
          );
        });
      })
      .catch((error) => {
        console.warn('Foreground notification listener failed:', error);
      });

    return () => {
      unsubscribe?.();
    };
  }, [isLoggedIn, showToast]);

  // The service worker still handles notification-click navigation for
  // background notifications. Foreground notifications use onMessage()
  // above and therefore do not need the ANIRESCUE_PUSH bridge message.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;

    const handleMessage = (event) => {
      const message = event.data;
      if (!message || typeof message !== 'object') return;

      if (
        message.type === 'ANIRESCUE_NAVIGATE' &&
        typeof message.url === 'string' &&
        message.url.startsWith('/')
      ) {
        navigate(message.url);
        window.dispatchEvent(new Event('anirescue:notifications-updated'));
      }
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);

    return () =>
      navigator.serviceWorker.removeEventListener('message', handleMessage);
  }, [navigate]);

  return null;
}
