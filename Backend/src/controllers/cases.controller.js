const { pool } = require("../config/db");
const { getChannel, QUEUE_NAME } = require("../config/rabbitmq");
const apiCache = require("../utils/cache");
const { normalizeEnum } = require("../utils/helpers");
const { logCaseHistory } = require("../utils/caseHistory");
const { haversineKm } = require("../utils/geo");
const {
  canCancel,
  canSubmitEvidence,
  canVerifyCompletion,
} = require("../utils/statusTransitions");

const VALID_PRIORITIES = ["LOW", "STANDARD", "HIGH", "CRITICAL"];

const CASE_FIELDS = `
  id, species, issue_description, priority, status, manual_address,
  latitude, longitude, is_custom_location, image_payload,
  evidence_image_payload, evidence_notes, rejection_reason,
  reporter_id, assigned_volunteer_id, verified_by,
  created_at, completed_at, resolved_at
`;

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
         RETURNING id, status, priority, image_payload, created_at`,
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

    await logCaseHistory({
      caseId: savedCase.id,
      actorId: reporterId,
      actorRole: req.user.role,
      action: "CASE_REPORTED",
      toStatus: "PENDING_VALIDATION",
    });

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

    await logCaseHistory({
      caseId: id,
      actorId: req.user.id,
      actorRole: req.user.role,
      action: "JUNK_REVIEW_OVERRIDE",
      toStatus: newStatus,
    });

    res.json({ success: true, case: result.rows[0] });
  } catch (err) {
    console.error("Junk verification override error:", err);

    res.status(500).json({
      error: "Failed to update junk verification state.",
    });
  }
};

// 4. HAVERSINE 5KM NEARBY VOLUNTEERS (NGO/ADMIN dispatch tool)
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

// 5. AVAILABLE CASES FOR VOLUNTEERS (eligible-to-claim only)
const getAvailableCasesForVolunteers = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, species, issue_description, priority, latitude, longitude, manual_address, image_payload, created_at
         FROM rescue_cases
         WHERE status = 'VALIDATION_PASSED' AND assigned_volunteer_id IS NULL
         ORDER BY
           CASE priority
             WHEN 'CRITICAL' THEN 0
             WHEN 'HIGH' THEN 1
             WHEN 'STANDARD' THEN 2
             ELSE 3
           END,
           created_at DESC`,
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Available cases fetch error:", err);

    res.status(500).json({
      error: "Failed to load available cases feed.",
    });
  }
};

