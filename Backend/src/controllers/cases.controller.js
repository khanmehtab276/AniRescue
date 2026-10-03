const crypto = require("crypto");
const { pool } = require("../config/db");
const { getChannel, QUEUE_NAME } = require("../config/rabbitmq");
const apiCache = require("../utils/cache");
const { normalizeEnum } = require("../utils/helpers");
const { logCaseHistory } = require("../utils/caseHistory");
const { haversineKm } = require("../utils/geo");
const { createNotification } = require("../utils/notifications");
const { notifyCaseRecipients } = require("../utils/caseNotificationRecipients");
const { sendPushNotification } = require("../utils/pushNotifications");
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
  ai_confidence, ai_validated_at,
  gemini_status, gemini_analysis, gemini_analyzed_at,
  created_at, completed_at, resolved_at
`;

// 1. SUBMIT CASE
const getUploadSignature = async (req, res) => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return res.status(503).json({
      error: "Image upload service is not configured for this deployment.",
    });
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHash("sha1")
    .update(`timestamp=${timestamp}${apiSecret}`)
    .digest("hex");

  res.set("Cache-Control", "no-store");

  return res.json({
    cloudName,
    apiKey,
    timestamp,
    signature,
    resourceType: "image",
  });
};

const reportCase = async (req, res) => {
  const { location, description, imageUrl, clientRequestId } = req.body;
  const reporterId = req.user.id;

  const descriptionText =
    typeof description === "string" ? description.trim() : "";

  if (
    !clientRequestId ||
    typeof clientRequestId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientRequestId)
  ) {
    return res.status(400).json({
      error: "A valid client request ID is required.",
    });
  }

  if (!imageUrl || typeof imageUrl !== "string" || imageUrl.length > 2048) {
    return res.status(400).json({
      error: "A valid rescue image URL is required.",
    });
  }

  if (descriptionText.length > 2000) {
    return res.status(400).json({
      error: "Description must be 2000 characters or fewer.",
    });
  }

  const lat =
    typeof location?.lat === "number" && Number.isFinite(location.lat)
      ? location.lat
      : null;
  const lng =
    typeof location?.lng === "number" && Number.isFinite(location.lng)
      ? location.lng
      : null;
  const manualAddress =
    typeof location?.address === "string"
      ? location.address.trim().slice(0, 500)
      : null;
  const isCustom = Boolean(location?.isCustom ?? location?.isManual);

  if (lat !== null && (lat < -90 || lat > 90)) {
    return res.status(400).json({ error: "Latitude must be between -90 and 90." });
  }

  if (lng !== null && (lng < -180 || lng > 180)) {
    return res.status(400).json({ error: "Longitude must be between -180 and 180." });
  }

  if ((lat === null) !== (lng === null)) {
    return res.status(400).json({
      error: "Latitude and longitude must be provided together.",
    });
  }

  let parsedImageUrl;
  try {
    parsedImageUrl = new URL(imageUrl);
  } catch {
    return res.status(400).json({ error: "Image URL is invalid." });
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;

  if (
    parsedImageUrl.protocol !== "https:" ||
    parsedImageUrl.hostname !== "res.cloudinary.com" ||
    !cloudName ||
    !parsedImageUrl.pathname.startsWith(`/${cloudName}/`) ||
    parsedImageUrl.username ||
    parsedImageUrl.password
  ) {
    return res.status(400).json({
      error: "Only approved Cloudinary HTTPS image URLs are accepted.",
    });
  }

  let client;

  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const result = await client.query(
      `INSERT INTO rescue_cases
          (issue_description, latitude, longitude, manual_address,
           is_custom_location, image_payload, reporter_id, status,
           client_request_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING_VALIDATION', $8)
         ON CONFLICT (reporter_id, client_request_id) DO NOTHING
         RETURNING id, status, priority, image_payload, created_at`,
      [
        descriptionText,
        lat,
        lng,
        manualAddress,
        isCustom,
        imageUrl,
        reporterId,
        clientRequestId,
      ],
    );

    if (result.rows.length === 0) {
      const existing = await client.query(
        `SELECT id, status, priority, image_payload, created_at
         FROM rescue_cases
         WHERE reporter_id = $1
           AND client_request_id = $2`,
        [reporterId, clientRequestId],
      );

      if (existing.rows.length === 0) {
        throw new Error("Idempotent rescue report lookup failed.");
      }

      await client.query("COMMIT");

      return res.status(200).json({
        success: true,
        duplicate: true,
        case: existing.rows[0],
      });
    }

    const savedCase = result.rows[0];

    await client.query(
      `INSERT INTO case_processing_jobs (case_id, image_url)
       VALUES ($1, $2)`,
      [savedCase.id, imageUrl],
    );

    await client.query("COMMIT");

    apiCache.flushAll();

    await logCaseHistory({
      caseId: savedCase.id,
      actorId: reporterId,
      actorRole: req.user.role,
      action: "CASE_REPORTED",
      toStatus: "PENDING_VALIDATION",
    });

    console.log(
      `📬 Case #${savedCase.id} committed and queued in the AI processing outbox.`,
    );

    await notifyCaseRecipients({
      caseId: savedCase.id,
      notificationType: "CASE_REPORTED",
      title: "Rescue report received 🐾",
      message: `Your rescue report #${savedCase.id} is safely received. We’ll keep you updated as it moves through rescue.`,
      includeReporter: true,
    });

    res.status(201).json({
      success: true,
      case: savedCase,
    });
  } catch (err) {
    try {
      await client?.query("ROLLBACK");
    } catch {}

    console.error("Failed to report rescue case:", err?.stack || err);

    res.status(503).json({
      error: "Rescue case could not be saved right now. Please try again.",
    });
  } finally {
    client?.release();
  }
};

