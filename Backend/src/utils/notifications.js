const { pool } = require("../config/db");
const { sendPushNotification } = require("./pushNotifications");

const createNotification = async ({
  userId,
  caseId = null,
  notificationType,
  title,
  message,
}) => {
  try {
    const result = await pool.query(
      `INSERT INTO notifications
         (user_id, case_id, notification_type, title, message)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, case_id, notification_type)
       DO NOTHING
       RETURNING id, user_id, case_id, notification_type, title, message, is_read, created_at`,
      [userId, caseId, notificationType, title, message],
    );

    return result.rows[0] || null;
  } catch (error) {
    console.error(
      "Failed to persist notification (non-fatal):",
      error?.message || error,
    );
    return null;
  }
};

const notifyUser = async ({
  userId,
  caseId = null,
  notificationType,
  title,
  message,
}) => {
  const notification = await createNotification({
    userId,
    caseId,
    notificationType,
    title,
    message,
  });

  if (!notification) return null;

  try {
    const tokenResult = await pool.query(
      `SELECT token
       FROM device_tokens
       WHERE user_id = $1
         AND is_active = TRUE`,
      [userId],
    );

    for (const device of tokenResult.rows) {
      try {
        await sendPushNotification({
          token: device.token,
          title: notification.title,
          body: notification.message,
          data: {
            caseId: caseId ?? "",
            notificationType,
          },
        });
      } catch (pushError) {
        const errorCode = pushError?.errorInfo?.code;

        console.error(
          `⚠️ Notification push failed for User #${userId}:`,
          pushError?.message || pushError,
        );

        if (
          errorCode === "messaging/registration-token-not-registered" ||
          errorCode === "messaging/invalid-registration-token"
        ) {
          await pool.query(
            `UPDATE device_tokens
             SET is_active = FALSE,
                 updated_at = CURRENT_TIMESTAMP
             WHERE token = $1`,
            [device.token],
          );
        }
      }
    }
  } catch (error) {
    console.error(
      "Notification delivery lookup failed (non-fatal):",
      error?.message || error,
    );
  }

  return notification;
};

module.exports = {
  createNotification,
  notifyUser,
};