// 6. MY REPORTED CASES (personal USER dashboard)
const getMyCases = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ${CASE_FIELDS}
         FROM rescue_cases
         WHERE reporter_id = $1
         ORDER BY created_at DESC`,
      [req.user.id],
    );

    res.json(result.rows);
  } catch (err) {
    console.error("My cases fetch error:", err);

    res.status(500).json({
      error: "Failed to fetch your reported cases.",
    });
  }
};

// 7. ATOMIC CLAIM CASE (VOLUNTEER, ADMIN only — NGO dispatches, doesn't claim personally)
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

    await logCaseHistory({
      caseId,
      actorId: volunteerId,
      actorRole: req.user.role,
      action: "CASE_CLAIMED",
      fromStatus: "VALIDATION_PASSED",
      toStatus: "IN_PROGRESS",
    });

    res.json({ success: true, case: result.rows[0] });
  } catch (err) {
    console.error("Claim case error:", err);

    res.status(500).json({ error: "Failed to claim case." });
  }
};

// 8. CANCEL CASE (the only transition the generic status endpoint still allows)
const cancelCase = async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const role = req.user.role;

  try {
    const caseResult = await pool.query(
      `SELECT status, assigned_volunteer_id FROM rescue_cases WHERE id = $1`,
      [id],
    );

    if (caseResult.rows.length === 0) {
      return res.status(404).json({ error: "Case not found." });
    }

    const currentCase = caseResult.rows[0];

    const isAssignedToCaller =
      currentCase.assigned_volunteer_id === req.user.id;

    if (
      (role || "").toUpperCase() !== "ADMIN" &&
      !isAssignedToCaller
    ) {
      return res.status(403).json({
        error: "You can only cancel a case assigned to you.",
      });
    }

    if (!canCancel(role, currentCase.status)) {
      return res.status(403).json({
        error: `Cannot cancel a case in status ${currentCase.status}.`,
      });
    }

    const result = await pool.query(
      `UPDATE rescue_cases
         SET status = 'CANCELLED', rejection_reason = $1
         WHERE id = $2
         RETURNING *`,
      [reason || null, id],
    );

    apiCache.flushAll();

    await logCaseHistory({
      caseId: id,
      actorId: req.user.id,
      actorRole: role,
      action: "CASE_CANCELLED",
      fromStatus: currentCase.status,
      toStatus: "CANCELLED",
      notes: reason || null,
    });

    res.json({ success: true, case: result.rows[0] });
  } catch (err) {
    console.error("Cancel case error:", err);

    res.status(500).json({ error: "Failed to cancel case." });
  }
};

// 9. SUBMIT RESCUE EVIDENCE (IN_PROGRESS -> RESCUE_COMPLETED)
const submitRescueEvidence = async (req, res) => {
  const { id } = req.params;
  const { evidenceImageUrl, notes } = req.body;
  const role = req.user.role;

  if (!evidenceImageUrl) {
    return res.status(400).json({
      error: "Evidence image is required to mark a rescue complete.",
    });
  }

  try {
    const caseResult = await pool.query(
      `SELECT status, assigned_volunteer_id FROM rescue_cases WHERE id = $1`,
      [id],
    );

    if (caseResult.rows.length === 0) {
      return res.status(404).json({ error: "Case not found." });
    }

    const currentCase = caseResult.rows[0];

    const isAssignedToCaller =
      currentCase.assigned_volunteer_id === req.user.id;

    if (
      !canSubmitEvidence({
        role,
        isAssignedToCaller,
        fromStatus: currentCase.status,
      })
    ) {
      return res.status(403).json({
        error:
          "You can only submit rescue evidence for a case assigned to you that is currently in progress.",
      });
    }

    const result = await pool.query(
      `UPDATE rescue_cases
         SET status = 'RESCUE_COMPLETED',
             evidence_image_payload = $1,
             evidence_notes = $2,
             completed_at = NOW()
         WHERE id = $3
         RETURNING *`,
      [evidenceImageUrl, notes || null, id],
    );

    apiCache.flushAll();

    await logCaseHistory({
      caseId: id,
      actorId: req.user.id,
      actorRole: role,
      action: "EVIDENCE_SUBMITTED",
      fromStatus: "IN_PROGRESS",
      toStatus: "RESCUE_COMPLETED",
      notes: notes || null,
    });

    res.json({ success: true, case: result.rows[0] });
  } catch (err) {
    console.error("Submit evidence error:", err);

    res.status(500).json({ error: "Failed to submit rescue evidence." });
  }
};

/**
 * Resolve whether an NGO's jurisdiction covers a given case.
 * Fails closed: returns false if the NGO hasn't configured a
 * jurisdiction yet, or the case lacks coordinates.
 */
const isCaseWithinNgoJurisdiction = async (ngoUserId, caseRow) => {
  const ngoResult = await pool.query(
    `SELECT jurisdiction_lat, jurisdiction_lng, jurisdiction_radius_km
       FROM users WHERE id = $1`,
    [ngoUserId],
  );

  const ngo = ngoResult.rows[0];

  if (!ngo || ngo.jurisdiction_lat === null || ngo.jurisdiction_lng === null) {
    return false;
  }

  const distance = haversineKm(
    ngo.jurisdiction_lat,
    ngo.jurisdiction_lng,
    caseRow.latitude,
    caseRow.longitude,
  );

  if (distance === null) return false;

  return distance <= (ngo.jurisdiction_radius_km ?? 15);
};

// 10. VERIFY RESCUE COMPLETION (RESCUE_COMPLETED -> RESOLVED, or reject -> IN_PROGRESS)
const verifyCompletion = async (req, res) => {
  const { id } = req.params;
  const { approved, reason } = req.body;
  const role = req.user.role;

  if (typeof approved !== "boolean") {
    return res.status(400).json({
      error: "The approved field must be a boolean.",
    });
  }

  try {
    const caseResult = await pool.query(
      `SELECT * FROM rescue_cases WHERE id = $1`,
      [id],
    );

    if (caseResult.rows.length === 0) {
      return res.status(404).json({ error: "Case not found." });
    }

    const currentCase = caseResult.rows[0];

    let isWithinNgoJurisdiction = false;

    if ((role || "").toUpperCase() === "NGO") {
      isWithinNgoJurisdiction = await isCaseWithinNgoJurisdiction(
        req.user.id,
        currentCase,
      );
    }

    if (
      !canVerifyCompletion({
        role,
        isWithinNgoJurisdiction,
        fromStatus: currentCase.status,
      })
    ) {
      return res.status(403).json({
        error: "You are not authorized to verify this rescue completion.",
      });
    }

    let result;

    if (approved) {
      result = await pool.query(
        `UPDATE rescue_cases
           SET status = 'RESOLVED', verified_by = $1, resolved_at = NOW()
           WHERE id = $2
           RETURNING *`,
        [req.user.id, id],
      );
    } else {
      if (!reason) {
        return res.status(400).json({
          error: "A reason is required when rejecting a rescue completion.",
        });
      }

      result = await pool.query(
        `UPDATE rescue_cases
           SET status = 'IN_PROGRESS', rejection_reason = $1
           WHERE id = $2
           RETURNING *`,
        [reason, id],
      );
    }

    apiCache.flushAll();

    await logCaseHistory({
      caseId: id,
      actorId: req.user.id,
      actorRole: role,
      action: approved ? "COMPLETION_VERIFIED" : "COMPLETION_REJECTED",
      fromStatus: "RESCUE_COMPLETED",
      toStatus: approved ? "RESOLVED" : "IN_PROGRESS",
      notes: reason || null,
    });

    res.json({ success: true, case: result.rows[0] });
  } catch (err) {
    console.error("Verify completion error:", err);

    res.status(500).json({ error: "Failed to verify rescue completion." });
  }
};

// 11. SET PRIORITY (ADMIN always; NGO within their jurisdiction)
const setPriority = async (req, res) => {
  const { id } = req.params;
  const normalizedPriority = normalizeEnum(req.body.priority);
  const role = (req.user.role || "").toUpperCase();

  if (!VALID_PRIORITIES.includes(normalizedPriority)) {
    return res.status(400).json({
      error: `Invalid priority. Permitted: [${VALID_PRIORITIES.join(", ")}]`,
    });
  }

  try {
    const caseResult = await pool.query(
      `SELECT * FROM rescue_cases WHERE id = $1`,
      [id],
    );

    if (caseResult.rows.length === 0) {
      return res.status(404).json({ error: "Case not found." });
    }

    const currentCase = caseResult.rows[0];

    if (role === "NGO") {
      const withinJurisdiction = await isCaseWithinNgoJurisdiction(
        req.user.id,
        currentCase,
      );

      if (!withinJurisdiction) {
        return res.status(403).json({
          error: "This case is outside your registered jurisdiction.",
        });
      }
    } else if (role !== "ADMIN") {
      return res.status(403).json({
        error: "Only NGO and ADMIN accounts can set case priority.",
      });
    }

    const result = await pool.query(
      `UPDATE rescue_cases SET priority = $1 WHERE id = $2 RETURNING *`,
      [normalizedPriority, id],
    );

    apiCache.flushAll();

    await logCaseHistory({
      caseId: id,
      actorId: req.user.id,
      actorRole: role,
      action: "PRIORITY_CHANGED",
      notes: `${currentCase.priority || "STANDARD"} -> ${normalizedPriority}`,
    });

    res.json({ success: true, case: result.rows[0] });
  } catch (err) {
    console.error("Set priority error:", err);

    res.status(500).json({ error: "Failed to update case priority." });
  }
};

// 12. MAP DATA (public — minimal fields only, no description text)
const getMapData = async (req, res) => {
  try {
    if (apiCache.has("map_data")) {
      return res.json(apiCache.get("map_data"));
    }

    const result = await pool.query(
      `SELECT id, species, priority, latitude, longitude, status
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

