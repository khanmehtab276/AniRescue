const express = require("express");
const router = express.Router();

const { verifyToken, authorizeRoles } = require("../middleware/auth");
const { authLimiter } = require("../middleware/rateLimiter");
const {
  register,
  login,
  logout,
  getCsrfToken,
  getCurrentUser,
  updateJurisdiction,
  updateAvailability,
  updateLocation,
  registerDeviceToken,
} = require("../controllers/auth.controller");

router.post("/register", authLimiter, register);
router.post("/login", authLimiter, login);
router.get("/me", verifyToken, getCurrentUser);
router.get("/csrf", verifyToken, getCsrfToken);
router.post("/logout", verifyToken, logout);

router.put(
  "/jurisdiction",
  verifyToken,
  authorizeRoles("NGO"),
  updateJurisdiction,
);

router.put(
  "/availability",
  verifyToken,
  authorizeRoles("VOLUNTEER"),
  updateAvailability,
);

router.put(
  "/location",
  verifyToken,
  authorizeRoles("VOLUNTEER"),
  updateLocation,
);

router.post(
  "/device-token",
  verifyToken,
  registerDeviceToken,
);

module.exports = router;
