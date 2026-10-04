const { pool } = require("../config/db");
const { notifyUser } = require("../utils/notifications");

const ALLOWED_CATEGORIES = new Set([
  "PLATFORM",
  "RESCUE_EXPERIENCE",
  "VOLUNTEER_EXPERIENCE",
  "NGO_EXPERIENCE",
  "SUGGESTION",
  "OTHER",
]);

const normalizeCategory = (value) =>
  typeof value === "string" ? value.trim().toUpperCase() : "";

const submitFeedback = async (req, res) => {
  const category = normalizeCategory(req.body?.category || "PLATFORM");
  const rating = Number(req.body?.rating);
  const message =
    typeof req.body?.message === "string" ? req.body.message.trim() : "";
  const caseId =
    req.body?.caseId === null ||
    req.body?.caseId === undefined ||
    req.body?.caseId === ""
      ? null
      : Number(req.body.caseId);

  if (!ALLOWED_CATEGORIES.has(category)) {
    return res.status(400).json({
      error: "Please choose a valid feedback category.",
    });
  }

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({
      error: "Rating must be a whole number from 1 to 5.",
    });
  }

  if (message.length > 2000) {
    return res.status(400).json({
      error: "Feedback cannot be longer than 2000 characters.",
    });
  }

  if (caseId !== null && (!Number.isInteger(caseId) || caseId <= 0)) {
    return res.status(400).json({
      error: "Case ID must be a valid positive number.",
    });
  }

  try {
    if (caseId !== null) {
      const caseResult = await pool.query(
        `SELECT id, reporter_id, assigned_volunteer_id, status, latitude, longitude
         FROM rescue_cases
         WHERE id = $1`,
        [caseId],
      );

      if (caseResult.rows.length === 0) {
        return res.status(404).json({
          error: "Rescue case not found.",
        });
      }

      const rescueCase = caseResult.rows[0];
      const role = (req.user.role || "").toUpperCase();

      if (role === "ADMIN") {
        // Administrators may leave feedback on any case.
      } else if (
        Number(rescueCase.reporter_id) !== Number(req.user.id) &&
        Number(rescueCase.assigned_volunteer_id) !== Number(req.user.id)
      ) {
        // NGOs need a jurisdiction-aware check instead of broad case access.
        if (role !== "NGO") {
          return res.status(403).json({
            error: "You can only attach feedback to a case you are involved with.",
          });
        }

        if (
          rescueCase.latitude === null ||
          rescueCase.longitude === null
        ) {
          return res.status(403).json({
            error: "This case cannot be verified against your NGO jurisdiction.",
          });
        }

        const jurisdictionResult = await pool.query(
          `SELECT jurisdiction_lat, jurisdiction_lng, jurisdiction_radius_km
           FROM users
           WHERE id = $1
             AND role = 'NGO'`,
          [req.user.id],
        );

        const ngo = jurisdictionResult.rows[0];

        if (
          !ngo ||
          ngo.jurisdiction_lat === null ||
          ngo.jurisdiction_lng === null
        ) {
          return res.status(403).json({
            error: "Your NGO operating jurisdiction is not configured.",
          });
        }

        const distanceResult = await pool.query(
          `SELECT
             6371 * acos(
               LEAST(
                 1,
                 GREATEST(
                   -1,
                   cos(radians($1))
                   * cos(radians($2))
                   * cos(radians($3) - radians($4))
                   + sin(radians($1))
                   * sin(radians($2))
                 )
               )
             ) AS distance_km`,
          [
            ngo.jurisdiction_lat,
            rescueCase.latitude,
            rescueCase.longitude,
            ngo.jurisdiction_lng,
          ],
        );

        const distanceKm = Number(distanceResult.rows[0]?.distance_km);
        const radiusKm = Number(ngo.jurisdiction_radius_km || 15);

        if (!Number.isFinite(distanceKm) || distanceKm > radiusKm) {
          return res.status(403).json({
            error: "This case is outside your NGO jurisdiction.",
          });
        }
      }
    }

    const result = await pool.query(
      `INSERT INTO feedback
         (user_id, category, rating, message, case_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, category, rating, message, case_id, created_at`,
      [req.user.id, category, rating, message || null, caseId],
    );

    // Admin notification is deliberately non-blocking: feedback is already
    // persisted and must remain successful even if push delivery is unavailable.
    pool.query(
      `SELECT id FROM users WHERE role = 'ADMIN' AND account_status = 'ACTIVE'`,
    )
      .then(async (adminResult) => {
        for (const admin of adminResult.rows) {
          await notifyUser({
            userId: admin.id,
            notificationType: "FEEDBACK_RECEIVED",
            title: "New platform feedback",
            message: "A " + String(req.user.role || "user").toLowerCase() + " user submitted new feedback.",
          });
        }
      })
      .catch((error) => {
        console.error("Feedback admin notification failed (non-fatal):", error?.message || error);
      });

    return res.status(201).json({
      success: true,
      feedback: result.rows[0],
    });
  } catch (error) {
    console.error("Submit feedback error:", error);

    return res.status(500).json({
      error: "Feedback could not be submitted right now. Please try again.",
    });
  }
};

const listMyFeedback = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, category, rating, message, case_id, created_at
       FROM feedback
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.user.id],
    );

    return res.json({ feedback: result.rows });
  } catch (error) {
    console.error("My feedback list error:", error);

    return res.status(500).json({
      error: "Failed to load your feedback.",
    });
  }
};

const listAllFeedback = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         f.id,
         f.category,
         f.rating,
         f.message,
         f.case_id,
         f.created_at,
         u.id AS user_id,
         u.full_name AS user_name,
         u.email AS user_email,
         u.role AS user_role
       FROM feedback f
       INNER JOIN users u ON u.id = f.user_id
       ORDER BY f.created_at DESC
       LIMIT 200`,
    );

    return res.json({ feedback: result.rows });
  } catch (error) {
    console.error("Admin feedback list error:", error);

    return res.status(500).json({
      error: "Failed to load platform feedback.",
    });
  }
};

module.exports = {
  submitFeedback,
  listMyFeedback,
  listAllFeedback,
};
