const { getMessaging } = require("firebase-admin/messaging");
const { getFirebaseAdmin } = require("../config/firebase");

const sendPushNotification = async ({
  token,
  title,
  body,
  data = {},
}) => {
  if (!token) {
    throw new Error("FCM device token is required.");
  }

  const admin = getFirebaseAdmin();

  if (!admin) {
    throw new Error("Push notifications are not configured for this deployment.");
  }

  const message = {
    token,
    notification: {
      title,
      body,
    },
    data: Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, String(value)]),
    ),
    webpush: {
      notification: {
        icon: "/pwa-192x192.png",
        badge: "/pwa-192x192.png",
        silent: false,
        renotify: true,
      },
    },
  };

  return getMessaging().send(message);
};

module.exports = {
  sendPushNotification,
};
