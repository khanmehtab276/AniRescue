const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createStatePayload,
  constantTimeEqual,
} = require("../src/utils/oauth");

test("OAuth state is high-entropy and provider-bound", () => {
  const payload = createStatePayload({ provider: "google" });

  assert.equal(payload.provider, "google");
  assert.equal(typeof payload.state, "string");
  assert.equal(payload.state.length, 64);
  assert.equal(typeof payload.createdAt, "number");
});

test("OAuth state comparison is constant-time safe for equal values", () => {
  assert.equal(constantTimeEqual("abc123", "abc123"), true);
  assert.equal(constantTimeEqual("abc123", "abc124"), false);
  assert.equal(constantTimeEqual("abc", "abcd"), false);
  assert.equal(constantTimeEqual(null, "abc"), false);
});
