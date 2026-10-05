const { performance } = require("node:perf_hooks");
const { randomUUID } = require("node:crypto");

const base = process.env.RESEARCH_API_BASE_URL.replace(/\/$/, "");
const email = process.env.RESEARCH_USER_EMAIL;
const password = process.env.RESEARCH_USER_PASSWORD;
const imageUrl = process.env.RESEARCH_IMAGE_URL;
const timeoutMs = Number(process.env.RESEARCH_TIMEOUT_MS || 180000);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseCookies(response) {
  const values = response.headers.getSetCookie
    ? response.headers.getSetCookie()
    : [];
  return values.map((value) => value.split(";", 1)[0]).join("; ");
}

async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(base + path, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function login() {
  const response = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  const body = await response.json();
  assert(response.ok, "Research login failed: " + JSON.stringify(body));

  const cookie = parseCookies(response);
  const csrfCookie = cookie.match(/anirescue_csrf_v2=([^;]+)/)?.[1];
  assert(cookie, "Login did not return a session cookie.");

  return { cookie, csrfCookie, user: body.user };
}

async function run() {
  console.log("AniRescue LIVE research evaluation");
  console.log("API:", base);

  // R3 live Gemini is observed through the completed AI result on the case.
  // The worker's Gemini contract tests remain the deterministic R3 safety net.
  const auth = await login();
  console.log("Authenticated research user:", auth.user.email);

  if (process.env.RESEARCH_FCM_TOKEN) {
    const tokenResponse = await request("/api/auth/device-token", {
      method: "POST",
      headers: {
        Cookie: auth.cookie,
        "X-CSRF-Token": auth.csrfCookie || "",
      },
      body: JSON.stringify({
        token: process.env.RESEARCH_FCM_TOKEN,
        platform: "research",
      }),
    });
    const tokenBody = await tokenResponse.json();
    assert(tokenResponse.ok, "R9 FCM token registration failed: " + JSON.stringify(tokenBody));
    console.log("R9 FCM token registered before case notification.");
  }

  const reportStart = performance.now();
  const report = await request("/api/cases/report", {
    method: "POST",
    headers: {
      Cookie: auth.cookie,
      "X-CSRF-Token": auth.csrfCookie || "",
    },
    body: JSON.stringify({
      clientRequestId: randomUUID(),
      imageUrl,
      description: "Research evaluation animal rescue case.",
      location: {
        lat: 19.076,
        lng: 72.877,
        address: "Research evaluation location",
        isCustom: true,
      },
    }),
  });

  const reportBody = await report.json();
  assert(report.ok, "R4/R5 report submission failed: " + JSON.stringify(reportBody));

  const caseId = reportBody.case?.id;
  assert(caseId, "Report response did not contain a case id.");

  const submitMs = performance.now() - reportStart;
  console.log(JSON.stringify({
    test: "R5",
    caseId,
    http_submission_ms: Number(submitMs.toFixed(2)),
  }));

  const pollStart = performance.now();
  let latest;

  while (performance.now() - pollStart < timeoutMs) {
    const detail = await request("/api/cases/" + caseId, {
      headers: { Cookie: auth.cookie },
    });

    if (detail.ok) {
      const body = await detail.json();
      latest = body.case;

      if (
        latest?.status === "VALIDATION_PASSED" ||
        latest?.status === "REJECTED_JUNK" ||
        latest?.failed_at
      ) {
        break;
      }
    }

    await sleep(2000);
  }

  assert(latest, "R4 polling never returned case state.");

  const aiMs = performance.now() - pollStart;
  console.log(JSON.stringify({
    test: "R4/R5",
    caseId,
    final_status: latest.status,
    ai_completion_ms: Number(aiMs.toFixed(2)),
    gemini_status: latest.gemini_status || null,
    gemini_analysis_present: Boolean(latest.gemini_analysis),
    ai_confidence: latest.ai_confidence ?? null,
  }));

  assert(
    ["VALIDATION_PASSED", "REJECTED_JUNK"].includes(latest.status),
    "R4 did not reach a final AI validation state: " + latest.status,
  );

  // R9: notification creation is asynchronous/non-blocking, so poll the
  // authenticated notification feed rather than assuming immediate visibility.
  const notificationDeadline = performance.now() + Math.min(timeoutMs, 30000);
  let notificationPersisted = false;

  while (performance.now() < notificationDeadline) {
    const notifications = await request("/api/notifications?limit=100", {
      headers: { Cookie: auth.cookie },
    });
    assert(notifications.ok, "R9 notification endpoint failed.");

    const notificationBody = await notifications.json();
    const list = notificationBody.notifications || [];
    if (Array.isArray(list) && list.some((n) => Number(n.case_id) === Number(caseId))) {
      notificationPersisted = true;
      break;
    }
    await sleep(1000);
  }

  assert(notificationPersisted, "R9 did not observe the reporter notification for the research case.");
  console.log(JSON.stringify({
    test: "R9",
    caseId,
    notification_persisted: true,
    fcm_send_path_exercised: Boolean(process.env.RESEARCH_FCM_TOKEN),
  }));

  if (process.env.RESEARCH_FCM_TOKEN) {
    console.log("R9 actual device receipt is not claimed; observe the registered client/device separately.");
  }

  // R10: feedback persistence for the authenticated USER.
  const feedbackResponse = await request("/api/feedback", {
    method: "POST",
    headers: {
      Cookie: auth.cookie,
      "X-CSRF-Token": auth.csrfCookie || "",
    },
    body: JSON.stringify({
      category: "SUGGESTION",
      rating: 5,
      message: "Research evaluation feedback.",
      caseId,
    }),
  });

  const feedbackBody = await feedbackResponse.json();
  assert(feedbackResponse.ok, "R10 feedback submission failed: " + JSON.stringify(feedbackBody));

  console.log(JSON.stringify({
    test: "R10",
    feedback_created: true,
    feedback_id: feedbackBody.feedback?.id || null,
  }));

  console.log("LIVE R3-R5/R9-R10 RESULT: PASS");
}

run().catch((error) => {
  console.error("LIVE R3-R5/R9-R10 RESULT: FAIL");
  console.error(error?.stack || error);
  process.exit(1);
});
