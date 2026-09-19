const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { pool } = require("../config/db");
const { normalizeEnum } = require("../utils/helpers");

// REGISTER
const register = async (req, res) => {
  const { name, email, password, role } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({
      error: "Name, email, and password are required.",
    });
  }

  try {
    const saltRounds = 10;

    const passwordHash = await bcrypt.hash(password, saltRounds);

    const requestedRole = normalizeEnum(role);

    // ADMIN accounts can never be created through public registration.
    if (requestedRole === "ADMIN") {
      return res.status(403).json({
        error: "Admin accounts cannot be created through public registration.",
      });
    }

    const assignedRole = ["USER", "VOLUNTEER", "NGO"].includes(requestedRole)
      ? requestedRole
      : "USER";

    const accountStatus = assignedRole === "USER" ? "ACTIVE" : "PENDING";

    const result = await pool.query(
      `INSERT INTO users
          (full_name, email, password_hash, role, account_status)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, full_name, email, role, account_status`,
      [
        name.trim(),
        email.toLowerCase().trim(),
        passwordHash,
        assignedRole,
        accountStatus,
      ],
    );

    const user = result.rows[0];

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        account_status: user.account_status,
        email: user.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: "30d" },
    );

    res.status(201).json({ token, user });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(400).json({
        error: "Email address is already registered.",
      });
    }

    console.error("Registration error:", err);

    res.status(500).json({
      error: "Server error during registration.",
    });
  }
};

// LOGIN
const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      error: "Email and password are required.",
    });
  }

  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [
      email.toLowerCase().trim(),
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "User account not found.",
      });
    }

    const user = result.rows[0];

    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({
        error: "Invalid password credentials.",
      });
    }

    if (user.account_status !== "ACTIVE") {
      return res.status(403).json({
        error: "Your account is not active.",
        account_status: user.account_status,
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        email: user.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: "30d" },
    );

    delete user.password_hash;

    res.json({ token, user });
  } catch (err) {
    console.error("Login error:", err);

    res.status(500).json({
      error: "Server error during login.",
    });
  }
};

// CURRENT USER
const getCurrentUser = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, full_name, email, role, account_status,
              jurisdiction_lat, jurisdiction_lng, jurisdiction_radius_km
       FROM users
       WHERE id = $1`,
      [req.user.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "User not found.",
      });
    }

    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error("Auth check error:", err);

    res.status(500).json({
      error: "Server error during token verification.",
    });
  }
};

// UPDATE NGO OPERATING JURISDICTION
// Used to scope the NGO dashboard/verification-queue feeds to a
// service radius instead of the unfiltered master case list.
const updateJurisdiction = async (req, res) => {
  const { lat, lng, radiusKm } = req.body;

  if (typeof lat !== "number" || typeof lng !== "number") {
    return res.status(400).json({
      error: "A valid lat/lng pair is required.",
    });
  }

  const normalizedRadius =
    typeof radiusKm === "number" && radiusKm > 0 ? radiusKm : 15;

  try {
    const result = await pool.query(
      `UPDATE users
         SET jurisdiction_lat = $1,
             jurisdiction_lng = $2,
             jurisdiction_radius_km = $3
       WHERE id = $4
       RETURNING id, full_name, email, role, jurisdiction_lat, jurisdiction_lng, jurisdiction_radius_km`,
      [lat, lng, normalizedRadius, req.user.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }

    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    console.error("Update jurisdiction error:", err);

    res.status(500).json({
      error: "Failed to update operating jurisdiction.",
    });
  }
};

module.exports = { register, login, getCurrentUser, updateJurisdiction };
