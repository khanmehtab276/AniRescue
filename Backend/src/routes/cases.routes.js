const express = require("express");
const router = express.Router();

const { verifyToken, authorizeRoles } = require("../middleware/auth");
const { reportLimiter } = require("../middleware/rateLimiter");
const ctrl = require("../controllers/cases.controller");

router.post(
  "/upload-signature",
  verifyToken,
  authorizeRoles("USER", "VOLUNTEER", "NGO", "ADMIN"),
  reportLimiter,
  ctrl.getUploadSignature,
);

router.post(
  "/report",
  verifyToken,
  authorizeRoles("USER", "VOLUNTEER", "NGO", "ADMIN"),
  reportLimiter,
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

router.put(
  "/:id/claim",
  verifyToken,
  authorizeRoles("VOLUNTEER", "NGO", "ADMIN"),
  ctrl.claimCase,
);

router.put(
  "/:id/assign",
  verifyToken,
  authorizeRoles("NGO", "ADMIN"),
  ctrl.assignCase,
);

router.put(
  "/:id/release",
  verifyToken,
  authorizeRoles("VOLUNTEER"),
  ctrl.releaseCase,
);

// Replaces the old catch-all /:id/status (which accepted any enum
// value if the case was assigned to the caller). Cancellation is the
// only transition still exposed generically; RESOLVED/RESCUE_COMPLETED
// now go through their own dedicated, evidence-aware endpoints below.
router.put(
  "/:id/cancel",
  verifyToken,
  authorizeRoles("ADMIN"),
  ctrl.cancelCase,
);

router.put(
  "/:id/complete",
  verifyToken,
  authorizeRoles("VOLUNTEER", "NGO", "ADMIN"),
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

// Authenticated map — exact rescue-case coordinates are not public.
router.get(
  "/map",
  verifyToken,
  authorizeRoles("USER", "VOLUNTEER", "NGO", "ADMIN"),
  ctrl.getMapData,
);

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
