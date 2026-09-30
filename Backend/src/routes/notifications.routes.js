const express = require("express");
const router = express.Router();

const { verifyToken } = require("../middleware/auth");
const {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} = require("../controllers/notifications.controller");

router.get("/", verifyToken, getNotifications);
router.patch("/:id/read", verifyToken, markNotificationRead);
router.patch("/read-all", verifyToken, markAllNotificationsRead);

module.exports = router;
