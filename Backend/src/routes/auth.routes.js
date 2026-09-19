const express = require("express");
const router = express.Router();

const { verifyToken } = require("../middleware/auth");
const { authLimiter } = require("../middleware/rateLimiter");
const { register, login, getCurrentUser } = require("../controllers/auth.controller");

router.post("/register", authLimiter, register);
router.post("/login", authLimiter, login);
router.get("/me", verifyToken, getCurrentUser);

module.exports = router;
