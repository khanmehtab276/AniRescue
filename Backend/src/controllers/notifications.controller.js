const { pool } = require("../config/db");

const listNotifications = async (req, res) => {
  const requestedLimit = Number.parseInt(req.query.limit, 10);
  const limit = Number.isInteger(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 100)
    : 20;

  try {
    const [notificationsResult, unreadResult] = await Promise.all([
      pool.query(
        `SELECT
           id,
           case_id,
           notification_type,
           title,
           message,
           is_read,
           created_at
         FROM notifications
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [req.user.id, limit],
      ),
      pool.query(
        `SELECT COUNT(*)::int AS count
         FROM notifications
         WHERE user_id = $1
           AND is_read = FALSE`,
        [req.user.id],
      ),
    ]);

    res.json({
      notifications: notificationsResult.rows,
      unreadCount: unreadResult.rows[0]?.count || 0,
    });
  } catch (error) {
    console.error("Notification list error:", error);
    res.status(500).json({
      error: "Failed to load notifications.",
    });
  }
};

const markNotificationRead = async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE notifications
       SET is_read = TRUE
       WHERE id = $1
         AND user_id = $2
       RETURNING id, is_read`,
      [req.params.id, req.user.id],
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
  } catch (error) {
    console.error("Notification read error:", error);
    res.status(500).json({
      error: "Failed to mark notification as read.",
    });
  }
};

const markAllNotificationsRead = async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE notifications
       SET is_read = TRUE
       WHERE user_id = $1
         AND is_read = FALSE`,
      [req.user.id],
    );

    res.json({
      success: true,
      updated: result.rowCount,
    });
  } catch (error) {
    console.error("Notification read-all error:", error);
    res.status(500).json({
      error: "Failed to mark notifications as read.",
    });
  }
};

module.exports = {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
};
