const rateLimit = require("express-rate-limit");

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: {
    error: "Too many authentication attempts. Please try again later.",
  },
});

module.exports = { authLimiter };
