const crypto = require("crypto");
const { pool } = require("../config/db");

const SESSION_DAYS = 365;

function hashSessionToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createRawSessionToken() {
  return crypto.randomBytes(48).toString("base64url");
}

function getRequestMetadata(req) {
  return {
    userAgent: String(req.get?.("user-agent") || "").slice(0, 1000) || null,
    ipAddress: req.ip || null,
  };
}

async function createSession({ userId, req }) {
  const rawToken = createRawSessionToken();
  const tokenHash = hashSessionToken(rawToken);
  const { userAgent, ipAddress } = getRequestMetadata(req);

  const result = await pool.query(
    `INSERT INTO auth_sessions
       (user_id, token_hash, expires_at, user_agent, ip_address)
     VALUES ($1, $2, CURRENT_TIMESTAMP + ($3 * INTERVAL '1 day'), $4, $5)
     RETURNING id, expires_at`,
    [userId, tokenHash, SESSION_DAYS, userAgent, ipAddress],
  );

  return {
    id: result.rows[0].id,
    refreshToken: rawToken,
    expiresAt: result.rows[0].expires_at,
  };
}

async function rotateSession(rawToken, req) {
  if (!rawToken) return null;

  const tokenHash = hashSessionToken(rawToken);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `SELECT
         s.id,
         s.user_id,
         u.email,
         u.role,
         u.account_status
       FROM auth_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1
         AND s.revoked_at IS NULL
         AND s.expires_at > CURRENT_TIMESTAMP
       FOR UPDATE`,
      [tokenHash],
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    const session = result.rows[0];
    const replacementToken = createRawSessionToken();
    const replacementHash = hashSessionToken(replacementToken);
    const { userAgent, ipAddress } = getRequestMetadata(req);

    const replacement = await client.query(
      `INSERT INTO auth_sessions
         (user_id, token_hash, expires_at, user_agent, ip_address)
       VALUES (
         $1,
         $2,
         CURRENT_TIMESTAMP + ($3 * INTERVAL '1 day'),
         $4,
         $5
       )
       RETURNING id, expires_at`,
      [
        session.user_id,
        replacementHash,
        SESSION_DAYS,
        userAgent,
        ipAddress,
      ],
    );

    await client.query(
      `UPDATE auth_sessions
       SET
         revoked_at = CURRENT_TIMESTAMP,
         last_used_at = CURRENT_TIMESTAMP,
         replaced_by_session_id = $2
       WHERE id = $1`,
      [session.id, replacement.rows[0].id],
    );

    await client.query("COMMIT");

    return {
      id: replacement.rows[0].id,
      refreshToken: replacementToken,
      expiresAt: replacement.rows[0].expires_at,
      user: {
        id: session.user_id,
        email: session.email,
        role: session.role,
        account_status: session.account_status,
      },
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function revokeSession(rawToken) {
  if (!rawToken) return false;

  const tokenHash = hashSessionToken(rawToken);
  const result = await pool.query(
    `UPDATE auth_sessions
     SET revoked_at = CURRENT_TIMESTAMP,
         last_used_at = CURRENT_TIMESTAMP
     WHERE token_hash = $1
       AND revoked_at IS NULL
     RETURNING id`,
    [tokenHash],
  );

  return result.rowCount > 0;
}

async function revokeAllSessions(userId) {
  const result = await pool.query(
    `UPDATE auth_sessions
     SET revoked_at = CURRENT_TIMESTAMP
     WHERE user_id = $1
       AND revoked_at IS NULL`,
    [userId],
  );

  return result.rowCount;
}

module.exports = {
  SESSION_DAYS,
  createSession,
  rotateSession,
  revokeSession,
  revokeAllSessions,
};
