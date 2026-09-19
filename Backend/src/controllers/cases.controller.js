const { pool } = require("../config/db");
const { getChannel, QUEUE_NAME } = require("../config/rabbitmq");
const apiCache = require("../utils/cache");
const { normalizeEnum } = require("../utils/helpers");

const VALID_STATUSES = [
  "PENDING_VALIDATION",
  "PROCESSING_ANALYSIS",
  "VALIDATION_PASSED",
  "REJECTED_JUNK",
  "IN_PROGRESS",
  "RESOLVED",
  "CANCELLED",
];

// 1. SUBMIT CASE
const reportCase = async (req, res) => {
  const { location, description, imageUrl } = req.body;

  const reporterId = req.user.id;

  if (!description) {
    return res.status(400).json({
      error: "Rescue case description is required.",
    });
  }

  try {
    const lat = location?.lat ?? null;
    const lng = location?.lng ?? null;
    const manualAddress = location?.address ?? null;
    const isCustom = location?.isCustom ?? location?.isManual ?? false;

    const result = await pool.query(
      `INSERT INTO rescue_cases
          (issue_description, latitude, longitude, manual_address, is_custom_location, image_payload, reporter_id, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDING_VALIDATION')
         RETURNING id, status, image_payload, created_at`,
      [
        description.trim(),
        lat,
        lng,
        manualAddress,
        isCustom,
        imageUrl || null,
        reporterId,
      ],
    );

    const savedCase = result.rows[0];

    apiCache.flushAll();

    // Send case to YOLO worker through RabbitMQ.
    const rabbitChannel = getChannel();

    if (rabbitChannel) {
      const messagePayload = JSON.stringify({
        reportId: savedCase.id,
        imageUrl: savedCase.image_payload,
      });

      rabbitChannel.sendToQueue(QUEUE_NAME, Buffer.from(messagePayload), {
        persistent: true,
      });

      console.log(`📡 Case #${savedCase.id} queued for YOLO evaluation.`);
    } else {
      console.warn(
        `⚠️ Case #${savedCase.id} saved, but RabbitMQ is currently unavailable.`,
      );
    }

    res.status(201).json({ success: true, case: savedCase });
  } catch (err) {
    console.error("Failed to report rescue case:", err?.stack || err);

    res.status(500).json({
      error: "Failed to submit rescue case.",
    });
  }
};

// 2. FETCH REJECTED JUNK QUEUE
const getJunkQueue = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, species, issue_description, priority, latitude, longitude, image_payload, created_at
         FROM rescue_cases
         WHERE status = 'REJECTED_JUNK'
         ORDER BY created_at DESC`,
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Junk review queue fetch error:", err);

    res.status(500).json({
      error: "Failed to retrieve junk review queue.",
    });
  }
};

// 3. ADMIN/NGO JUNK REVIEW OVERRIDE
const verifyJunkCase = async (req, res) => {
  const { id } = req.params;
  const { approved } = req.body;

  if (typeof approved !== "boolean") {
    return res.status(400).json({
      error: "The approved field must be a boolean.",
    });
  }

  const newStatus = approved ? "VALIDATION_PASSED" : "REJECTED_JUNK";

  try {
    const result = await pool.query(
      `UPDATE rescue_cases SET status = $1 WHERE id = $2 RETURNING *`,
      [newStatus, id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Case not found." });
    }

    apiCache.flushAll();

    res.json({ success: true, case: result.rows[0] });
  } catch (err) {
    console.error("Junk verification override error:", err);

    res.status(500).json({
      error: "Failed to update junk verification state.",
    });
  }
};

// 4. HAVERSINE 5KM NEARBY VOLUNTEERS
const getNearbyVolunteers = async (req, res) => {
  const { id } = req.params;

  try {
    const caseResult = await pool.query(
      `SELECT latitude, longitude FROM rescue_cases WHERE id = $1`,
      [id],
    );

    if (caseResult.rows.length === 0) {
      return res.status(404).json({ error: "Case not found." });
    }

    const { latitude, longitude } = caseResult.rows[0];

    if (
      latitude === null ||
      latitude === undefined ||
      longitude === null ||
      longitude === undefined
    ) {
      return res.status(400).json({ error: "Case lacks GPS coordinates." });
    }

    const volunteers = await pool.query(
      `SELECT * FROM (
           SELECT id, full_name, email,
             (6371 * acos(LEAST(1, GREATEST(-1,
               cos(radians($1)) * cos(radians(latitude)) * cos(radians(longitude) - radians($2))
               + sin(radians($1)) * sin(radians(latitude))
             )))) AS distance_km
           FROM users
           WHERE LOWER(role) = 'volunteer'
             AND latitude IS NOT NULL
             AND longitude IS NOT NULL
         ) AS nearby
         WHERE distance_km <= 5.0
         ORDER BY distance_km ASC`,
      [latitude, longitude],
    );

    res.json({
      caseId: id,
      totalNearby: volunteers.rows.length,
      volunteers: volunteers.rows,
    });
  } catch (err) {
    console.error("Haversine search error:", err);

    res.status(500).json({
      error: "Failed to find nearby volunteers within 5km radius.",
    });
  }
};

// 5. AVAILABLE CASES FOR VOLUNTEERS
const getAvailableCasesForVolunteers = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, species, issue_description, priority, latitude, longitude, manual_address, image_payload, created_at
         FROM rescue_cases
         WHERE status = 'VALIDATION_PASSED' AND assigned_volunteer_id IS NULL
         ORDER BY created_at DESC`,
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Available cases fetch error:", err);

    res.status(500).json({
      error: "Failed to load available cases feed.",
    });
  }
};

