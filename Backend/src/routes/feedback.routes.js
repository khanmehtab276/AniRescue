const express = require("express");
const router = express.Router();

const { verifyToken, authorizeRoles } = require("../middleware/auth");
const ctrl = require("../controllers/feedback.controller");

router.use(verifyToken);

router.post(
  "/",
  authorizeRoles("USER", "VOLUNTEER", "NGO", "ADMIN"),
  ctrl.submitFeedback,
);

router.get(
  "/mine",
  authorizeRoles("USER", "VOLUNTEER", "NGO", "ADMIN"),
  ctrl.listMyFeedback,
);

router.get(
  "/",
  authorizeRoles("ADMIN"),
  ctrl.listAllFeedback,
);

module.exports = router;
