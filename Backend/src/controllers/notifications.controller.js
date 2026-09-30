const { pool } = require("../config/db");

const getNotifications = async (req, res) => {
  const requestedLimit = Number.parseInt(req.query.limit, 10);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 100)
    : 50;

  try {
    const result = await pool.query(
      `SELECT
         n.id,
         n.user_id,
         n.case_id,
         n.notification_type,
         n.title,
         n.message,
         n.is_read,
         n.created_at,
         rc.status AS case_status,
         rc.species AS case_species
       FROM notifications n
       LEFT JOIN rescue_cases rc ON rc.id = n.case_id
       WHERE n.user_id = $1
       ORDER BY n.created_at DESC
       LIMIT $2`,
      [req.user.id, limit],
    );

    const unreadResult = await pool.query(
      `SELECT COUNT(*)::int AS unread_count
       FROM notifications
       WHERE user_id = $1
         AND is_read = FALSE`,
      [req.user.id],
    );

    res.json({
      notifications: result.rows,
      unreadCount: unreadResult.rows[0]?.unread_count || 0,
    });
  } catch (err) {
    console.error("Notification list error:", err);
    res.status(500).json({
      error: "Failed to load notifications.",
    });
  }
};

const markNotificationRead = async (req, res) => {
  const notificationId = Number.parseInt(req.params.id, 10);

  if (!Number.isInteger(notificationId) || notificationId <= 0) {
    return res.status(400).json({
      error: "A valid notification ID is required.",
    });
  }

  try {
    const result = await pool.query(
      `UPDATE notifications
       SET is_read = TRUE
       WHERE id = $1
         AND user_id = $2
       RETURNING id, is_read`,
      [notificationId, req.user.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Notification not found.",
      });
    }

    res.json({
      success: true,
      notification: result.rows[0],
    });
  } catch (err) {
    console.error("Mark notification read error:", err);
    res.status(500).json({
      error: "Failed to update notification.",
    });
  }
};

const markAllNotificationsRead = async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE notifications
       SET is_read = TRUE
       WHERE user_id = $1
         AND is_read = FALSE
       RETURNING id`,
      [req.user.id],
    );

    res.json({
      success: true,
      updated: result.rowCount,
    });
  } catch (err) {
    console.error("Mark all notifications read error:", err);
    res.status(500).json({
      error: "Failed to update notifications.",
    });
  }
};

module.exports = {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
};