// 6. ATOMIC CLAIM CASE
const claimCase = async (req, res) => {
  const caseId = req.params.id;
  const volunteerId = req.user.id;

  try {
    const result = await pool.query(
      `UPDATE rescue_cases
         SET status = 'IN_PROGRESS', assigned_volunteer_id = $1
         WHERE id = $2 AND status = 'VALIDATION_PASSED' AND assigned_volunteer_id IS NULL
         RETURNING *`,
      [volunteerId, caseId],
    );

    if (result.rows.length === 0) {
      return res.status(409).json({
        error: "Case is already claimed or not verified for rescue.",
      });
    }

    apiCache.flushAll();

    res.json({ success: true, case: result.rows[0] });
  } catch (err) {
    console.error("Claim case error:", err);

    res.status(500).json({ error: "Failed to claim case." });
  }
};

// 7. GENERAL STATUS UPDATE
const updateCaseStatus = async (req, res) => {
  const { id } = req.params;
  const normalizedStatus = normalizeEnum(req.body.status);
  const volunteerId = req.user.id;

  if (!VALID_STATUSES.includes(normalizedStatus)) {
    return res.status(400).json({
      error: `Invalid status value. Permitted: [${VALID_STATUSES.join(", ")}]`,
    });
  }

  try {
    let result;

    const userRole = (req.user.role || "").toUpperCase();

    if (userRole === "ADMIN") {
      result = await pool.query(
        `UPDATE rescue_cases SET status = $1 WHERE id = $2 RETURNING *`,
        [normalizedStatus, id],
      );
    } else {
      result = await pool.query(
        `UPDATE rescue_cases SET status = $1 WHERE id = $2 AND assigned_volunteer_id = $3 RETURNING *`,
        [normalizedStatus, id, volunteerId],
      );
    }

    if (result.rows.length === 0) {
      return res.status(403).json({
        error: "Operation prohibited or case is not assigned to you.",
      });
    }

    apiCache.flushAll();

    res.json({ success: true, case: result.rows[0] });
  } catch (err) {
    console.error("Status update error:", err);

    res.status(500).json({ error: "Failed to update case status." });
  }
};

// 8. MAP DATA (public — no auth)
const getMapData = async (req, res) => {
  try {
    if (apiCache.has("map_data")) {
      return res.json(apiCache.get("map_data"));
    }

    const result = await pool.query(
      `SELECT id, species, issue_description, priority, latitude, longitude, status
         FROM rescue_cases
         WHERE status NOT IN ('RESOLVED', 'REJECTED_JUNK', 'CANCELLED')
           AND latitude IS NOT NULL AND longitude IS NOT NULL`,
    );

    apiCache.set("map_data", result.rows);

    res.json(result.rows);
  } catch (err) {
    console.error("Map data fetch error:", err);

    res.status(500).json({
      error: "Failed to retrieve active map entries.",
    });
  }
};

// 9. ALL CASES DASHBOARD FEED
// NOTE: currently returns the same master list to VOLUNTEER/NGO/ADMIN.
// Per the current RBAC direction this still needs role-specific filtering
// (VOLUNTEER -> assigned/available, NGO -> jurisdiction, ADMIN -> system-wide)
// left as-is here so behavior doesn't silently change until that's implemented.
const getDashboardCases = async (req, res) => {
  try {
    const skipCache = req.query.nocache === "true";

    if (!skipCache && apiCache.has("dashboard_data")) {
      return res.json(apiCache.get("dashboard_data"));
    }

    const result = await pool.query(
      `SELECT id, species, issue_description, priority, status, manual_address, latitude, longitude,
              image_payload, assigned_volunteer_id, created_at
         FROM rescue_cases
         ORDER BY created_at DESC
         LIMIT 100`,
    );

    if (!skipCache) {
      apiCache.set("dashboard_data", result.rows);
    }

    res.json(result.rows);
  } catch (err) {
    console.error("Dashboard query error:", err);

    res.status(500).json({
      error: "Failed to fetch dashboard records.",
    });
  }
};

module.exports = {
  reportCase,
  getJunkQueue,
  verifyJunkCase,
  getNearbyVolunteers,
  getAvailableCasesForVolunteers,
  claimCase,
  updateCaseStatus,
  getMapData,
  getDashboardCases,
};
