const { pool } = require("../config/db");

const createNotification = async ({
  userId,
  caseId = null,
  notificationType,
  title,
  message,
}) => {
  const result = await pool.query(
    `INSERT INTO notifications
       (user_id, case_id, notification_type, title, message)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, case_id, notification_type)
     DO NOTHING
     RETURNING id, user_id, case_id, notification_type, title, message, is_read, created_at`,
    [userId, caseId, notificationType, title, message],
  );

  return result.rows[0] || null;
};

module.exports = {
  createNotification,
};