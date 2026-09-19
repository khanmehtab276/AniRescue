const express = require("express");
const router = express.Router();

const { verifyToken, authorizeRoles } = require("../middleware/auth");
const ctrl = require("../controllers/cases.controller");

router.post(
  "/report",
  verifyToken,
  authorizeRoles("USER", "VOLUNTEER", "NGO", "ADMIN"),
  ctrl.reportCase,
);

router.get(
  "/admin/junk",
  verifyToken,
  authorizeRoles("NGO", "ADMIN"),
  ctrl.getJunkQueue,
);

router.put(
  "/:id/verify-junk",
  verifyToken,
  authorizeRoles("NGO", "ADMIN"),
  ctrl.verifyJunkCase,
);

router.get(
  "/:id/nearby-volunteers",
  verifyToken,
  authorizeRoles("NGO", "ADMIN"),
  ctrl.getNearbyVolunteers,
);

router.get(
  "/volunteer/available",
  verifyToken,
  authorizeRoles("VOLUNTEER", "ADMIN"),
  ctrl.getAvailableCasesForVolunteers,
);

router.put(
  "/:id/claim",
  verifyToken,
  authorizeRoles("VOLUNTEER", "NGO", "ADMIN"),
  ctrl.claimCase,
);

router.put(
  "/:id/status",
  verifyToken,
  authorizeRoles("VOLUNTEER", "NGO", "ADMIN"),
  ctrl.updateCaseStatus,
);

// Public — no auth, matches original.
router.get("/map", ctrl.getMapData);

router.get(
  "/",
  verifyToken,
  authorizeRoles("VOLUNTEER", "NGO", "ADMIN"),
  ctrl.getDashboardCases,
);

module.exports = router;
