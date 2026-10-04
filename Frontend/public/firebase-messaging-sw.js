/* AniRescue push service worker.
 *
 * Registered under its own scope (see src/services/pushNotifications.js)
 * so it never competes with the PWA's caching service worker.
 *
 * The backend sends FCM messages with a `notification` block plus a
 * `data` block (which includes caseId). Background/closed-app web push
 * is rendered as an OS notification here. Foreground messages are
 * handled by Firebase Messaging's onMessage() listener in PushBridge.
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // Keep the empty payload fallback from the initialization above.
  }

  const notification = payload.notification || {};
  const data = payload.data || {};

  const title = notification.title || data.title || 'AniRescue';
  const body = notification.body || data.body || '';

  const tag = data.notificationId
    ? `notification-${data.notificationId}`
    : data.caseId
      ? `case-${data.caseId}`
      : `anirescue-${Date.now()}`;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      image: data.imageUrl || undefined,
      tag,
      renotify: true,
      silent: false,
      vibrate: [60, 80, 60],
      timestamp: Date.now(),
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const caseId = event.notification.data && event.notification.data.caseId;
  const target = caseId ? `/cases/${caseId}` : '/';

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      for (const client of windows) {
        if ('focus' in client) {
          await client.focus();
          // This worker has its own scope, so it does not control the
          // app window and cannot call client.navigate(). Hand the
          // target to the page and let the router navigate.
          client.postMessage({ type: 'ANIRESCUE_NAVIGATE', url: target });
          return;
        }
      }

      await self.clients.openWindow(target);
    })(),
  );
});
