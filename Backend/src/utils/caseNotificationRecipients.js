const { pool } = require("../config/db");
const { notifyUsers } = require("./notifications");

const getCaseRecipients = async ({
  caseId,
  includeReporter = false,
  includeAssignedVolunteer = false,
  includeNearbyVolunteers = false,
  includeNearbyNgos = false,
  includeAdmins = false,
}) => {
  const caseResult = await pool.query(
    `
      SELECT id, reporter_id, assigned_volunteer_id, latitude, longitude
      FROM rescue_cases
      WHERE id = $1
    `,
    [caseId],
  );

  const rescueCase = caseResult.rows[0];
  if (!rescueCase) return [];

  const recipientIds = new Set();

  if (includeReporter && rescueCase.reporter_id) {
    recipientIds.add(Number(rescueCase.reporter_id));
  }

  if (includeAssignedVolunteer && rescueCase.assigned_volunteer_id) {
    recipientIds.add(Number(rescueCase.assigned_volunteer_id));
  }

  if (includeAdmins) {
    const adminResult = await pool.query(
      `
        SELECT id
        FROM users
        WHERE role = 'ADMIN'
          AND account_status = 'ACTIVE'
      `,
    );

    for (const row of adminResult.rows) {
      recipientIds.add(Number(row.id));
    }
  }

  if (
    (includeNearbyVolunteers || includeNearbyNgos) &&
    rescueCase.latitude !== null &&
    rescueCase.longitude !== null
  ) {
    const radiusKm = Number(process.env.NOTIFICATION_RADIUS_KM || 5);
    const freshnessMinutes = Number(
      process.env.LOCATION_FRESHNESS_MINUTES || 5,
    );

    if (includeNearbyVolunteers) {
      const volunteerResult = await pool.query(
        `
          SELECT u.id
          FROM users u
          WHERE u.role = 'VOLUNTEER'
            AND u.account_status = 'ACTIVE'
            AND u.availability_status = 'AVAILABLE'
            AND u.latitude IS NOT NULL
            AND u.longitude IS NOT NULL
            AND u.location_updated_at IS NOT NULL
            AND u.location_updated_at >=
              CURRENT_TIMESTAMP - ($4 * INTERVAL '1 minute')
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
          radiusKm,
          freshnessMinutes,
        ],
      );

      for (const row of volunteerResult.rows) {
        recipientIds.add(Number(row.id));
      }
    }

    if (includeNearbyNgos) {
      const ngoResult = await pool.query(
        `
          SELECT u.id
          FROM users u
          WHERE u.role = 'NGO'
            AND u.account_status = 'ACTIVE'
            AND u.jurisdiction_lat IS NOT NULL
            AND u.jurisdiction_lng IS NOT NULL
            AND (
              6371 * acos(
                LEAST(
                  1,
                  GREATEST(
                    -1,
                    cos(radians(u.jurisdiction_lat))
                    * cos(radians($1))
                    * cos(radians($2) - radians(u.jurisdiction_lng))
                    + sin(radians(u.jurisdiction_lat))
                    * sin(radians($1))
                  )
                )
              )
            ) <= COALESCE(u.jurisdiction_radius_km, 15)
        `,
        [rescueCase.latitude, rescueCase.longitude],
      );

      for (const row of ngoResult.rows) {
        recipientIds.add(Number(row.id));
      }
    }
  }

  return [...recipientIds];
};

const notifyCaseRecipients = async ({
  caseId,
  notificationType,
  title,
  message,
  includeReporter = false,
  includeAssignedVolunteer = false,
  includeNearbyVolunteers = false,
  includeNearbyNgos = false,
  includeAdmins = false,
}) => {
  try {
    const userIds = await getCaseRecipients({
      caseId,
      includeReporter,
      includeAssignedVolunteer,
      includeNearbyVolunteers,
      includeNearbyNgos,
      includeAdmins,
    });

    return await notifyUsers({
      userIds,
      caseId,
      notificationType,
      title,
      message,
    });
  } catch (error) {
    console.error(
      "Case stakeholder notification failed (non-fatal):",
      error?.message || error,
    );

    return { notified: 0, recipients: 0 };
  }
};

module.exports = {
  getCaseRecipients,
  notifyCaseRecipients,
};