// 13. CASE DETAIL — role-aware single source of truth for one case
const getCaseDetail = async (req, res) => {
  const { id } = req.params;
  const role = (req.user.role || "").toUpperCase();

  try {
    const caseResult = await pool.query(
      `SELECT ${CASE_FIELDS} FROM rescue_cases WHERE id = $1`,
      [id],
    );

    if (caseResult.rows.length === 0) {
      return res.status(404).json({ error: "Case not found." });
    }

    const caseRow = caseResult.rows[0];

    let authorized = false;

    if (role === "ADMIN") {
      authorized = true;
    } else if (role === "USER") {
      authorized = caseRow.reporter_id === req.user.id;
    } else if (role === "VOLUNTEER") {
      authorized =
        caseRow.assigned_volunteer_id === req.user.id ||
        (caseRow.status === "VALIDATION_PASSED" &&
          caseRow.assigned_volunteer_id === null);
    } else if (role === "NGO") {
      authorized = await isCaseWithinNgoJurisdiction(req.user.id, caseRow);
    }

    if (!authorized) {
      return res.status(403).json({
        error: "You do not have access to this case.",
      });
    }

    const historyResult = await pool.query(
      `SELECT actor_role, action, from_status, to_status, notes, created_at
         FROM case_status_history
         WHERE case_id = $1
         ORDER BY created_at ASC`,
      [id],
    );

    res.json({
      case: caseRow,
      history: historyResult.rows,
    });
  } catch (err) {
    console.error("Case detail fetch error:", err);

    res.status(500).json({ error: "Failed to fetch case detail." });
  }
};

