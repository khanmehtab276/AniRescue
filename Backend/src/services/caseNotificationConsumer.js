const { getChannel, CASE_NOTIFICATION_QUEUE } = require("../config/rabbitmq");
const { pool } = require("../config/db");
const { notifyCaseRecipients } = require("../utils/caseNotificationRecipients");

let activeConsumerChannel = null;

const startCaseNotificationConsumer = async () => {
  const channel = getChannel();

  if (!channel) {
    console.error(
      "❌ Cannot start case notification consumer: RabbitMQ channel unavailable.",
    );
    return;
  }

  if (activeConsumerChannel === channel) {
    return;
  }

  await channel.assertQueue(CASE_NOTIFICATION_QUEUE, {
    durable: true,
  });

  channel.prefetch(1);

  await channel.consume(
    CASE_NOTIFICATION_QUEUE,
    async (message) => {
      if (!message) return;

      try {
        const payload = JSON.parse(message.content.toString());
        const { reportId, validationPassed, species } = payload;

        if (!reportId || typeof validationPassed !== "boolean") {
          console.warn("⚠️ Invalid case notification event:", payload);
          channel.ack(message);
          return;
        }

        console.log(
          `📢 Processing notification event for Case #${reportId}`,
        );

        const caseResult = await pool.query(
          `
            SELECT id, species
            FROM rescue_cases
            WHERE id = $1
          `,
          [reportId],
        );

        const rescueCase = caseResult.rows[0];

        if (!rescueCase) {
          console.warn(`⚠️ Case #${reportId} no longer exists.`);
          channel.ack(message);
          return;
        }

        const detectedSpecies =
          species || rescueCase.species || "animal";

        if (validationPassed) {
          const result = await notifyCaseRecipients({
            caseId: reportId,
            notificationType: "VALIDATION_PASSED",
            title: "Rescue report verified 🐾",
            message: `The ${detectedSpecies} rescue report has been verified and is now available for rescue.`,
            includeReporter: true,
            includeNearbyVolunteers: true,
            includeNearbyNgos: true,
            includeAdmins: true,
          });

          console.log(
            `📨 Case #${reportId} verified notifications sent to ${result.notified} recipient(s).`,
          );
        } else {
          const result = await notifyCaseRecipients({
            caseId: reportId,
            notificationType: "VALIDATION_REJECTED",
            title: "Rescue report needs review",
            message:
              "Our AI check could not verify this report. An authorized rescue team can review it if needed.",
            includeReporter: true,
            includeNearbyNgos: true,
            includeAdmins: true,
          });

          console.log(
            `📨 Case #${reportId} review notifications sent to ${result.notified} recipient(s).`,
          );
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

        const retryCount = Number(
          message.properties?.headers?.["x-retry-count"] || 0,
        );

        if (retryCount < 3) {
          try {
            channel.sendToQueue(
              CASE_NOTIFICATION_QUEUE,
              message.content,
              {
                persistent: true,
                contentType: "application/json",
                headers: {
                  ...(message.properties?.headers || {}),
                  "x-retry-count": retryCount + 1,
                },
              },
            );

            await channel.waitForConfirms();
            channel.ack(message);
          } catch (requeueError) {
            console.error(
              "Failed to requeue case notification:",
              requeueError?.message || requeueError,
            );
            channel.nack(message, false, true);
          }
        } else {
          channel.ack(message);
          console.error(
            `🛑 Dropping case notification after ${retryCount} retries.`,
          );
        }
      }
    },
    { noAck: false },
  );

  activeConsumerChannel = channel;

  console.log(
    `👂 Listening on '${CASE_NOTIFICATION_QUEUE}' for case notification events...`,
  );
};

module.exports = {
  startCaseNotificationConsumer,
};
