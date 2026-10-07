const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const { pool } = require("../config/db");

const PRODUCTION_SESSION_COOKIE = "__Host-anirescue_session_v2";
const LOCAL_SESSION_COOKIE = "anirescue_session_v2";
const MAP_ROOM = "rescue-map";

let io = null;

function parseCookies(header = "") {
  return header.split(";").reduce((cookies, part) => {
    const separator = part.indexOf("=");
    if (separator === -1) return cookies;

    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();

    if (!key) return cookies;

    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }

    return cookies;
  }, {});
}

function getSessionToken(socket) {
  const cookies = parseCookies(socket.handshake.headers?.cookie || "");
  return (
    cookies[PRODUCTION_SESSION_COOKIE] ||
    cookies[LOCAL_SESSION_COOKIE] ||
    null
  );
}

async function authenticateSocket(socket, next) {
  const token = getSessionToken(socket);

  if (!token) {
    return next(new Error("Authentication required."));
  }

  try {
    const claims = jwt.verify(token, process.env.JWT_SECRET);

    if (!claims?.id) {
      return next(new Error("Invalid session."));
    }

    const result = await pool.query(
      `SELECT id, role, account_status
       FROM users
       WHERE id = $1`,
      [claims.id],
    );

    const user = result.rows[0];

    if (!user || user.account_status !== "ACTIVE") {
      return next(new Error("Your account is not active."));
    }

    const role = String(user.role || "").toUpperCase();

    if (!["USER", "VOLUNTEER", "NGO", "ADMIN"].includes(role)) {
      return next(new Error("Access denied."));
    }

    socket.user = {
      id: user.id,
      role,
    };

    return next();
  } catch (error) {
    console.warn(
      "Socket authentication rejected:",
      error?.message || error,
    );
    return next(new Error("Invalid or expired session."));
  }
}

function getAllowedOrigins() {
  return (process.env.CORS_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isOriginAllowed(origin) {
  if (!origin) return true;

  const configured = getAllowedOrigins();

  if (configured.length === 0 && process.env.NODE_ENV !== "production") {
    return (
      origin === "http://localhost:5173" ||
      origin === "http://127.0.0.1:5173"
    );
  }

  return configured.includes(origin);
}

function initializeCaseRealtime(httpServer) {
  if (io) return io;

  io = new Server(httpServer, {
    cors: {
      origin(origin, callback) {
        if (isOriginAllowed(origin)) {
          return callback(null, true);
        }

        return callback(new Error("Origin is not allowed by CORS."));
      },
      credentials: true,
      methods: ["GET", "POST"],
    },
    transports: ["websocket", "polling"],
    pingInterval: 25000,
    pingTimeout: 20000,
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
      skipMiddlewares: false,
    },
  });

  io.use(authenticateSocket);

  io.on("connection", (socket) => {
    socket.join(MAP_ROOM);

    socket.emit("rescue:ready", {
      role: socket.user.role,
      realtime: true,
    });

    console.log(
      `🔌 Rescue map socket connected: user=${socket.user.id} role=${socket.user.role}`,
    );

    socket.on("disconnect", (reason) => {
      console.log(
        `🔌 Rescue map socket disconnected: user=${socket.user.id} reason=${reason}`,
      );
    });
  });

  return io;
}

/*
 * Deliberately emit no case ID, coordinates, status, reporter ID, or
 * jurisdiction information. The event is only a cache-invalidation signal.
 *
 * Every client must re-fetch GET /api/cases/map, which applies the same
 * server-side RBAC query that protects the initial map snapshot.
 */
function publishCaseMapChange() {
  if (!io) return;

  io.to(MAP_ROOM).emit("rescue:cases:changed", {
    type: "case_changed",
    occurredAt: new Date().toISOString(),
  });
}

function closeCaseRealtime() {
  if (!io) return;

  io.close();
  io = null;
}

module.exports = {
  initializeCaseRealtime,
  publishCaseMapChange,
  closeCaseRealtime,
};