// 14. VERIFICATION QUEUE (RESCUE_COMPLETED cases awaiting admin/NGO sign-off)
const getVerificationQueue = async (req, res) => {
  const role = (req.user.role || "").toUpperCase();

  try {
    if (role === "ADMIN") {
      const result = await pool.query(
        `SELECT ${CASE_FIELDS} FROM rescue_cases
           WHERE status = 'RESCUE_COMPLETED'
           ORDER BY completed_at ASC`,
      );

      return res.json(result.rows);
    }

    // NGO — jurisdiction-filtered via SQL Haversine, same pattern as
    // the nearby-volunteers search.
    const ngoResult = await pool.query(
      `SELECT jurisdiction_lat, jurisdiction_lng, jurisdiction_radius_km
         FROM users WHERE id = $1`,
      [req.user.id],
    );

    const ngo = ngoResult.rows[0];

    if (!ngo || ngo.jurisdiction_lat === null || ngo.jurisdiction_lng === null) {
      return res.json([]);
    }

    const result = await pool.query(
      `SELECT * FROM (
           SELECT ${CASE_FIELDS},
             (6371 * acos(LEAST(1, GREATEST(-1,
               cos(radians($1)) * cos(radians(latitude)) * cos(radians(longitude) - radians($2))
               + sin(radians($1)) * sin(radians(latitude))
             )))) AS distance_km
           FROM rescue_cases
           WHERE status = 'RESCUE_COMPLETED'
             AND latitude IS NOT NULL AND longitude IS NOT NULL
         ) AS nearby
         WHERE distance_km <= $3
         ORDER BY completed_at ASC`,
      [ngo.jurisdiction_lat, ngo.jurisdiction_lng, ngo.jurisdiction_radius_km ?? 15],
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Verification queue fetch error:", err);

    res.status(500).json({ error: "Failed to load verification queue." });
  }
};

// 15. ROLE-AWARE DASHBOARD FEED
// Fixes the previously-shared master list: each operational role now
// gets a genuinely different, permission-scoped query. Cache key is
// role+user-scoped for VOLUNTEER/NGO since their data now differs
// per account — a single shared cache key would leak cross-account data.
const getDashboardCases = async (req, res) => {
  const role = (req.user.role || "").toUpperCase();
  const skipCache = req.query.nocache === "true";

  const cacheKey =
    role === "ADMIN"
      ? "dashboard_data:ADMIN"
      : `dashboard_data:${role}:${req.user.id}`;

  try {
    if (!skipCache && apiCache.has(cacheKey)) {
      return res.json(apiCache.get(cacheKey));
    }

    let rows;

    if (role === "ADMIN") {
      const result = await pool.query(
        `SELECT ${CASE_FIELDS}
           FROM rescue_cases
           ORDER BY created_at DESC
           LIMIT 100`,
      );

      rows = result.rows;
    } else if (role === "VOLUNTEER") {
      // My assignments (any status) + cases I'm eligible to claim.
      const result = await pool.query(
        `SELECT ${CASE_FIELDS}
           FROM rescue_cases
           WHERE assigned_volunteer_id = $1
              OR (status = 'VALIDATION_PASSED' AND assigned_volunteer_id IS NULL)
           ORDER BY
             CASE WHEN assigned_volunteer_id = $1 THEN 0 ELSE 1 END,
             created_at DESC
           LIMIT 100`,
        [req.user.id],
      );

      rows = result.rows;
    } else if (role === "NGO") {
      const ngoResult = await pool.query(
        `SELECT jurisdiction_lat, jurisdiction_lng, jurisdiction_radius_km
           FROM users WHERE id = $1`,
        [req.user.id],
      );

      const ngo = ngoResult.rows[0];

      if (!ngo || ngo.jurisdiction_lat === null || ngo.jurisdiction_lng === null) {
        // NGO hasn't configured a service area yet — return an honest
        // empty result rather than the unfiltered master list.
        rows = [];
      } else {
        const result = await pool.query(
          `SELECT * FROM (
               SELECT ${CASE_FIELDS},
                 (6371 * acos(LEAST(1, GREATEST(-1,
                   cos(radians($1)) * cos(radians(latitude)) * cos(radians(longitude) - radians($2))
                   + sin(radians($1)) * sin(radians(latitude))
                 )))) AS distance_km
               FROM rescue_cases
               WHERE latitude IS NOT NULL AND longitude IS NOT NULL
                 AND status != 'CANCELLED'
             ) AS nearby
             WHERE distance_km <= $3
             ORDER BY created_at DESC
             LIMIT 100`,
          [
            ngo.jurisdiction_lat,
            ngo.jurisdiction_lng,
            ngo.jurisdiction_radius_km ?? 15,
          ],
        );

        rows = result.rows;
      }
    } else {
      // USER is not routed here (see cases.routes.js) — fail safe.
      rows = [];
    }

    if (!skipCache) {
      apiCache.set(cacheKey, rows);
    }

    res.json(rows);
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
  getMyCases,
  claimCase,
  cancelCase,
  submitRescueEvidence,
  verifyCompletion,
  setPriority,
  getMapData,
  getCaseDetail,
  getVerificationQueue,
  getDashboardCases,
};
