const { pool } = require("../config/db");

async function logAudit({
  actorId = null,
  action,
  targetType = null,
  targetId = null,
  metadata = null,
  req = null,
}) {
  try {
    await pool.query(
      `INSERT INTO audit_logs
         (actor_id, action, target_type, target_id, metadata, request_id, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)`,
      [
        actorId || null,
        action,
        targetType,
        targetId == null ? null : String(targetId),
        metadata == null ? null : JSON.stringify(metadata),
        req?.requestId || null,
        req?.ip || null,
        String(req?.get?.("user-agent") || "").slice(0, 1000) || null,
      ],
    );
  } catch (error) {
    console.error(
      "Failed to write audit log (non-fatal):",
      error?.message || error,
    );
  }
}

module.exports = { logAudit };