// 2. FETCH REJECTED JUNK QUEUE
const getJunkQueue = async (req, res) => {
  const role = (req.user.role || "").toUpperCase();

  try {
    // ADMIN can review rejected cases across the entire system.
    if (role === "ADMIN") {
      const result = await pool.query(
        `SELECT id, species, issue_description, priority,
                latitude, longitude, image_payload, created_at
         FROM rescue_cases
         WHERE status = 'REJECTED_JUNK'
         ORDER BY created_at DESC`,
      );

      return res.json(result.rows);
    }

    // NGO can review only rejected cases within its registered
    // operating jurisdiction.
    const ngoResult = await pool.query(
      `SELECT jurisdiction_lat, jurisdiction_lng, jurisdiction_radius_km
       FROM users
       WHERE id = $1`,
      [req.user.id],
    );

    const ngo = ngoResult.rows[0];

    // No configured jurisdiction means no accessible junk cases.
    if (
      !ngo ||
      ngo.jurisdiction_lat === null ||
      ngo.jurisdiction_lng === null
    ) {
      return res.json([]);
    }

    const result = await pool.query(
    `SELECT id, species, issue_description, priority,
            latitude, longitude, image_payload, created_at
    FROM (
      SELECT
        id,
        species,
        issue_description,
        priority,
        latitude,
        longitude,
        image_payload,
        created_at,
        (6371 * acos(LEAST(1, GREATEST(-1,
          cos(radians($1)) *
          cos(radians(latitude)) *
          cos(radians(longitude) - radians($2)) +
          sin(radians($1)) *
          sin(radians(latitude))
        )))) AS distance_km
      FROM rescue_cases
      WHERE status = 'REJECTED_JUNK'
        AND latitude IS NOT NULL
        AND longitude IS NOT NULL
    ) AS nearby
    WHERE distance_km <= $3
    ORDER BY created_at DESC`,
    [
      ngo.jurisdiction_lat,
      ngo.jurisdiction_lng,
      ngo.jurisdiction_radius_km ?? 15,
    ],
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
    // NGOs may review only cases inside their operating jurisdiction.
    if ((req.user.role || "").toUpperCase() === "NGO") {
      const caseResult = await pool.query(
        `SELECT id, status, latitude, longitude
         FROM rescue_cases
         WHERE id = $1`,
        [id],
      );

      if (caseResult.rows.length === 0) {
        return res.status(404).json({
          error: "Case not found.",
        });
      }

      const currentCase = caseResult.rows[0];

      if (currentCase.status !== "REJECTED_JUNK") {
        return res.status(409).json({
          error: `Case cannot be reviewed because its current status is ${currentCase.status}.`,
        });
      }

      const withinJurisdiction = await isCaseWithinNgoJurisdiction(
        req.user.id,
        currentCase,
      );

      if (!withinJurisdiction) {
        return res.status(403).json({
          error: "This case is outside your NGO jurisdiction.",
        });
      }
    }

    // A junk-review override is only valid for cases that are
    // currently in REJECTED_JUNK.
    const result = await pool.query(
      `UPDATE rescue_cases
       SET status = $1
       WHERE id = $2
         AND status = 'REJECTED_JUNK'
       RETURNING *`,
      [newStatus, id],
    );

    if (result.rows.length === 0) {
      const caseResult = await pool.query(
        `SELECT id, status
         FROM rescue_cases
         WHERE id = $1`,
        [id],
      );

      if (caseResult.rows.length === 0) {
        return res.status(404).json({
          error: "Case not found.",
        });
      }

      return res.status(409).json({
        error: `Case cannot be reviewed because its current status is ${caseResult.rows[0].status}.`,
      });
    }

    apiCache.flushAll();

    await logCaseHistory({
      caseId: id,
      actorId: req.user.id,
      actorRole: req.user.role,
      action: "JUNK_REVIEW_OVERRIDE",
      fromStatus: "REJECTED_JUNK",
      toStatus: newStatus,
    });

    await notifyCaseRecipients({
      caseId: id,
      notificationType: approved ? "VALIDATION_PASSED" : "VALIDATION_REJECTED",
      title: approved ? "Rescue report approved 🐾" : "Rescue report still needs review",
      message: approved
        ? `Rescue report #${id} has been approved and is now available for rescue.`
        : `Rescue report #${id} remains under review by the rescue team.`,
      includeReporter: true,
      includeNearbyVolunteers: approved,
      includeNearbyNgos: true,
      includeAdmins: true,
    });

    res.json({
      success: true,
      case: result.rows[0],
    });
  } catch (err) {
    console.error("Junk verification override error:", err);

    res.status(500).json({
      error: "Failed to update junk verification state.",
    });
  }
};

// 4. HAVERSINE NEARBY VOLUNTEERS (NGO/ADMIN dispatch tool)
const getNearbyVolunteers = async (req, res) => {
  const { id } = req.params;

  try {
    const caseResult = await pool.query(
      `SELECT latitude, longitude
       FROM rescue_cases
       WHERE id = $1`,
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

    let searchRadiusKm = 5;

    // NGO dispatch searches within its configured operating jurisdiction.
    if (req.user.role === "NGO") {
      const jurisdictionResult = await pool.query(
        `SELECT jurisdiction_radius_km
         FROM users
         WHERE id = $1
           AND role = 'NGO'`,
        [req.user.id],
      );

      if (jurisdictionResult.rows.length === 0) {
        return res.status(404).json({
          error: "NGO account not found.",
        });
      }

      const jurisdictionRadius = Number(
        jurisdictionResult.rows[0].jurisdiction_radius_km,
      );

      if (!Number.isFinite(jurisdictionRadius) || jurisdictionRadius <= 0) {
        return res.status(400).json({
          error: "NGO operating jurisdiction is not configured.",
        });
      }

      searchRadiusKm = jurisdictionRadius;
    }

    const volunteers = await pool.query(
      `SELECT * FROM (
          SELECT
            id,
            full_name,
            (6371 * acos(LEAST(1, GREATEST(-1,
              cos(radians($1)) * cos(radians(latitude)) *
              cos(radians(longitude) - radians($2))
              + sin(radians($1)) * sin(radians(latitude))
            )))) AS distance_km
            FROM users
            WHERE role = 'VOLUNTEER'
              AND account_status = 'ACTIVE'
              AND availability_status = 'AVAILABLE'
              AND latitude IS NOT NULL
              AND longitude IS NOT NULL
              AND location_updated_at IS NOT NULL
              AND location_updated_at >= CURRENT_TIMESTAMP - INTERVAL '5 minutes'
              AND (
                $4 = 'ADMIN'
                OR EXISTS (
                  SELECT 1
                  FROM ngo_volunteers nv
                  WHERE nv.ngo_id = $5
                    AND nv.volunteer_id = users.id
                )
              )
        ) AS nearby
        WHERE distance_km <= $3
        ORDER BY distance_km ASC`,
      [latitude, longitude, searchRadiusKm, req.user.role, req.user.id],
    );

    res.json({
      caseId: id,
      searchRadiusKm,
      totalNearby: volunteers.rows.length,
      volunteers: volunteers.rows,
    });
  } catch (err) {
    console.error("Haversine search error:", err);

    res.status(500).json({
      error: "Failed to find nearby volunteers.",
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

// 7. ATOMIC CLAIM CASE (VOLUNTEER, NGO within jurisdiction, ADMIN)
const claimCase = async (req, res) => {
  const caseId = req.params.id;
  const claimantID = req.user.id;
  const role = (req.user.role || "").toUpperCase();

  try {
    // NGO can claim only cases inside its jurisdiction.
    if (role === "NGO") {
      const caseResult = await pool.query(
        `SELECT * FROM rescue_cases WHERE id = $1`,
        [caseId],
      );

      if (caseResult.rows.length === 0) {
        return res.status(404).json({
          error: "Case not found.",
        });
      }

      const currentCase = caseResult.rows[0];

      const withinJurisdiction = await isCaseWithinNgoJurisdiction(
        claimantID,
        currentCase,
      );

      if (!withinJurisdiction) {
        return res.status(403).json({
          error: "This case is outside your NGO jurisdiction.",
        });
      }
    }

    const result = await pool.query(
      `UPDATE rescue_cases
         SET status = 'IN_PROGRESS', assigned_volunteer_id = $1
         WHERE id = $2 AND status = 'VALIDATION_PASSED' AND assigned_volunteer_id IS NULL
         RETURNING *`,
      [claimantID, caseId],
    );

    if (result.rows.length === 0) {
      return res.status(409).json({
        error: "Case is already claimed or not verified for rescue.",
      });
    }

    if (role === "VOLUNTEER") {
      await pool.query(
        `UPDATE users
        SET availability_status = 'ON_RESCUE'
        WHERE id = $1
          AND role = 'VOLUNTEER'
          AND account_status = 'ACTIVE'`,
        [claimantID],
      );
    }

    const notification = await createNotification({
      userId: claimantID,
      caseId,
      notificationType: "CASE_CLAIMED",
      title: "Rescue Case Claimed",
      message: `You have claimed Rescue Case #${caseId}.`,
    });

    if (notification) {
      const tokenResult = await pool.query(
        `
        SELECT token
        FROM device_tokens
        WHERE user_id = $1
          AND is_active = TRUE
        `,
        [claimantID],
      );

      for (const device of tokenResult.rows) {
        try {
          await sendPushNotification({
            token: device.token,
            title: notification.title,
            body: notification.message,
            data: {
              caseId,
              notificationType: "CASE_CLAIMED",
            },
          });

          console.log(
            `📲 Claim push notification sent to User #${claimantID}.`,
          );
        } catch (pushError) {
          const errorCode = pushError?.errorInfo?.code;

          console.error(
            `⚠️ Claim push failed for User #${claimantID}:`,
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
              `🧹 Deactivated invalid FCM token for User #${claimantID}.`,
            );
          }
        }
      }
    }

    apiCache.flushAll();

    await logCaseHistory({
      caseId,
      actorId: claimantID,
      actorRole: req.user.role,
      action: "CASE_CLAIMED",
      fromStatus: "VALIDATION_PASSED",
      toStatus: "IN_PROGRESS",
    });

    await notifyCaseRecipients({
      caseId,
      notificationType: "CASE_CLAIMED",
      title: "Rescue help is on the way 🐾",
      message: `Rescue Case #${caseId} has been claimed and is now in progress.`,
      includeReporter: true,
      includeAdmins: true,
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

    if ((role || "").toUpperCase() !== "ADMIN") {
      return res.status(403).json({
        error: "Only an admin can permanently cancel a case.",
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

    if (currentCase.assigned_volunteer_id) {
      await pool.query(
        `UPDATE users
         SET availability_status = 'AVAILABLE'
         WHERE id = $1
           AND role = 'VOLUNTEER'
           AND account_status = 'ACTIVE'
           AND availability_status = 'ON_RESCUE'`,
        [currentCase.assigned_volunteer_id],
      );
    }

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

    await notifyCaseRecipients({
      caseId: id,
      notificationType: "CASE_CANCELLED",
      title: "Rescue case cancelled",
      message: `Rescue Case #${id} was cancelled.${reason ? ` Reason: ${reason}` : ""}`,
      includeReporter: true,
      includeAssignedVolunteer: true,
      includeAdmins: true,
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
           AND status = 'IN_PROGRESS'
           AND assigned_volunteer_id = $4
         RETURNING *`,
      [evidenceImageUrl, notes || null, id, req.user.id],
    );

    // The assigned volunteer has finished the rescue.
    // Make them available for another case.
    if (currentCase.assigned_volunteer_id) {
      await pool.query(
        `UPDATE users
         SET availability_status = 'AVAILABLE'
         WHERE id = $1
           AND availability_status = 'ON_RESCUE'`,
        [currentCase.assigned_volunteer_id],
      );
    }

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

    await notifyCaseRecipients({
      caseId: id,
      notificationType: "EVIDENCE_SUBMITTED",
      title: "Rescue completed 🐾",
      message: `Rescue Case #${id} has been marked rescued and is waiting for verification.`,
      includeReporter: true,
      includeNearbyNgos: true,
      includeAdmins: true,
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

// 10. ASSIGN CASE TO A VOLUNTEER (NGO/ADMIN)
const assignCase = async (req, res) => {
  const caseId = req.params.id;
  const { volunteerId } = req.body;
  const role = (req.user.role || "").toUpperCase();

  if (!volunteerId) {
    return res.status(400).json({
      error: "Volunteer ID is required.",
    });
  }

  try {
    // Check that the case exists and is still available for assignment.
    const caseResult = await pool.query(
      `SELECT * FROM rescue_cases
       WHERE id = $1`,
      [caseId],
    );

    if (caseResult.rows.length === 0) {
      return res.status(404).json({
        error: "Case not found.",
      });
    }

    const currentCase = caseResult.rows[0];

    if (currentCase.status !== "VALIDATION_PASSED") {
      return res.status(409).json({
        error: "Only validated cases can be assigned.",
      });
    }

    if (currentCase.assigned_volunteer_id !== null) {
      return res.status(409).json({
        error: "Case is already assigned.",
      });
    }

    // The selected account must be an active volunteer.
    const volunteerResult = await pool.query(
      `SELECT id
        FROM users
        WHERE id = $1
          AND role = 'VOLUNTEER'
          AND account_status = 'ACTIVE'
          AND availability_status = 'AVAILABLE'`,
        [volunteerId],
    );

    if (volunteerResult.rows.length === 0) {
      return res.status(400).json({
        error: "Selected user is not an active volunteer.",
      });
    }

    // NGO can assign only inside its own jurisdiction and
    // only to a volunteer associated with that NGO.
    if (role === "NGO") {
      const withinJurisdiction = await isCaseWithinNgoJurisdiction(
        req.user.id,
        currentCase,
      );

      if (!withinJurisdiction) {
        return res.status(403).json({
          error: "This case is outside your NGO jurisdiction.",
        });
      }

      const associationResult = await pool.query(
        `SELECT 1
         FROM ngo_volunteers
         WHERE ngo_id = $1
           AND volunteer_id = $2`,
        [req.user.id, volunteerId],
      );

      if (associationResult.rows.length === 0) {
        return res.status(403).json({
          error: "This volunteer is not associated with your NGO.",
        });
      }
    }

    // ADMIN can assign globally.
    // NGO authorization was fully checked above.
    if (role !== "ADMIN" && role !== "NGO") {
      return res.status(403).json({
        error: "You are not authorized to assign cases.",
      });
    }

    // Atomic update prevents two admins/NGOs from assigning
    // the same case at the same time.
    const result = await pool.query(
      `UPDATE rescue_cases
       SET status = 'IN_PROGRESS',
           assigned_volunteer_id = $1
       WHERE id = $2
         AND status = 'VALIDATION_PASSED'
         AND assigned_volunteer_id IS NULL
       RETURNING *`,
      [volunteerId, caseId],
    );

    if (result.rows.length === 0) {
      return res.status(409).json({
        error: "Case was already assigned or is no longer available.",
      });
    }

    await pool.query(
      `UPDATE users
      SET availability_status = 'ON_RESCUE'
      WHERE id = $1
        AND role = 'VOLUNTEER'
        AND account_status = 'ACTIVE'`,
      [volunteerId],
    );

    const notification = await createNotification({
      userId: volunteerId,
      caseId,
      notificationType: "CASE_ASSIGNED",
      title: "Rescue Case Assigned",
      message: `You have been assigned Rescue Case #${caseId}.`,
    });

    if (notification) {
      const tokenResult = await pool.query(
        `
        SELECT token
        FROM device_tokens
        WHERE user_id = $1
          AND is_active = TRUE
        `,
        [volunteerId],
      );

      for (const device of tokenResult.rows) {
        try {
          await sendPushNotification({
            token: device.token,
            title: notification.title,
            body: notification.message,
            data: {
              caseId,
              notificationType: "CASE_ASSIGNED",
            },
          });

          console.log(
            `📲 Assignment push notification sent to Volunteer #${volunteerId}.`,
          );
        } catch (pushError) {
          const errorCode = pushError?.errorInfo?.code;

          console.error(
            `⚠️ Assignment push failed for Volunteer #${volunteerId}:`,
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
              `🧹 Deactivated invalid FCM token for Volunteer #${volunteerId}.`,
            );
          }
        }
      }
    }

    apiCache.flushAll();

    await logCaseHistory({
      caseId,
      actorId: req.user.id,
      actorRole: role,
      action: "CASE_ASSIGNED",
      fromStatus: "VALIDATION_PASSED",
      toStatus: "IN_PROGRESS",
      notes: `Assigned to volunteer ${volunteerId}.`,
    });

    return res.json({
      success: true,
      case: result.rows[0],
    });
  } catch (err) {
    console.error("Assign case error:", err);

    return res.status(500).json({
      error: "Failed to assign case.",
    });
  }
};

// 11. RELEASE CASE (IN_PROGRESS -> VALIDATION_PASSED)
const releaseCase = async (req, res) => {
  const { id } = req.params;
  const role = (req.user.role || "").toUpperCase();

  try {
    const caseResult = await pool.query(
      `SELECT status, assigned_volunteer_id
       FROM rescue_cases
       WHERE id = $1`,
      [id],
    );

    if (caseResult.rows.length === 0) {
      return res.status(404).json({
        error: "Case not found.",
      });
    }

    const currentCase = caseResult.rows[0];

    if (currentCase.status !== "IN_PROGRESS") {
      return res.status(409).json({
        error: "Only cases currently in progress can be released.",
      });
    }

    const isAssignedToCaller =
      currentCase.assigned_volunteer_id === req.user.id;

    if (!isAssignedToCaller) {
      return res.status(403).json({
        error: "You can only release a case assigned to you.",
      });
    }

    const result = await pool.query(
      `UPDATE rescue_cases
       SET status = 'VALIDATION_PASSED',
           assigned_volunteer_id = NULL
       WHERE id = $1
         AND status = 'IN_PROGRESS'
         AND assigned_volunteer_id = $2
       RETURNING *`,
      [id, req.user.id],
    );

    if (result.rows.length === 0) {
      return res.status(409).json({
        error: "Case was already changed or released.",
      });
    }

    if (role === "VOLUNTEER") {
      await pool.query(
        `UPDATE users
         SET availability_status = 'AVAILABLE'
         WHERE id = $1
           AND role = 'VOLUNTEER'
           AND account_status = 'ACTIVE'
           AND availability_status = 'ON_RESCUE'`,
        [req.user.id],
      );
    }

    apiCache.flushAll();

    await logCaseHistory({
      caseId: id,
      actorId: req.user.id,
      actorRole: role,
      action: "CASE_RELEASED",
      fromStatus: "IN_PROGRESS",
      toStatus: "VALIDATION_PASSED",
      notes: "Case released by assigned volunteer.",
    });

    await notifyCaseRecipients({
      caseId: id,
      notificationType: "CASE_RELEASED",
      title: "Rescue case is available again",
      message: `Rescue Case #${id} is available again for a rescue volunteer.`,
      includeReporter: true,
      includeNearbyVolunteers: true,
      includeNearbyNgos: true,
      includeAdmins: true,
    });

    return res.json({
      success: true,
      case: result.rows[0],
    });
  } catch (err) {
    console.error("Release case error:", err);

    return res.status(500).json({
      error: "Failed to release case.",
    });
  }
};

// 12. VERIFY RESCUE COMPLETION (RESCUE_COMPLETED -> RESOLVED, or reject -> IN_PROGRESS)
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
             AND status = 'RESCUE_COMPLETED'
           RETURNING *`,
        [req.user.id, id],
      );

      await pool.query(
        `UPDATE users
        SET availability_status = 'AVAILABLE'
        WHERE id = $1
          AND role = 'VOLUNTEER'
          AND account_status = 'ACTIVE'
          AND availability_status = 'ON_RESCUE'`,
        [currentCase.assigned_volunteer_id],
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
             AND status = 'RESCUE_COMPLETED'
           RETURNING *`,
        [reason, id],
      );

      await pool.query(
        `UPDATE users
        SET availability_status = 'ON_RESCUE'
        WHERE id = $1
          AND role = 'VOLUNTEER'
          AND account_status = 'ACTIVE'`,
        [currentCase.assigned_volunteer_id],
      );
    }

    if (!result?.rows?.length) {
      return res.status(409).json({
        error: "Case was already verified or changed by another action.",
      });
    }

    const notification = await createNotification({
      userId: currentCase.assigned_volunteer_id,
      caseId: id,
      notificationType: approved
        ? "COMPLETION_VERIFIED"
        : "COMPLETION_REJECTED",
      title: approved
        ? "Rescue Completion Verified"
        : "Rescue Completion Rejected",
      message: approved
        ? `Your rescue for Case #${id} has been verified successfully.`
        : `Your rescue completion for Case #${id} was rejected. Reason: ${reason}`,
    });

    if (notification) {
      const tokenResult = await pool.query(
        `
        SELECT token
        FROM device_tokens
        WHERE user_id = $1
          AND is_active = TRUE
        `,
        [currentCase.assigned_volunteer_id],
      );

      for (const device of tokenResult.rows) {
        try {
          await sendPushNotification({
            token: device.token,
            title: notification.title,
            body: notification.message,
            data: {
              caseId: id,
              notificationType: approved
                ? "COMPLETION_VERIFIED"
                : "COMPLETION_REJECTED",
            },
          });

          console.log(
            `📲 Completion ${approved ? "verification" : "rejection"} push sent to Volunteer #${currentCase.assigned_volunteer_id}.`,
          );
        } catch (pushError) {
          const errorCode = pushError?.errorInfo?.code;

          console.error(
            `⚠️ Completion push failed for Volunteer #${currentCase.assigned_volunteer_id}:`,
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
              `🧹 Deactivated invalid FCM token for Volunteer #${currentCase.assigned_volunteer_id}.`,
            );
          }
        }
      }
    }

    await notifyCaseRecipients({
      caseId: id,
      notificationType: approved ? "COMPLETION_VERIFIED" : "COMPLETION_REJECTED",
      title: approved ? "Rescue verified 🎉" : "Rescue needs another look",
      message: approved
        ? `Rescue Case #${id} has been verified successfully.`
        : `Rescue Case #${id} needs another rescue check. Reason: ${reason}`,
      includeReporter: true,
    });

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

// 13. SET PRIORITY (ADMIN always; NGO within their jurisdiction)
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

// 14. ROLE-SCOPED MAP DATA
const getMapData = async (req, res) => {
  const role = (req.user.role || "").toUpperCase();
  const cacheKey = `map_data:${role}:${req.user.id}`;

  try {
    // Map data contains exact coordinates, so never use a shared cache key.
    if (apiCache.has(cacheKey)) {
      return res.json(apiCache.get(cacheKey));
    }

    let result;

    if (role === "USER") {
      result = await pool.query(
        `SELECT id, species, priority, latitude, longitude, status
         FROM rescue_cases
         WHERE reporter_id = $1
           AND status NOT IN ('RESOLVED', 'REJECTED_JUNK', 'CANCELLED')
           AND latitude IS NOT NULL
           AND longitude IS NOT NULL
         ORDER BY created_at DESC`,
        [req.user.id],
      );
    } else if (role === "VOLUNTEER") {
      result = await pool.query(
        `SELECT id, species, priority, latitude, longitude, status
         FROM rescue_cases
         WHERE status NOT IN ('RESOLVED', 'REJECTED_JUNK', 'CANCELLED')
           AND latitude IS NOT NULL
           AND longitude IS NOT NULL
           AND (
             (status = 'VALIDATION_PASSED' AND assigned_volunteer_id IS NULL)
             OR assigned_volunteer_id = $1
           )
         ORDER BY created_at DESC`,
        [req.user.id],
      );
    } else if (role === "NGO") {
      const ngoResult = await pool.query(
        `SELECT jurisdiction_lat, jurisdiction_lng, jurisdiction_radius_km
         FROM users
         WHERE id = $1
           AND role = 'NGO'`,
        [req.user.id],
      );

      const ngo = ngoResult.rows[0];

      if (
        !ngo ||
        ngo.jurisdiction_lat === null ||
        ngo.jurisdiction_lng === null ||
        !ngo.jurisdiction_radius_km
      ) {
        return res.json([]);
      }

      result = await pool.query(
        `SELECT id, species, priority, latitude, longitude, status
         FROM (
           SELECT
             id,
             species,
             priority,
             latitude,
             longitude,
             status,
             (6371 * acos(LEAST(1, GREATEST(-1,
               cos(radians($1)) *
               cos(radians(latitude)) *
               cos(radians(longitude) - radians($2)) +
               sin(radians($1)) *
               sin(radians(latitude))
             )))) AS distance_km
           FROM rescue_cases
           WHERE status NOT IN ('RESOLVED', 'REJECTED_JUNK', 'CANCELLED')
             AND latitude IS NOT NULL
             AND longitude IS NOT NULL
         ) AS nearby
         WHERE distance_km <= $3
         ORDER BY id DESC`,
        [
          ngo.jurisdiction_lat,
          ngo.jurisdiction_lng,
          ngo.jurisdiction_radius_km,
        ],
      );
    } else if (role === "ADMIN") {
      result = await pool.query(
        `SELECT id, species, priority, latitude, longitude, status
         FROM rescue_cases
         WHERE status NOT IN ('RESOLVED', 'REJECTED_JUNK', 'CANCELLED')
           AND latitude IS NOT NULL
           AND longitude IS NOT NULL
         ORDER BY created_at DESC`,
      );
    } else {
      return res.status(403).json({
        error: "You are not authorized to access rescue map data.",
      });
    }

    const rows = result.rows;
    apiCache.set(cacheKey, rows);

    return res.json(rows);
  } catch (err) {
    console.error("Map data fetch error:", err);

    return res.status(500).json({
      error: "Failed to retrieve active map entries.",
    });
  }
};

// 15. CASE DETAIL — role-aware single source of truth for one case
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

// 16. VERIFICATION QUEUE (RESCUE_COMPLETED cases awaiting admin/NGO sign-off)
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

// 17. ROLE-AWARE DASHBOARD FEED
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
                WHERE latitude IS NOT NULL 
                  AND longitude IS NOT NULL
                  AND status != 'CANCELLED'
                  AND (
                    assigned_volunteer_id = $4
                    OR EXISTS (
                      SELECT 1
                      FROM ngo_volunteers nv
                      WHERE nv.ngo_id = $4
                        AND nv.volunteer_id = rescue_cases.assigned_volunteer_id
                    )
                    OR (
                      status = 'VALIDATION_PASSED'
                      AND assigned_volunteer_id IS NULL
                    )
                  )
             ) AS nearby
             WHERE distance_km <= $3
             ORDER BY created_at DESC
             LIMIT 100`,
          [
            ngo.jurisdiction_lat,
            ngo.jurisdiction_lng,
            ngo.jurisdiction_radius_km ?? 15,
            req.user.id,
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
  getUploadSignature,
  reportCase,
  getJunkQueue,
  verifyJunkCase,
  getNearbyVolunteers,
  getAvailableCasesForVolunteers,
  getMyCases,
  claimCase,
  assignCase,
  releaseCase,
  cancelCase,
  submitRescueEvidence,
  verifyCompletion,
  setPriority,
  getMapData,
  getCaseDetail,
  getVerificationQueue,
  getDashboardCases,
};
