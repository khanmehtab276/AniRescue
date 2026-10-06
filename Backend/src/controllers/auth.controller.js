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
const {
  createStatePayload,
  setStateCookie,
  readStateCookie,
  clearStateCookie,
  constantTimeEqual,
  getFrontendUrl,
  getGoogleAuthorizationUrl,
  getFacebookAuthorizationUrl,
  exchangeGoogleCode,
  exchangeFacebookCode,
} = require("../utils/oauth");

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


function redirectOAuthError(res, message) {
  const url = new URL("/login", getFrontendUrl());
  url.searchParams.set("oauth", "error");
  url.searchParams.set("message", message);
  return res.redirect(302, url.toString());
}

async function startOAuth(provider, req, res) {
  try {
    const normalizedProvider = String(provider || "").toLowerCase();

    if (!["google", "facebook"].includes(normalizedProvider)) {
      return res.status(404).json({ error: "OAuth provider not supported." });
    }

    const statePayload = createStatePayload({
      provider: normalizedProvider,
    });

    setStateCookie(res, statePayload);

    const authorizationUrl =
      normalizedProvider === "google"
        ? getGoogleAuthorizationUrl(statePayload.state)
        : getFacebookAuthorizationUrl(statePayload.state);

    return res.redirect(302, authorizationUrl);
  } catch (error) {
    console.error("OAuth start error:", error?.message || error);
    return redirectOAuthError(
      res,
      "This sign-in provider is not configured yet.",
    );
  }
}

async function findOrCreateOAuthUser({ profile, req }) {
  const { provider, subject, email, emailVerified, name } = profile;

  if (!subject || !email || !emailVerified) {
    throw new Error(
      "The identity provider did not return a verified email address.",
    );
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const identityResult = await client.query(
      `SELECT
         oi.user_id,
         u.id,
         u.full_name,
         u.email,
         u.role,
         u.account_status
       FROM oauth_identities oi
       JOIN users u ON u.id = oi.user_id
       WHERE oi.provider = $1
         AND oi.provider_subject = $2
       FOR UPDATE`,
      [provider, subject],
    );

    let user;
    let created = false;

    if (identityResult.rows.length > 0) {
      user = identityResult.rows[0];

      if (user.account_status !== "ACTIVE") {
        await client.query("ROLLBACK");
        return {
          blocked: true,
          user,
        };
      }

      await client.query(
        `UPDATE oauth_identities
         SET provider_email = $1,
             email_verified = TRUE,
             updated_at = CURRENT_TIMESTAMP
         WHERE provider = $2
           AND provider_subject = $3`,
        [email, provider, subject],
      );
    } else {
      const existingUserResult = await client.query(
        `SELECT id, full_name, email, role, account_status
         FROM users
         WHERE email = $1
         FOR UPDATE`,
        [email],
      );

      if (existingUserResult.rows.length > 0) {
        user = existingUserResult.rows[0];

        if (user.account_status !== "ACTIVE") {
          await client.query("ROLLBACK");
          return {
            blocked: true,
            user,
          };
        }

        await client.query(
          `INSERT INTO oauth_identities
             (user_id, provider, provider_subject, provider_email, email_verified)
           VALUES ($1, $2, $3, $4, TRUE)`,
          [user.id, provider, subject, email],
        );
      } else {
        const insertUserResult = await client.query(
          `INSERT INTO users
             (full_name, email, password_hash, role, account_status)
           VALUES ($1, $2, NULL, 'USER', 'ACTIVE')
           RETURNING id, full_name, email, role, account_status`,
          [name || "AniRescue User", email],
        );

        user = insertUserResult.rows[0];
        created = true;

        await client.query(
          `INSERT INTO oauth_identities
             (user_id, provider, provider_subject, provider_email, email_verified)
           VALUES ($1, $2, $3, $4, TRUE)`,
          [user.id, provider, subject, email],
        );
      }
    }

    await client.query("COMMIT");

    return {
      user,
      created,
    };
  } catch (error) {
    await client.query("ROLLBACK");

    if (error?.code === "23505") {
      throw new Error(
        "This social account is already linked to another AniRescue account.",
      );
    }

    throw error;
  } finally {
    client.release();
  }
}

async function handleOAuthCallback(provider, req, res) {
  try {
    const normalizedProvider = String(provider || "").toLowerCase();
    const stateCookie = readStateCookie(req);
    const returnedState = String(req.query?.state || "");
    const code = String(req.query?.code || "");

    if (
      !stateCookie ||
      stateCookie.provider !== normalizedProvider ||
      !constantTimeEqual(stateCookie.state, returnedState)
    ) {
      return redirectOAuthError(
        res,
        "OAuth verification failed. Please start sign-in again.",
      );
    }

    if (!code) {
      return redirectOAuthError(
        res,
        "The identity provider did not return an authorization code.",
      );
    }

    const profile =
      normalizedProvider === "google"
        ? await exchangeGoogleCode(code)
        : normalizedProvider === "facebook"
          ? await exchangeFacebookCode(code)
          : null;

    if (!profile) {
      return redirectOAuthError(res, "OAuth provider is not supported.");
    }

    const result = await findOrCreateOAuthUser({
      profile,
      req,
    });

    if (result.blocked) {
      clearStateCookie(res);
      const url = new URL("/login", getFrontendUrl());
      url.searchParams.set("oauth", "blocked");
      return res.redirect(302, url.toString());
    }

    const session = await createSession({
      userId: result.user.id,
      req,
    });

    const token = createAccessToken(result.user, session.id);

    setAuthCookies(
      res,
      token,
      session.refreshToken,
    );

    clearStateCookie(res);

    await logAudit({
      actorId: result.user.id,
      action: result.created ? "OAUTH_REGISTER_SUCCESS" : "OAUTH_LOGIN_SUCCESS",
      targetType: "USER",
      targetId: result.user.id,
      metadata: {
        provider: profile.provider,
      },
      req,
    });

    const destination =
      String(result.user.role || "").toUpperCase() === "ADMIN"
        ? "/admin"
        : String(result.user.role || "").toUpperCase() === "NGO"
          ? "/ngo"
          : String(result.user.role || "").toUpperCase() === "VOLUNTEER"
            ? "/volunteer"
            : "/dashboard";

    const frontendUrl = new URL(destination, getFrontendUrl());
    frontendUrl.searchParams.set("oauth", "success");

    return res.redirect(302, frontendUrl.toString());
  } catch (error) {
    console.error("OAuth callback error:", error?.stack || error);
    clearStateCookie(res);
    return redirectOAuthError(
      res,
      "Social sign-in could not be completed. Please try again.",
    );
  }
}

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

    const isValidPassword =
      typeof user.password_hash === "string" &&
      user.password_hash.length > 0 &&
      await bcrypt.compare(password, user.password_hash);

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
  startOAuth,
  handleOAuthCallback,
  login,
  logout,
  getCsrfToken,
  getCurrentUser,
  updateJurisdiction,
  updateAvailability,
  updateLocation,
  registerDeviceToken,
};
