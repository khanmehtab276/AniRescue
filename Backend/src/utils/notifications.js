const { pool } = require("../config/db");
const { sendPushNotification } = require("./pushNotifications");

const createNotification = async ({
  userId,
  caseId = null,
  notificationType,
  title,
  message,
  throwOnError = false,
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
    if (throwOnError) throw error;

    console.error(
      "Failed to persist notification (non-fatal):",
      error?.message || error,
    );
    return null;
  }
};

const notifyUsers = async ({
  userIds,
  caseId = null,
  notificationType,
  title,
  message,
}) => {
  const uniqueUserIds = [
    ...new Set(
      (Array.isArray(userIds) ? userIds : [])
        .map(Number)
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];

  if (uniqueUserIds.length === 0) return { notified: 0, recipients: 0 };

  const notificationResult = await pool.query(
    `INSERT INTO notifications
       (user_id, case_id, notification_type, title, message)
     SELECT
       unnest($1::integer[]),
       $2,
       $3,
       $4,
       $5
     ON CONFLICT (user_id, case_id, notification_type)
     DO NOTHING
     RETURNING id, user_id, case_id, notification_type, title, message`,
    [uniqueUserIds, caseId, notificationType, title, message],
  );

  if (notificationResult.rows.length === 0) {
    return { notified: 0, recipients: uniqueUserIds.length };
  }

  const tokens = await pool.query(
    `SELECT user_id, token
     FROM device_tokens
     WHERE user_id = ANY($1::integer[])
       AND is_active = TRUE`,
    [uniqueUserIds],
  );

  const invalidTokens = new Set();

  await Promise.all(
    tokens.rows.map(async (device) => {
      const notification = notificationResult.rows.find(
        (row) => Number(row.user_id) === Number(device.user_id),
      );

      if (!notification) return;

      try {
        await sendPushNotification({
          token: device.token,
          title: notification.title,
          body: notification.message,
          data: {
            caseId: caseId ?? "",
            notificationType,
            notificationId: notification.id,
          },
        });
      } catch (pushError) {
        const errorCode = pushError?.errorInfo?.code;

        console.error(
          `⚠️ Notification push failed for User #${device.user_id}:`,
          pushError?.message || pushError,
        );

        if (
          errorCode === "messaging/registration-token-not-registered" ||
          errorCode === "messaging/invalid-registration-token"
        ) {
          invalidTokens.add(device.token);
        }
      }
    }),
  );

  if (invalidTokens.size > 0) {
    await pool.query(
      `UPDATE device_tokens
       SET is_active = FALSE,
           updated_at = CURRENT_TIMESTAMP
       WHERE token = ANY($1::text[])`,
      [[...invalidTokens]],
    );
  }

  return {
    notified: notificationResult.rows.length,
    recipients: uniqueUserIds.length,
  };
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
            notificationId: notification.id,
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
  notifyUsers,
};
