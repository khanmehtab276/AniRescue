const bcrypt = require("bcrypt");
const { pool } = require("../config/db");
const {
  setAuthCookies,
  clearAuthCookies,
  ensureCsrfToken,
  createAccessToken,
  getRefreshToken,
  revokeSession,
} = require("../middleware/auth");
const {
  createSession,
} = require("../services/authSessions");
const { normalizeEnum } = require("../utils/helpers");
const { logAudit } = require("../utils/auditLog");
const {
  notifyVolunteerAboutNearbyCases,
} = require("../utils/caseNotifications");

// REGISTER
const register = async (req, res) => {
  const {
    name,
    email,
    password,
    role,
    phone,
    address,
    organizationName,
    contactPerson,
    latitude,
    longitude,
    maximumCoverageRadiusKm,
  } = req.body;

  if (
    typeof name !== "string" ||
    typeof email !== "string" ||
    typeof password !== "string" ||
    !name.trim() ||
    !email.trim() ||
    !password
  ) {
    return res.status(400).json({
      error: "Name, email, and password are required.",
    });
  }

  const normalizedName = name.trim();
  const normalizedEmail = email.trim().toLowerCase();

  if (normalizedName.length < 2 || normalizedName.length > 100) {
    return res.status(400).json({
      error: "Name must be between 2 and 100 characters.",
    });
  }

  if (
    normalizedEmail.length > 254 ||
    !/^\S+@\S+\.\S+$/.test(normalizedEmail)
  ) {
    return res.status(400).json({
      error: "Please provide a valid email address.",
    });
  }

  if (password.length < 8 || password.length > 128) {
    return res.status(400).json({
      error: "Password must be between 8 and 128 characters.",
    });
  }

  try {
    const requestedRole = normalizeEnum(role);

    // ADMIN accounts can never be created through public registration.
    if (requestedRole === "ADMIN") {
      return res.status(403).json({
        error: "Admin accounts cannot be created through public registration.",
      });
    }

    const assignedRole = ["USER", "VOLUNTEER", "NGO"].includes(requestedRole)
      ? requestedRole
      : "USER";

    // Role-specific registration validation
    if (assignedRole === "VOLUNTEER") {
      if (!phone) {
        return res.status(400).json({
          error: "Phone number is required for volunteer registration.",
        });
      }
    }

    if (assignedRole === "NGO") {
      if (
        !organizationName ||
        !contactPerson ||
        !phone ||
        !address ||
        typeof latitude !== "number" ||
        typeof longitude !== "number" ||
        typeof maximumCoverageRadiusKm !== "number"
      ) {
        return res.status(400).json({
          error:
            "Organization name, contact person, phone, address, latitude, longitude, and maximum coverage radius are required for NGO registration.",
        });
      }

      if (latitude < -90 || latitude > 90) {
        return res.status(400).json({
          error: "Latitude must be between -90 and 90.",
        });
      }

      if (longitude < -180 || longitude > 180) {
        return res.status(400).json({
          error: "Longitude must be between -180 and 180.",
        });
      }

      if (maximumCoverageRadiusKm <= 0) {
        return res.status(400).json({
          error: "Maximum coverage radius must be greater than 0.",
        });
      }
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const accountStatus = assignedRole === "USER" ? "ACTIVE" : "PENDING";

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const result = await client.query(
        `INSERT INTO users
            (full_name, email, password_hash, role, account_status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, full_name, email, role, account_status`,
        [
          normalizedName,
          normalizedEmail,
          passwordHash,
          assignedRole,
          accountStatus,
        ],
      );

      const user = result.rows[0];

      // Create the role-specific profile.
      if (assignedRole === "VOLUNTEER") {
        await client.query(
          `INSERT INTO volunteer_profiles
              (user_id, phone, address)
           VALUES ($1, $2, $3)`,
          [user.id, phone.trim(), address ? address.trim() : null],
        );
      }

      if (assignedRole === "NGO") {
        await client.query(
          `INSERT INTO ngo_profiles
              (
                user_id,
                organization_name,
                contact_person,
                phone,
                address,
                latitude,
                longitude,
                maximum_coverage_radius_km
              )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            user.id,
            organizationName.trim(),
            contactPerson.trim(),
            phone.trim(),
            address.trim(),
            latitude,
            longitude,
            maximumCoverageRadiusKm,
          ],
        );
      }

      await client.query("COMMIT");

      if (accountStatus === "ACTIVE") {
        const session = await createSession({
          userId: user.id,
          req,
        });

        const token = createAccessToken(user, session.id);
        const csrfToken = setAuthCookies(
          res,
          token,
          session.refreshToken,
        );

        return res.status(201).json({
          authenticated: true,
          csrfToken,
          user,
        });
      }

      return res.status(201).json({
        authenticated: false,
        user,
      });
    } catch (err) {
      await client.query("ROLLBACK");

      if (err.code === "23505") {
        return res.status(400).json({
          error: "Email address is already registered.",
        });
      }

      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Registration error:", err);

    res.status(500).json({
      error: "Server error during registration.",
    });
  }
};

// LOGIN
const login = async (req, res) => {
  const { email, password } = req.body;

  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    !email.trim() ||
    !password
  ) {
    return res.status(400).json({
      error: "Email and password are required.",
    });
  }

  try {
    const normalizedEmail = email.trim().toLowerCase();

    const result = await pool.query("SELECT * FROM users WHERE email = $1", [
      normalizedEmail,
    ]);

    if (result.rows.length === 0) {
      await logAudit({
        action: "LOGIN_FAILED",
        targetType: "EMAIL",
        targetId: normalizedEmail,
        metadata: { reason: "UNKNOWN_ACCOUNT" },
        req,
      });
      return res.status(401).json({
        error: "Invalid email or password.",
      });
    }

    const user = result.rows[0];

    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      await logAudit({
        actorId: user.id,
        action: "LOGIN_FAILED",
        targetType: "USER",
        targetId: user.id,
        metadata: { reason: "INVALID_PASSWORD" },
        req,
      });
      return res.status(401).json({
        error: "Invalid email or password.",
      });
    }

    if (user.account_status !== "ACTIVE") {
      await logAudit({
        actorId: user.id,
        action: "LOGIN_BLOCKED",
        targetType: "USER",
        targetId: user.id,
        metadata: { accountStatus: user.account_status },
        req,
      });
      return res.status(403).json({
        error: "Your account is not active.",
        account_status: user.account_status,
      });
    }

    const session = await createSession({
      userId: user.id,
      req,
    });

    const token = createAccessToken(user, session.id);

    delete user.password_hash;
    const csrfToken = setAuthCookies(
      res,
      token,
      session.refreshToken,
    );

    await logAudit({
      actorId: user.id,
      action: "LOGIN_SUCCESS",
      targetType: "USER",
      targetId: user.id,
      metadata: { role: user.role },
      req,
    });

    res.set("Cache-Control", "no-store");
    res.json({ authenticated: true, csrfToken, user });
  } catch (err) {
    console.error("Login error:", err);

    res.status(500).json({
      error: "Server error during login.",
    });
  }
};

const logout = async (req, res) => {
  try {
    await revokeSession(getRefreshToken(req));
    await logAudit({
      actorId: req.user?.id || null,
      action: "LOGOUT",
      targetType: "USER",
      targetId: req.user?.id || null,
      req,
    });
  } catch (error) {
    console.error("Logout session revoke error:", error?.message || error);
  }

  clearAuthCookies(res);
  res.set("Cache-Control", "no-store");
  res.status(204).end();
};

// CSRF TOKEN
const getCsrfToken = async (req, res) => {
  try {
    const csrfToken = ensureCsrfToken(req, res);
    res.set("Cache-Control", "no-store");
    return res.json({ csrfToken });
  } catch (err) {
    console.error("CSRF token error:", err);
    return res.status(500).json({
      error: "Failed to initialize CSRF protection.",
    });
  }
};

// CURRENT USER
const getCurrentUser = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         u.id,
         u.full_name,
         u.email,
         u.role,
         u.account_status,
         u.jurisdiction_lat,
         u.jurisdiction_lng,
         u.jurisdiction_radius_km,
         u.availability_status,
         u.latitude,
         u.longitude,
         u.location_updated_at,
         vp.phone AS volunteer_phone,
         vp.address AS volunteer_address,
         np.organization_name,
         np.contact_person,
         np.phone AS organization_phone,
         np.address AS organization_address,
         np.maximum_coverage_radius_km
       FROM users u
       LEFT JOIN volunteer_profiles vp ON vp.user_id = u.id
       LEFT JOIN ngo_profiles np ON np.user_id = u.id
       WHERE u.id = $1`,
      [req.user.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "User not found.",
      });
    }

    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error("Auth check error:", err);

    res.status(500).json({
      error: "Server error during token verification.",
    });
  }
};

// UPDATE NGO OPERATING JURISDICTION
// The NGO can choose its current operating center/radius,
// but the radius cannot exceed its registered maximum coverage.
const updateJurisdiction = async (req, res) => {
  const { lat, lng, radiusKm } = req.body;

  if (
    typeof lat !== "number" ||
    !Number.isFinite(lat) ||
    typeof lng !== "number" ||
    !Number.isFinite(lng)
  ) {
    return res.status(400).json({
      error: "A valid lat/lng pair is required.",
    });
  }

  if (lat < -90 || lat > 90) {
    return res.status(400).json({
      error: "Latitude must be between -90 and 90.",
    });
  }

  if (lng < -180 || lng > 180) {
    return res.status(400).json({
      error: "Longitude must be between -180 and 180.",
    });
  }

  const normalizedRadius =
    typeof radiusKm === "number" && Number.isFinite(radiusKm)
      ? radiusKm
      : 15;

  if (normalizedRadius <= 0) {
    return res.status(400).json({
      error: "Operating radius must be greater than 0.",
    });
  }

  try {
    const profileResult = await pool.query(
      `SELECT maximum_coverage_radius_km
       FROM ngo_profiles
       WHERE user_id = $1`,
      [req.user.id],
    );

    if (profileResult.rows.length === 0) {
      return res.status(404).json({
        error: "NGO profile not found.",
      });
    }

    const maximumRadius = Number(
      profileResult.rows[0].maximum_coverage_radius_km,
    );

    if (normalizedRadius > maximumRadius) {
      return res.status(400).json({
        error: `Operating radius cannot exceed your maximum coverage radius of ${maximumRadius} km.`,
        maximum_coverage_radius_km: maximumRadius,
      });
    }

    const result = await pool.query(
      `UPDATE users
         SET jurisdiction_lat = $1,
             jurisdiction_lng = $2,
             jurisdiction_radius_km = $3
       WHERE id = $4
       RETURNING id, full_name, email, role,
                 jurisdiction_lat, jurisdiction_lng,
                 jurisdiction_radius_km`,
      [lat, lng, normalizedRadius, req.user.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "User not found.",
      });
    }

    res.json({
      success: true,
      user: result.rows[0],
    });

  } catch (err) {
    console.error("Update jurisdiction error:", err);

    res.status(500).json({
      error: "Failed to update operating jurisdiction.",
    });
  }
};

