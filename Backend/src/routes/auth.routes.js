const express = require("express");
const router = express.Router();

const { verifyToken, authorizeRoles } = require("../middleware/auth");
const { authLimiter } = require("../middleware/rateLimiter");
const {
  register,
  login,
  getCurrentUser,
  updateJurisdiction,
} = require("../controllers/auth.controller");

router.post("/register", authLimiter, register);
router.post("/login", authLimiter, login);
router.get("/me", verifyToken, getCurrentUser);

router.put(
  "/jurisdiction",
  verifyToken,
  authorizeRoles("NGO"),
  updateJurisdiction,
);

module.exports = router;
