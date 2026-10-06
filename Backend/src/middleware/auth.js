const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { pool } = require("../config/db");
const { rotateSession, revokeSession } = require("../services/authSessions");

const isProduction = process.env.NODE_ENV === "production";
const SESSION_COOKIE = isProduction
  ? "__Host-anirescue_session_v2"
  : "anirescue_session_v2";
const CSRF_COOKIE = "anirescue_csrf_v2";
const REFRESH_COOKIE = isProduction
  ? "__Host-anirescue_refresh_v1"
  : "anirescue_refresh_v1";
const LEGACY_SESSION_COOKIE = isProduction
  ? "__Host-anirescue_session"
  : "anirescue_session";
const LEGACY_CSRF_COOKIE = "anirescue_csrf";

// Keep users signed in without keeping a powerful JWT valid for years.
// The access JWT is short-lived; the rotating server-side session is
// long-lived and revocable.
const ACCESS_TOKEN_MAX_AGE_SECONDS = 15 * 60;

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
    partitioned ? "Partitioned" : "",
  ];

  if (httpOnly) parts.push("HttpOnly");
  if (Number.isFinite(maxAge)) parts.push(`Max-Age=${maxAge}`);

  return parts.filter(Boolean).join("; ");
}

function setAuthCookies(res, token, refreshToken, existingCsrfToken = null) {
  const csrfToken =
    existingCsrfToken || crypto.randomBytes(32).toString("hex");

  res.setHeader("Set-Cookie", [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; ${cookieOptions({
      httpOnly: true,
      maxAge: ACCESS_TOKEN_MAX_AGE_SECONDS,
    })}`,
    `${REFRESH_COOKIE}=${encodeURIComponent(refreshToken)}; ${cookieOptions({
      httpOnly: true,
      maxAge: 365 * 24 * 60 * 60,
    })}`,
    `${CSRF_COOKIE}=${csrfToken}; ${cookieOptions({
      maxAge: 365 * 24 * 60 * 60,
    })}`,
  ]);

  return csrfToken;
}

function clearAuthCookies(res) {
  res.setHeader("Set-Cookie", [
    `${SESSION_COOKIE}=; ${cookieOptions({ httpOnly: true, maxAge: 0 })}`,
    `${REFRESH_COOKIE}=; ${cookieOptions({ httpOnly: true, maxAge: 0 })}`,
    `${CSRF_COOKIE}=; ${cookieOptions({ maxAge: 0 })}`,
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

function getRefreshToken(req) {
  const cookies = parseCookies(req.headers.cookie);
  return cookies[REFRESH_COOKIE] || null;
}

function createAccessToken(user, sessionId) {
  return jwt.sign(
    {
      id: user.id,
      role: user.role,
      account_status: user.account_status,
      email: user.email,
      sid: sessionId,
    },
    process.env.JWT_SECRET,
    { expiresIn: "15m" },
  );
}

async function verifyToken(req, res, next) {
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
    req.authSessionId = req.user.sid || null;
    return next();
  } catch {
    const refreshToken = getRefreshToken(req);

    if (cookieToken && refreshToken) {
      try {
        const rotated = await rotateSession(refreshToken, req);

        if (rotated && rotated.user.account_status === "ACTIVE") {
          const accessToken = createAccessToken(rotated.user, rotated.id);
          setAuthCookies(
            res,
            accessToken,
            rotated.refreshToken,
            getCsrfToken(req),
          );

          req.user = rotated.user;
          req.authSessionId = rotated.id;
          res.set("Cache-Control", "no-store");
          return next();
        }
      } catch (refreshError) {
        console.error(
          "Session refresh error:",
          refreshError?.message || refreshError,
        );
      }
    }

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
      if (!req.user?.id) {
        return res.status(401).json({
          error: "Authentication required.",
        });
      }

      // Never trust a role embedded in a long-lived JWT for authorization.
      // The database is authoritative if an account is promoted, demoted,
      // or otherwise has its role changed while the token remains valid.
      const result = await pool.query(
        `SELECT role, account_status
         FROM users
         WHERE id = $1`,
        [req.user.id],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: "User account not found.",
        });
      }

      const currentRole = (result.rows[0].role || "").toUpperCase();
      const accountStatus = result.rows[0].account_status;

      if (accountStatus !== "ACTIVE") {
        return res.status(403).json({
          error: "Your account is not active.",
          account_status: accountStatus,
        });
      }

      if (!normalizedAllowed.includes(currentRole)) {
        return res.status(403).json({
          error: "Access denied.",
        });
      }

      // Downstream controllers/history logging use the authoritative role.
      req.user.role = currentRole;
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
  getRefreshToken,
  createAccessToken,
  revokeSession,
  getCsrfToken,
  ensureCsrfToken,
  SESSION_COOKIE,
  CSRF_COOKIE,
};
