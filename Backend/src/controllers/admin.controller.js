const { pool } = require("../config/db");
const { logAudit } = require("../utils/auditLog");

const ALLOWED_STATUS = new Set([
  "PENDING",
  "ACTIVE",
  "REJECTED",
  "SUSPENDED",
]);

async function listUsers(req, res) {
  const { status, role } = req.query;
  const params = [];
  const filters = [];

  if (status) {
    const normalized = String(status).trim().toUpperCase();
    if (!ALLOWED_STATUS.has(normalized)) {
      return res.status(400).json({ error: "Invalid account status filter." });
    }
    params.push(normalized);
    filters.push(`u.account_status = $${params.length}`);
  }

  if (role) {
    const normalized = String(role).trim().toUpperCase();
    if (!["USER", "VOLUNTEER", "NGO", "ADMIN"].includes(normalized)) {
      return res.status(400).json({ error: "Invalid role filter." });
    }
    params.push(normalized);
    filters.push(`u.role = $${params.length}`);
  }

  try {
    const result = await pool.query(
      `SELECT
         u.id,
         u.full_name,
         u.email,
         u.role,
         u.account_status,
         u.created_at,
         vp.phone AS volunteer_phone,
         np.organization_name,
         np.contact_person
       FROM users u
       LEFT JOIN volunteer_profiles vp ON vp.user_id = u.id
       LEFT JOIN ngo_profiles np ON np.user_id = u.id
       ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
       ORDER BY
         CASE WHEN u.account_status = 'PENDING' THEN 0 ELSE 1 END,
         u.created_at DESC`,
      params,
    );

    return res.json({ users: result.rows });
  } catch (error) {
    console.error("Admin user list error:", error);
    return res.status(500).json({ error: "Failed to retrieve accounts." });
  }
}

async function updateUserStatus(req, res) {
  const userId = Number(req.params.id);
  const status = String(req.body?.status || "").trim().toUpperCase();

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: "Invalid user id." });
  }

  if (!ALLOWED_STATUS.has(status)) {
    return res.status(400).json({
      error: "Status must be PENDING, ACTIVE, REJECTED, or SUSPENDED.",
    });
  }

  if (userId === req.user.id && status !== "ACTIVE") {
    return res.status(400).json({
      error: "An administrator cannot deactivate their own account.",
    });
  }

  try {
    const result = await pool.query(
      `UPDATE users
       SET account_status = $1
       WHERE id = $2
       RETURNING id, full_name, email, role, account_status`,
      [status, userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User account not found." });
    }

    const updated = result.rows[0];

    if (status !== "ACTIVE") {
      await pool.query(
        `UPDATE auth_sessions
         SET revoked_at = CURRENT_TIMESTAMP
         WHERE user_id = $1
           AND revoked_at IS NULL`,
        [userId],
      );
    }

    await logAudit({
      actorId: req.user.id,
      action: "ACCOUNT_STATUS_CHANGED",
      targetType: "USER",
      targetId: userId,
      metadata: {
        status,
        role: updated.role,
      },
      req,
    });

    return res.json({ success: true, user: updated });
  } catch (error) {
    console.error("Admin user status update error:", error);
    return res.status(500).json({
      error: "Failed to update account status.",
    });
  }
}

module.exports = {
  listUsers,
  updateUserStatus,
};
