const admin = require("../config/firebase");
const { getMessaging } = require("firebase-admin/messaging");

const sendPushNotification = async ({
  token,
  title,
  body,
  data = {},
}) => {
  if (!token) {
    throw new Error("FCM device token is required.");
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
  };

  return getMessaging().send(message);
};

module.exports = {
  sendPushNotification,
};