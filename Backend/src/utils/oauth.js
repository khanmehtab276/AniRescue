const crypto = require("crypto");

const STATE_COOKIE = "anirescue_oauth_state_v1";
const STATE_MAX_AGE_SECONDS = 10 * 60;

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function cookieAttributes({ httpOnly = true, maxAge = STATE_MAX_AGE_SECONDS } = {}) {
  const parts = [
    "Path=/api/auth/oauth",
    isProduction() ? "Secure" : "",
    isProduction() ? "SameSite=None" : "SameSite=Lax",
    httpOnly ? "HttpOnly" : "",
    Number.isFinite(maxAge) ? `Max-Age=${maxAge}` : "",
  ];

  return parts.filter(Boolean).join("; ");
}

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

function createStatePayload({ provider }) {
  return {
    state: crypto.randomBytes(32).toString("hex"),
    provider,
    createdAt: Date.now(),
  };
}

function setStateCookie(res, payload) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");

  res.append(
    "Set-Cookie",
    `${STATE_COOKIE}=${encoded}; ${cookieAttributes()}`,
  );

  return payload.state;
}

function readStateCookie(req) {
  const cookies = parseCookies(req.headers.cookie);
  const encoded = cookies[STATE_COOKIE];

  if (!encoded) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    );

    if (
      !payload ||
      typeof payload.state !== "string" ||
      typeof payload.provider !== "string" ||
      !Number.isFinite(payload.createdAt)
    ) {
      return null;
    }

    if (Date.now() - payload.createdAt > STATE_MAX_AGE_SECONDS * 1000) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function clearStateCookie(res) {
  res.append(
    "Set-Cookie",
    `${STATE_COOKIE}=; ${cookieAttributes({ maxAge: 0 })}`,
  );
}

function constantTimeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;

  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) return false;

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function getFrontendUrl() {
  const explicit = String(process.env.OAUTH_FRONTEND_URL || "").trim();

  if (explicit) return explicit;

  if (isProduction()) {
    throw new Error("OAUTH_FRONTEND_URL must be configured in production.");
  }

  return (
    String(process.env.CORS_ORIGIN || "http://localhost:5173")
      .split(",")
      .map((value) => value.trim())
      .find(Boolean) || "http://localhost:5173"
  );
}

function getGoogleConfig() {
  return {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || "",
    redirectUri:
      process.env.GOOGLE_OAUTH_REDIRECT_URI ||
      `${process.env.BACKEND_PUBLIC_URL || "http://localhost:3000"}/api/auth/oauth/google/callback`,
  };
}

function getFacebookConfig() {
  return {
    appId: process.env.FACEBOOK_OAUTH_APP_ID || "",
    appSecret: process.env.FACEBOOK_OAUTH_APP_SECRET || "",
    redirectUri:
      process.env.FACEBOOK_OAUTH_REDIRECT_URI ||
      `${process.env.BACKEND_PUBLIC_URL || "http://localhost:3000"}/api/auth/oauth/facebook/callback`,
    graphVersion: process.env.FACEBOOK_GRAPH_VERSION || "",
  };
}

function getGoogleAuthorizationUrl(state) {
  const config = getGoogleConfig();

  if (!config.clientId || !config.clientSecret) {
    throw new Error("Google OAuth is not configured.");
  }

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");

  return url.toString();
}

function getFacebookAuthorizationUrl(state) {
  const config = getFacebookConfig();

  if (!config.appId || !config.appSecret || !config.graphVersion) {
    throw new Error("Facebook OAuth is not configured.");
  }

  const url = new URL(
    `https://www.facebook.com/${config.graphVersion}/dialog/oauth`,
  );
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "public_profile,email");
  url.searchParams.set("state", state);

  return url.toString();
}

async function parseJsonResponse(response, provider) {
  const body = await response.text();

  let data;
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error(`${provider} returned an invalid response.`);
  }

  if (!response.ok) {
    const providerMessage =
      data?.error?.message ||
      data?.error_description ||
      data?.message ||
      "OAuth provider request failed.";

    throw new Error(`${provider}: ${providerMessage}`);
  }

  return data;
}

async function exchangeGoogleCode(code) {
  const config = getGoogleConfig();

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const tokens = await parseJsonResponse(tokenResponse, "Google");

  if (!tokens.access_token) {
    throw new Error("Google did not return an access token.");
  }

  const userInfoResponse = await fetch(
    "https://openidconnect.googleapis.com/v1/userinfo",
    {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    },
  );

  const profile = await parseJsonResponse(userInfoResponse, "Google");

  return {
    provider: "google",
    subject: String(profile.sub || ""),
    email: String(profile.email || "").trim().toLowerCase(),
    emailVerified: profile.email_verified === true,
    name: String(profile.name || profile.given_name || "").trim(),
  };
}

async function exchangeFacebookCode(code) {
  const config = getFacebookConfig();

  const tokenUrl = new URL(
    `https://graph.facebook.com/${config.graphVersion}/oauth/access_token`,
  );

  tokenUrl.searchParams.set("client_id", config.appId);
  tokenUrl.searchParams.set("client_secret", config.appSecret);
  tokenUrl.searchParams.set("redirect_uri", config.redirectUri);
  tokenUrl.searchParams.set("code", code);

  const tokenResponse = await fetch(tokenUrl, {
    method: "GET",
  });

  const tokens = await parseJsonResponse(tokenResponse, "Facebook");

  if (!tokens.access_token) {
    throw new Error("Facebook did not return an access token.");
  }

  const profileUrl = new URL(
    `https://graph.facebook.com/${config.graphVersion}/me`,
  );
  profileUrl.searchParams.set("fields", "id,name,email");
  profileUrl.searchParams.set("access_token", tokens.access_token);

  const profileResponse = await fetch(profileUrl);
  const profile = await parseJsonResponse(profileResponse, "Facebook");

  return {
    provider: "facebook",
    subject: String(profile.id || ""),
    email: String(profile.email || "").trim().toLowerCase(),
    // Facebook does not provide a Google-style email_verified claim in this
    // profile response. Require an email and treat it as provider-supplied.
    emailVerified: Boolean(profile.email),
    name: String(profile.name || "").trim(),
  };
}

module.exports = {
  STATE_COOKIE,
  createStatePayload,
  setStateCookie,
  readStateCookie,
  clearStateCookie,
  constantTimeEqual,
  getFrontendUrl,
  getGoogleAuthorizationUrl,
  getFacebookAuthorizationUrl,
  exchangeGoogleCode,
  exchangeFacebookCode,
};
