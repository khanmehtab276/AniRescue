const { pool } = require("../config/db");
const { createNotification } = require("./notifications");
const { sendPushNotification } = require("./pushNotifications");

const LOCATION_FRESHNESS_MINUTES = Number(
  process.env.LOCATION_FRESHNESS_MINUTES || 5,
);

const NOTIFICATION_RADIUS_KM = Number(
  process.env.NOTIFICATION_RADIUS_KM || 5,
);

const notifyVolunteerAboutNearbyCases = async ({ userId }) => {
  const volunteerResult = await pool.query(
    `
    SELECT
      id,
      full_name,
      latitude,
      longitude,
      location_updated_at
    FROM users
    WHERE
      id = $1
      AND role = 'VOLUNTEER'
      AND account_status = 'ACTIVE'
      AND availability_status = 'AVAILABLE'
      AND latitude IS NOT NULL
      AND longitude IS NOT NULL
      AND location_updated_at IS NOT NULL
      AND location_updated_at >=
          CURRENT_TIMESTAMP - ($2 * INTERVAL '1 minute')
    `,
    [userId, LOCATION_FRESHNESS_MINUTES],
  );

  if (volunteerResult.rows.length === 0) {
    console.log(
      `ℹ️ Volunteer #${userId} is not eligible for nearby case catch-up ` +
        `(not AVAILABLE, inactive, or location is stale).`,
    );

    return {
      notified: 0,
      reason: "volunteer_not_eligible",
    };
  }

  const volunteer = volunteerResult.rows[0];

  const caseResult = await pool.query(
    `
    SELECT
      id,
      species,
      latitude,
      longitude
    FROM rescue_cases
    WHERE
      status = 'VALIDATION_PASSED'
      AND assigned_volunteer_id IS NULL
      AND latitude IS NOT NULL
      AND longitude IS NOT NULL
      AND (
        6371 * acos(
          LEAST(
            1,
            GREATEST(
              -1,
              cos(radians($1))
              * cos(radians(latitude))
              * cos(radians(longitude) - radians($2))
              + sin(radians($1))
              * sin(radians(latitude))
            )
          )
        )
      ) <= $3
    ORDER BY created_at ASC
    `,
    [
      volunteer.latitude,
      volunteer.longitude,
      NOTIFICATION_RADIUS_KM,
    ],
  );

  console.log(
    `📍 Catch-up found ${caseResult.rows.length} nearby pending case(s) ` +
      `for Volunteer #${userId}.`,
  );

  let notifiedCount = 0;

  for (const rescueCase of caseResult.rows) {
    const detectedSpecies = rescueCase.species || "animal";

    const notification = await createNotification({
      userId,
      caseId: rescueCase.id,
      notificationType: "CASE_AVAILABLE",
      title: "New Rescue Case Nearby",
      message: `A ${detectedSpecies} rescue case is available near you.`,
    });

    // Already notified previously.
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
      [userId],
    );

    for (const device of tokenResult.rows) {
      try {
        await sendPushNotification({
          token: device.token,
          title: notification.title,
          body: notification.message,
          data: {
            caseId: rescueCase.id,
            notificationType: "CASE_AVAILABLE",
          },
        });

        console.log(
          `📲 Catch-up push sent to Volunteer #${userId} ` +
            `for Case #${rescueCase.id}.`,
        );
      } catch (pushError) {
        const errorCode = pushError?.errorInfo?.code;

        console.error(
          `⚠️ Catch-up push failed for Volunteer #${userId}:`,
          pushError?.message || pushError,
        );

        if (
          errorCode ===
            "messaging/registration-token-not-registered" ||
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
            `🧹 Deactivated invalid FCM token for Volunteer #${userId}.`,
          );
        }
      }
    }

    notifiedCount += 1;
  }

  return {
    notified: notifiedCount,
    radiusKm: NOTIFICATION_RADIUS_KM,
    freshnessMinutes: LOCATION_FRESHNESS_MINUTES,
  };
};

module.exports = {
  LOCATION_FRESHNESS_MINUTES,
  NOTIFICATION_RADIUS_KM,
  notifyVolunteerAboutNearbyCases,
};