// UPDATE VOLUNTEER AVAILABILITY
const updateAvailability = async (req, res) => {
  const { availability } = req.body;

  const allowedStatuses = ["OFFLINE", "AVAILABLE"];

  if (!allowedStatuses.includes(availability)) {
    return res.status(400).json({
      error: "Availability must be OFFLINE or AVAILABLE.",
    });
  }

  try {
    const result = await pool.query(
    `UPDATE users
      SET availability_status = $1
      WHERE id = $2
        AND role = 'VOLUNTEER'
        AND account_status = 'ACTIVE'
        AND availability_status <> 'ON_RESCUE'
        RETURNING id, full_name, email, role,
        account_status, availability_status`,
      [availability, req.user.id],
    );

    if (result.rows.length === 0) {
      return res.status(403).json({
        error: "Only active volunteers can change availability.",
      });
    }

    res.json({
      success: true,
      user: result.rows[0],
    });
  } catch (err) {
    console.error("Update availability error:", err);

    res.status(500).json({
      error: "Failed to update availability.",
    });
  }
};

// UPDATE VOLUNTEER CURRENT LOCATION
const updateLocation = async (req, res) => {
  const { latitude, longitude } = req.body;

  const lat = Number(latitude);
  const lng = Number(longitude);

  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return res.status(400).json({
      error: "Latitude must be a valid number between -90 and 90.",
    });
  }

  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    return res.status(400).json({
      error: "Longitude must be a valid number between -180 and 180.",
    });
  }

  try {
    const result = await pool.query(
      `UPDATE users
       SET latitude = $1,
           longitude = $2,
           location_updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
         AND role = 'VOLUNTEER'
         AND account_status = 'ACTIVE'
         AND availability_status IN ('AVAILABLE', 'ON_RESCUE')
       RETURNING id,
                 full_name,
                 email,
                 role,
                 availability_status,
                 latitude,
                 longitude,
                 location_updated_at`,
      [lat, lng, req.user.id],
    );

    if (result.rows.length === 0) {
      return res.status(403).json({
        error:
          "Only active volunteers who are AVAILABLE or ON_RESCUE can update location.",
      });
    }

    res.json({
      success: true,
      location: result.rows[0],
    });

    if (result.rows[0].availability_status === "AVAILABLE") {
      notifyVolunteerAboutNearbyCases({
        userId: req.user.id,
      }).catch((error) => {
        console.error(
          "❌ Volunteer location catch-up error:",
          error?.stack || error,
        );
      });
    }

  } catch (err) {
    console.error("Update location error:", err);

    res.status(500).json({
      error: "Failed to update location.",
    });
  }
};

