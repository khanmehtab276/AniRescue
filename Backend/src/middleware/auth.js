const jwt = require("jsonwebtoken");
const { pool } = require("../config/db");

// --------------------------------------------------
// AUTHENTICATION & ROLE MIDDLEWARE
// --------------------------------------------------
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Access Denied. Token missing or malformed.",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);

    req.user = verified;

    next();
  } catch (err) {
    return res.status(401).json({
      error: "Invalid or expired token.",
    });
  }
};

const requireActiveAccount = async (req, res, next) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        error: "Authentication required.",
      });
    }

    const result = await pool.query(
      `SELECT account_status
       FROM users
       WHERE id = $1`,
      [req.user.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "User account not found.",
      });
    }

    const accountStatus = result.rows[0].account_status;

    if (accountStatus !== "ACTIVE") {
      return res.status(403).json({
        error: "Your account is not active.",
        account_status: accountStatus,
      });
    }

    next();
  } catch (err) {
    console.error("Account status check error:", err);

    return res.status(500).json({
      error: "Failed to verify account status.",
    });
  }
};

const authorizeRoles = (...allowedRoles) => {
  const normalizedAllowed = allowedRoles.map((r) => r.toUpperCase());

  return async (req, res, next) => {
    try {
      const userRole = (req.user?.role || "").toUpperCase();

      if (!req.user || !normalizedAllowed.includes(userRole)) {
        return res.status(403).json({
          error: `Access denied. Allowed roles: [${allowedRoles.join(", ")}]`,
        });
      }

      const result = await pool.query(
        `SELECT account_status
         FROM users
         WHERE id = $1`,
        [req.user.id],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: "User account not found.",
        });
      }

      const accountStatus = result.rows[0].account_status;

      if (accountStatus !== "ACTIVE") {
        return res.status(403).json({
          error: "Your account is not active.",
          account_status: accountStatus,
        });
      }

      next();
    } catch (err) {
      console.error("Authorization error:", err);

      return res.status(500).json({
        error: "Failed to verify account authorization.",
      });
    }
  };
};

module.exports = { verifyToken, requireActiveAccount, authorizeRoles };
