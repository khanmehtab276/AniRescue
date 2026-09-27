const { getChannel, CASE_NOTIFICATION_QUEUE } = require("../config/rabbitmq");
const { pool } = require("../config/db");
const { createNotification } = require("../utils/notifications");
const { sendPushNotification } = require("../utils/pushNotifications");
const {
  NOTIFICATION_RADIUS_KM,
  LOCATION_FRESHNESS_MINUTES,
} = require("../utils/caseNotifications");

const startCaseNotificationConsumer = async () => {
  const channel = getChannel();

  if (!channel) {
    console.error(
      "❌ Cannot start case notification consumer: RabbitMQ channel unavailable.",
    );
    return;
  }

  await channel.assertQueue(CASE_NOTIFICATION_QUEUE, {
    durable: true,
  });

  channel.prefetch(1);

  await channel.consume(
    CASE_NOTIFICATION_QUEUE,
    async (message) => {
      if (!message) {
        return;
      }

      try {
        const payload = JSON.parse(message.content.toString());

        const {
          reportId,
          validationPassed,
          species,
        } = payload;

        if (!reportId || !validationPassed) {
          console.warn(
            "⚠️ Invalid case notification event:",
            payload,
          );

          channel.ack(message);
          return;
        }

        console.log(
          `📢 Processing notification event for Case #${reportId}`,
        );

        const caseResult = await pool.query(
          `
          SELECT
            id,
            issue_description,
            latitude,
            longitude,
            species
          FROM rescue_cases
          WHERE id = $1
          `,
          [reportId],
        );

        const rescueCase = caseResult.rows[0];

        if (!rescueCase) {
          console.warn(
            `⚠️ Case #${reportId} no longer exists.`,
          );

          channel.ack(message);
          return;
        }

        if (
          rescueCase.latitude === null ||
          rescueCase.longitude === null
        ) {
          console.log(
            `ℹ️ Case #${reportId} has no coordinates. Skipping nearby volunteer notifications.`,
          );

          channel.ack(message);
          return;
        }

        const volunteerResult = await pool.query(
          `
          SELECT
            u.id,
            u.full_name,
            u.latitude,
            u.longitude
          FROM users u
          WHERE
            u.role = 'VOLUNTEER'
            AND u.account_status = 'ACTIVE'
            AND u.availability_status = 'AVAILABLE'
            AND u.latitude IS NOT NULL
            AND u.longitude IS NOT NULL
            AND u.location_updated_at >=
                CURRENT_TIMESTAMP - INTERVAL '5 minutes'
            AND (
              6371 * acos(
                LEAST(
                  1,
                  GREATEST(
                    -1,
                    cos(radians($1))
                    * cos(radians(u.latitude))
                    * cos(radians(u.longitude) - radians($2))
                    + sin(radians($1))
                    * sin(radians(u.latitude))
                  )
                )
              )
            ) <= $3
          `,
          [
            rescueCase.latitude,
            rescueCase.longitude,
            NOTIFICATION_RADIUS_KM,
            LOCATION_FRESHNESS_MINUTES,
          ],
        );

        console.log(
          `📍 Found ${volunteerResult.rows.length} nearby volunteer(s) for Case #${reportId}.`,
        );

        const detectedSpecies =
          species || rescueCase.species || "animal";

        for (const volunteer of volunteerResult.rows) {
          const notification = await createNotification({
            userId: volunteer.id,
            caseId: reportId,
            notificationType: "CASE_AVAILABLE",
            title: "New Rescue Case Nearby",
            message: `A ${detectedSpecies} rescue case is available near you.`,
          });

          if (!notification) {
            continue;
          }

          const tokenResult = await pool.query(
            `
            SELECT token
            FROM device_tokens
            WHERE user_id = $1
              AND is_active = TRUE
            `,
            [volunteer.id],
          );

          for (const device of tokenResult.rows) {
            try {
              await sendPushNotification({
                token: device.token,
                title: notification.title,
                body: notification.message,
                data: {
                  caseId: reportId,
                  notificationType: "CASE_AVAILABLE",
                },
              });

              console.log(
                `📲 Push notification sent to Volunteer #${volunteer.id}.`,
              );
            } catch (pushError) {
                const errorCode = pushError?.errorInfo?.code;

                console.error(
                    `⚠️ Push failed for Volunteer #${volunteer.id}:`,
                    pushError?.message || pushError,
                );

                if (
                    errorCode === "messaging/registration-token-not-registered" ||
                    errorCode === "messaging/invalid-registration-token"
                ) {
                    await pool.query(
                    `
                    UPDATE device_tokens
                    SET
                        is_active = FALSE,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE token = $1
                    `,
                    [device.token],
                    );

                    console.log(
                    `🧹 Deactivated invalid FCM token for Volunteer #${volunteer.id}.`,
                    );
                }
            }
          }
        }

        channel.ack(message);

        console.log(
          `✅ Case notification event acknowledged for Case #${reportId}.`,
        );
      } catch (error) {
        console.error(
          "❌ Case notification consumer error:",
          error?.stack || error,
        );

        /*
         * Do not endlessly requeue a malformed notification.
         * The YOLO result has already been processed successfully.
         */
        channel.ack(message);
      }
    },
    { noAck: false },
  );

  console.log(
    `👂 Listening on '${CASE_NOTIFICATION_QUEUE}' for case notification events...`,
  );
};

module.exports = {
  startCaseNotificationConsumer,
};