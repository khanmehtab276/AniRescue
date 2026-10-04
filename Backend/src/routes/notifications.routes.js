const express = require("express");
const router = express.Router();

const { verifyToken } = require("../middleware/auth");
const ctrl = require("../controllers/notifications.controller");

router.use(verifyToken);

router.get("/", ctrl.listNotifications);
router.patch("/read-all", ctrl.markAllNotificationsRead);
router.patch("/:id/read", ctrl.markNotificationRead);

module.exports = router;
