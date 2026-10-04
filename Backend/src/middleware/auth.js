const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { pool } = require("../config/db");

const isProduction = process.env.NODE_ENV === "production";
const SESSION_COOKIE = isProduction
  ? "__Host-anirescue_session_v2"
  : "anirescue_session_v2";
const CSRF_COOKIE = "anirescue_csrf_v2";
const LEGACY_SESSION_COOKIE = isProduction
  ? "__Host-anirescue_session"
  : "anirescue_session";
const LEGACY_CSRF_COOKIE = "anirescue_csrf";
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function parseCookies(header = "") {
  return header.split(";").reduce((cookies, part) => {
    const separator = part.indexOf("=");
    if (separator === -1) return cookies;

    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();

    if (key) {
      try {
        cookies[key] = decodeURIComponent(value);
      } catch {
        cookies[key] = value;
      }
    }

    return cookies;
  }, {});
}

function cookieOptions({ httpOnly = false, maxAge, partitioned = isProduction } = {}) {
  const parts = [
    "Path=/",
    isProduction ? "Secure" : "",
    isProduction ? "SameSite=None" : "SameSite=Lax",
    // The frontend (Firebase Hosting) and API (Render) are different sites.
    // Partition the production cookies by the top-level AniRescue site so
    // browser privacy protections do not discard the authenticated session.
    partitioned ? "Partitioned" : "",
  ];

  if (httpOnly) parts.push("HttpOnly");
  if (Number.isFinite(maxAge)) parts.push(`Max-Age=${maxAge}`);

  return parts.filter(Boolean).join("; ");
}

function setAuthCookies(res, token) {
  const csrfToken = crypto.randomBytes(32).toString("hex");

  res.setHeader("Set-Cookie", [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; ${cookieOptions({
      httpOnly: true,
      maxAge: SESSION_MAX_AGE_SECONDS,
    })}`,
    `${CSRF_COOKIE}=${csrfToken}; ${cookieOptions({
      maxAge: SESSION_MAX_AGE_SECONDS,
    })}`,
  ]);

  return csrfToken;
}

function clearAuthCookies(res) {
  res.setHeader("Set-Cookie", [
    // Clear the current partitioned cookies.
    `${SESSION_COOKIE}=; ${cookieOptions({ httpOnly: true, maxAge: 0 })}`,
    `${CSRF_COOKIE}=; ${cookieOptions({ maxAge: 0 })}`,
    // Also remove the pre-v2 unpartitioned cookies from existing sessions.
    `${LEGACY_SESSION_COOKIE}=; ${cookieOptions({ httpOnly: true, maxAge: 0, partitioned: false })}`,
    `${LEGACY_CSRF_COOKIE}=; ${cookieOptions({ maxAge: 0, partitioned: false })}`,
  ]);
}

function getCsrfToken(req) {
  const cookies = parseCookies(req.headers.cookie);
  return cookies[CSRF_COOKIE] || null;
}

function ensureCsrfToken(req, res) {
  const existingToken = getCsrfToken(req);
  if (existingToken) return existingToken;

  const csrfToken = crypto.randomBytes(32).toString("hex");
  res.append(
    "Set-Cookie",
    CSRF_COOKIE + "=" + csrfToken + "; " + cookieOptions({
      maxAge: SESSION_MAX_AGE_SECONDS,
    }),
  );
  return csrfToken;
}

function getSessionToken(req) {
  const cookies = parseCookies(req.headers.cookie);
  return cookies[SESSION_COOKIE] || null;
}

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const cookieToken = getSessionToken(req);
  const token =
    cookieToken ||
    (authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null);

  if (!token) {
    return res.status(401).json({
      error: "Authentication required.",
    });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    if (cookieToken) clearAuthCookies(res);

    return res.status(401).json({
      error: "Invalid or expired session.",
    });
  }
}

function requireCsrf(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  // Legacy bearer-token clients are not using cookie authentication, so
  // CSRF protection is only required when the browser session cookie exists.
  if (!getSessionToken(req)) {
    return next();
  }

  const csrfCookie = getCsrfToken(req);
  const csrfHeader = req.get("X-CSRF-Token");

  if (
    !csrfCookie ||
    !csrfHeader ||
    csrfCookie.length !== csrfHeader.length ||
    !crypto.timingSafeEqual(
      Buffer.from(csrfCookie),
      Buffer.from(csrfHeader),
    )
  ) {
    return res.status(403).json({
      error: "CSRF validation failed.",
    });
  }

  next();
}

const requireActiveAccount = async (req, res, next) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        error: "Authentication required.",
      });
    }

    const result = await pool.query(
      `SELECT account_status
       FROM users
       WHERE id = $1`,
      [req.user.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "User account not found.",
      });
    }

    const accountStatus = result.rows[0].account_status;

    if (accountStatus !== "ACTIVE") {
      return res.status(403).json({
        error: "Your account is not active.",
        account_status: accountStatus,
      });
    }

    next();
  } catch (err) {
    console.error("Account status check error:", err);

    return res.status(500).json({
      error: "Failed to verify account status.",
    });
  }
};

const authorizeRoles = (...allowedRoles) => {
  const normalizedAllowed = allowedRoles.map((r) => r.toUpperCase());

  return async (req, res, next) => {
    try {
      const userRole = (req.user?.role || "").toUpperCase();

      if (!req.user || !normalizedAllowed.includes(userRole)) {
        return res.status(403).json({
          error: "Access denied.",
        });
      }

      const result = await pool.query(
        `SELECT account_status
         FROM users
         WHERE id = $1`,
        [req.user.id],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: "User account not found.",
        });
      }

      if (result.rows[0].account_status !== "ACTIVE") {
        return res.status(403).json({
          error: "Your account is not active.",
          account_status: result.rows[0].account_status,
        });
      }

      next();
    } catch (err) {
      console.error("Authorization error:", err);

      return res.status(500).json({
        error: "Failed to verify account authorization.",
      });
    }
  };
};

module.exports = {
  verifyToken,
  requireActiveAccount,
  authorizeRoles,
  requireCsrf,
  setAuthCookies,
  clearAuthCookies,
  getCsrfToken,
  ensureCsrfToken,
  SESSION_COOKIE,
  CSRF_COOKIE,
};
