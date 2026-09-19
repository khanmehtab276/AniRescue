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

router.get(
  "/mine",
  verifyToken,
  authorizeRoles("USER", "VOLUNTEER", "NGO", "ADMIN"),
  ctrl.getMyCases,
);

// NGO removed: per the RBAC spec, NGO dispatches/coordinates but does
// not personally claim a case through the volunteer claim endpoint.
router.put(
  "/:id/claim",
  verifyToken,
  authorizeRoles("VOLUNTEER", "ADMIN"),
  ctrl.claimCase,
);

// Replaces the old catch-all /:id/status (which accepted any enum
// value if the case was assigned to the caller). Cancellation is the
// only transition still exposed generically; RESOLVED/RESCUE_COMPLETED
// now go through their own dedicated, evidence-aware endpoints below.
router.put(
  "/:id/cancel",
  verifyToken,
  authorizeRoles("VOLUNTEER", "ADMIN"),
  ctrl.cancelCase,
);

router.put(
  "/:id/complete",
  verifyToken,
  authorizeRoles("VOLUNTEER", "ADMIN"),
  ctrl.submitRescueEvidence,
);

router.put(
  "/:id/verify-completion",
  verifyToken,
  authorizeRoles("NGO", "ADMIN"),
  ctrl.verifyCompletion,
);

router.put(
  "/:id/priority",
  verifyToken,
  authorizeRoles("NGO", "ADMIN"),
  ctrl.setPriority,
);

router.get(
  "/verification-queue",
  verifyToken,
  authorizeRoles("NGO", "ADMIN"),
  ctrl.getVerificationQueue,
);

// Public — no auth, matches original, minimal fields only.
router.get("/map", ctrl.getMapData);

router.get(
  "/",
  verifyToken,
  authorizeRoles("VOLUNTEER", "NGO", "ADMIN"),
  ctrl.getDashboardCases,
);

// Case-detail route registered LAST among GET /:id-shaped routes so it
// doesn't swallow the literal-segment routes above (map, mine,
// volunteer/available, admin/junk, verification-queue all sit at the
// same first-segment level and must resolve before this catches "/:id").
router.get(
  "/:id",
  verifyToken,
  authorizeRoles("USER", "VOLUNTEER", "NGO", "ADMIN"),
  ctrl.getCaseDetail,
);

module.exports = router;