const registerDeviceToken = async (req, res) => {
  const { token, platform } = req.body;

  if (!token || typeof token !== "string" || !token.trim()) {
    return res.status(400).json({
      error: "A valid FCM device token is required.",
    });
  }

  const normalizedToken = token.trim();
  const normalizedPlatform =
    typeof platform === "string" && platform.trim()
      ? platform.trim().toLowerCase()
      : null;

  try {
    const result = await pool.query(
      `INSERT INTO device_tokens
         (user_id, token, platform, is_active)
       VALUES ($1, $2, $3, TRUE)
       ON CONFLICT (token)
       DO UPDATE SET
         user_id = EXCLUDED.user_id,
         platform = EXCLUDED.platform,
         is_active = TRUE,
         updated_at = CURRENT_TIMESTAMP
       RETURNING id, user_id, token, platform, is_active, created_at, updated_at`,
      [req.user.id, normalizedToken, normalizedPlatform],
    );

    res.json({
      success: true,
      device: result.rows[0],
    });
  } catch (err) {
    console.error("Register device token error:", err);

    res.status(500).json({
      error: "Failed to register device token.",
    });
  }
};

module.exports = {
  register,
  login,
  logout,
  getCsrfToken,
  getCurrentUser,
  updateJurisdiction,
  updateAvailability,
  updateLocation,
  registerDeviceToken,
};
