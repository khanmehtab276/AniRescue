import { useState } from 'react';
import { Bell, BellOff, BellRing } from 'lucide-react';
import Surface from './ui/Surface.jsx';
import Button from './ui/Button.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import {
  enablePushNotifications,
  getPermissionState,
} from '../services/pushNotifications.js';

const COPY = {
  unsupported: {
    Icon: BellOff,
    text: 'This browser does not support push notifications. On iPhone, add AniRescue to your Home Screen first.',
  },
  unconfigured: {
    Icon: BellOff,
    text: 'Push notifications are not set up for this deployment yet.',
  },
  denied: {
    Icon: BellOff,
    text: 'Notifications are blocked for this site. Re-enable them in your browser\u2019s site settings, then reload.',
  },
  granted: {
    Icon: BellRing,
    text: 'Notifications are on for this device. You will be alerted when a case needs you or changes status.',
  },
  default: {
    Icon: Bell,
    text: 'Get alerted on this device when a case is assigned to you or its status changes.',
  },
};

export default function NotificationSettings() {
  const { showToast } = useToast();
  const [permission, setPermission] = useState(getPermissionState);
  const [isWorking, setIsWorking] = useState(false);

  const { Icon, text } = COPY[permission] || COPY.default;

  const handleEnable = async () => {
    setIsWorking(true);

    try {
      const result = await enablePushNotifications();
      setPermission(result);

      if (result === 'granted') {
        showToast('Notifications enabled on this device.', 'success');
      } else if (result === 'denied') {
        showToast('Notifications were blocked in the browser prompt.', 'warning');
      }
    } catch (err) {
      console.error('Enable notifications failed:', err);
      showToast(err.message || 'Could not enable notifications.', 'error');
      setPermission(getPermissionState());
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <Surface className="mt-6 p-6">
      <h2 className="text-lg font-extrabold text-slate-800 dark:text-slate-100">
        Notifications
      </h2>

      <div className="mt-3 flex items-start gap-3">
        <span className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400">
          <Icon size={20} strokeWidth={2.2} />
        </span>

        <p className="text-sm text-slate-500 dark:text-slate-400">{text}</p>
      </div>

      {permission === 'default' && (
        <Button
          onClick={handleEnable}
          disabled={isWorking}
          className="mt-4 w-full"
        >
          {isWorking ? 'Enabling...' : 'Enable notifications'}
        </Button>
      )}
    </Surface>
  );
}
