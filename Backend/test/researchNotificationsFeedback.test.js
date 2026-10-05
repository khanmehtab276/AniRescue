const assert = require("node:assert/strict");
const test = require("node:test");

function mockModule(path, value) {
  const resolved = require.resolve(path);
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports: value,
  };
  return resolved;
}

function clearModule(path) {
  const resolved = require.resolve(path);
  delete require.cache[resolved];
}

test("R9: case notification recipient selection includes only eligible role/location recipients", async () => {
  const queries = [];
  const pool = {
    query: async (sql, params = []) => {
      queries.push({ sql, params });

      if (sql.includes("FROM rescue_cases")) {
        return { rows: [{ id: 501, reporter_id: 10, assigned_volunteer_id: 20, latitude: 19.076, longitude: 72.877 }] };
      }

      if (sql.includes("u.role = 'VOLUNTEER'")) {
        return { rows: [{ id: 20 }, { id: 30 }] };
      }

      if (sql.includes("u.role = 'NGO'")) {
        return { rows: [{ id: 40 }] };
      }

      if (sql.includes("role = 'ADMIN'")) {
        return { rows: [{ id: 50 }] };
      }

      throw new Error("Unexpected query in R9 test: " + sql);
    },
  };

  const dbPath = require.resolve("../src/config/db");
  const notificationPath = require.resolve("../src/utils/notifications");
  const recipientsPath = require.resolve("../src/utils/caseNotificationRecipients");

  mockModule(dbPath, { pool });
  mockModule(notificationPath, { notifyUser: async () => ({ id: 1 }) });
  clearModule(recipientsPath);

  const { getCaseRecipients } = require("../src/utils/caseNotificationRecipients");

  const recipients = await getCaseRecipients({
    caseId: 501,
    includeReporter: true,
    includeAssignedVolunteer: true,
    includeNearbyVolunteers: true,
    includeNearbyNgos: true,
    includeAdmins: true,
  });

  assert.deepEqual(recipients.sort((a, b) => a - b), [10, 20, 30, 40, 50]);

  clearModule(recipientsPath);
  clearModule(notificationPath);
  clearModule(dbPath);
  assert.ok(queries.length >= 4);
});

test("R9: notification persistence is idempotent for the same user/case/type", async () => {
  let callCount = 0;
  const pool = {
    query: async () => {
      callCount += 1;
      return {
        rows: callCount === 1
          ? [{ id: 91, user_id: 10, case_id: 501, notification_type: "CASE_REPORTED" }]
          : [],
      };
    },
  };

  const dbPath = require.resolve("../src/config/db");
  const notificationPath = require.resolve("../src/utils/notifications");
  mockModule(dbPath, { pool });
  mockModule(require.resolve("../src/utils/pushNotifications"), {
    sendPushNotification: async () => ({ messageId: "research-message" }),
  });
  clearModule(notificationPath);

  const { createNotification } = require("../src/utils/notifications");

  const first = await createNotification({
    userId: 10,
    caseId: 501,
    notificationType: "CASE_REPORTED",
    title: "Research",
    message: "Research notification",
  });
  const second = await createNotification({
    userId: 10,
    caseId: 501,
    notificationType: "CASE_REPORTED",
    title: "Research",
    message: "Research notification",
  });

  assert.equal(first.id, 91);
  assert.equal(second, null);

  clearModule(notificationPath);
  clearModule(dbPath);
});

test("R10: feedback accepts a valid rating/category and persists the submitting role", async () => {
  const queries = [];
  const pool = {
    query: async (sql, params = []) => {
      queries.push({ sql, params });

      if (sql.includes("INSERT INTO feedback")) {
        return { rows: [{ id: 700, category: params[1], rating: params[2], message: params[3], case_id: params[4] }] };
      }

      if (sql.includes("SELECT id FROM users WHERE role = 'ADMIN'")) {
        return { rows: [] };
      }

      throw new Error("Unexpected R10 query: " + sql);
    },
  };

  const dbPath = require.resolve("../src/config/db");
  const notificationPath = require.resolve("../src/utils/notifications");
  const controllerPath = require.resolve("../src/controllers/feedback.controller");

  mockModule(dbPath, { pool });
  mockModule(notificationPath, { notifyUser: async () => null });
  clearModule(controllerPath);

  const { submitFeedback } = require("../src/controllers/feedback.controller");

  let responseBody;
  const req = {
    user: { id: 10, role: "USER" },
    body: { category: " suggestion ", rating: 5, message: "Useful rescue workflow." },
  };
  const res = {
    status(code) { this.statusCode = code; return this; },
    json(body) { responseBody = body; return this; },
  };

  await submitFeedback(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(responseBody.success, true);
  assert.equal(responseBody.feedback.category, "SUGGESTION");
  assert.equal(queries[0].params[0], 10);

  clearModule(controllerPath);
  clearModule(notificationPath);
  clearModule(dbPath);
});

test("R10: feedback rejects invalid ratings before database writes", async () => {
  let databaseTouched = false;
  const pool = {
    query: async () => {
      databaseTouched = true;
      return { rows: [] };
    },
  };

  const dbPath = require.resolve("../src/config/db");
  const controllerPath = require.resolve("../src/controllers/feedback.controller");
  mockModule(dbPath, { pool });
  clearModule(controllerPath);

  const { submitFeedback } = require("../src/controllers/feedback.controller");

  let responseBody;
  const req = {
    user: { id: 10, role: "VOLUNTEER" },
    body: { category: "PLATFORM", rating: 6, message: "invalid" },
  };
  const res = {
    status(code) { this.statusCode = code; return this; },
    json(body) { responseBody = body; return this; },
  };

  await submitFeedback(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(databaseTouched, false);
  assert.match(responseBody.error, /1 to 5/);

  clearModule(controllerPath);
  clearModule(dbPath);
});
