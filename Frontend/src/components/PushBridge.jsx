import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
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

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;

    const handleMessage = (event) => {
      const message = event.data;
      if (!message || typeof message !== 'object') return;

      if (message.type === 'ANIRESCUE_PUSH') {
        const text = [message.title, message.body].filter(Boolean).join(' — ');
        showToast(text || 'You have a new update.', 'info');
      }

      if (
        message.type === 'ANIRESCUE_NAVIGATE' &&
        typeof message.url === 'string' &&
        message.url.startsWith('/')
      ) {
        navigate(message.url);
      }
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);

    return () =>
      navigator.serviceWorker.removeEventListener('message', handleMessage);
  }, [showToast, navigate]);

  return null;
}
