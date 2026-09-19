const { pool } = require("../config/db");

/**
 * Record one case-history row. Never throws — audit logging failing
 * should never block the actual case mutation that already succeeded.
 */
async function logCaseHistory({
  caseId,
  actorId,
  actorRole,
  action,
  fromStatus = null,
  toStatus = null,
  notes = null,
}) {
  try {
    await pool.query(
      `INSERT INTO case_status_history
         (case_id, actor_id, actor_role, action, from_status, to_status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        caseId,
        actorId || null,
        (actorRole || "").toUpperCase() || null,
        action,
        fromStatus,
        toStatus,
        notes,
      ],
    );
  } catch (err) {
    console.error("Failed to write case history row (non-fatal):", err?.message || err);
  }
}

module.exports = { logCaseHistory };
