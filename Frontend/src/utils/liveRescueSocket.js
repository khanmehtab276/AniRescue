import API from "./api.js";

const SOCKET_CLIENT_PATH = "/socket.io/socket.io.js";
const SOCKET_GLOBAL_KEY = "__anirescueSocketIoLoader";
const SOCKET_INSTANCE_KEY = "__anirescueLiveRescueSocket";

function resolveBackendOrigin() {
  const configured = String(import.meta.env.VITE_API_URL || "").trim();

  if (/^https?:\/\//i.test(configured)) {
    try {
      const url = new URL(configured);
      url.pathname = "";
      url.search = "";
      url.hash = "";
      return url.toString().replace(/\/$/, "");
    } catch {
      // Fall through to same-origin when configuration is malformed.
    }
  }

  return window.location.origin;
}

function loadSocketIoClient() {
  if (window[SOCKET_GLOBAL_KEY]) {
    return window[SOCKET_GLOBAL_KEY];
  }

  window[SOCKET_GLOBAL_KEY] = new Promise((resolve, reject) => {
    if (window.io) {
      resolve(window.io);
      return;
    }

    const script = document.createElement("script");
    script.src = `${resolveBackendOrigin()}${SOCKET_CLIENT_PATH}`;
    script.async = true;
    script.dataset.anirescueSocketIo = "true";

    script.onload = () => {
      if (window.io) {
        resolve(window.io);
      } else {
        reject(new Error("Socket.IO client library did not initialize."));
      }
    };

    script.onerror = () => {
      reject(new Error("Unable to load the Socket.IO client library."));
    };

    document.head.appendChild(script);
  }).catch((error) => {
    window[SOCKET_GLOBAL_KEY] = null;
    throw error;
  });

  return window[SOCKET_GLOBAL_KEY];
}

let connectionPromise = null;
const listeners = new Set();
const statusListeners = new Set();
let refreshPromise = null;

function notifyStatus(status) {
  statusListeners.forEach((listener) => {
    try {
      listener(status);
    } catch (error) {
      console.error("Live rescue status listener failed:", error);
    }
  });
}

function notifyChange(payload) {
  listeners.forEach((listener) => {
    try {
      listener(payload);
    } catch (error) {
      console.error("Live rescue event listener failed:", error);
    }
  });
}

async function refreshAuthenticatedSession() {
  if (!refreshPromise) {
    refreshPromise = API.get("/auth/me")
      .then(() => true)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

async function ensureSocket() {
  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = (async () => {
    const io = await loadSocketIoClient();

    const socket = io(resolveBackendOrigin(), {
      withCredentials: true,
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 10000,
    });

    window[SOCKET_INSTANCE_KEY] = socket;

    socket.on("connect", () => {
      notifyStatus("live");
    });

    socket.on("rescue:ready", () => {
      notifyStatus("live");
    });

    socket.on("rescue:cases:changed", (payload) => {
      notifyChange(payload);
    });

    socket.on("disconnect", () => {
      notifyStatus("reconnecting");
    });

    socket.on("reconnect_attempt", () => {
      notifyStatus("reconnecting");
    });

    socket.on("reconnect", () => {
      notifyStatus("live");
    });

    socket.on("connect_error", async (error) => {
      const message = String(error?.message || "").toLowerCase();

      if (message.includes("invalid") || message.includes("expired") || message.includes("authentication")) {
        notifyStatus("reconnecting");
        const refreshed = await refreshAuthenticatedSession();

        if (refreshed && !socket.connected) {
          socket.connect();
          return;
        }

        if (!refreshed) {
          notifyStatus("offline");
        }
        return;
      }

      notifyStatus("reconnecting");
    });

    return socket;
  })().catch((error) => {
    connectionPromise = null;
    notifyStatus("offline");
    throw error;
  });

  return connectionPromise;
}

export async function subscribeToLiveRescueMap(onChange, onStatus) {
  if (typeof onChange === "function") listeners.add(onChange);
  if (typeof onStatus === "function") statusListeners.add(onStatus);

  notifyStatus("connecting");

  try {
    await ensureSocket();
  } catch (error) {
    console.error("Live rescue socket unavailable:", error);
  }

  return () => {
    if (typeof onChange === "function") listeners.delete(onChange);
    if (typeof onStatus === "function") statusListeners.delete(onStatus);

    if (listeners.size === 0 && statusListeners.size === 0) {
      const socket = window[SOCKET_INSTANCE_KEY];

      if (socket) {
        socket.disconnect();
      }

      window[SOCKET_INSTANCE_KEY] = null;
      connectionPromise = null;
    }
  };
}
