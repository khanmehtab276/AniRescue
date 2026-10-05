const test = require("node:test");
const assert = require("node:assert/strict");

const {
  canCancel,
  canSubmitEvidence,
  canVerifyCompletion,
} = require("../src/utils/statusTransitions");
const { haversineKm } = require("../src/utils/geo");

/**
 * Research evaluation tests are deliberately deterministic.
 * They verify implemented application behaviour without requiring a live
 * Neon database, RabbitMQ broker, Firebase project, or external AI API.
 *
 * These tests are NOT claimed as model-accuracy results. They are functional
 * results for the implemented rescue workflow and location-aware rules.
 */

test("RBAC: only assigned handlers/admin can submit rescue evidence", () => {
  assert.equal(
    canSubmitEvidence({
      role: "VOLUNTEER",
      isAssignedToCaller: true,
      fromStatus: "IN_PROGRESS",
    }),
    true,
  );

  assert.equal(
    canSubmitEvidence({
      role: "VOLUNTEER",
      isAssignedToCaller: false,
      fromStatus: "IN_PROGRESS",
    }),
    false,
  );

  assert.equal(
    canSubmitEvidence({
      role: "NGO",
      isAssignedToCaller: true,
      fromStatus: "IN_PROGRESS",
    }),
    true,
  );

  assert.equal(
    canSubmitEvidence({
      role: "USER",
      isAssignedToCaller: true,
      fromStatus: "IN_PROGRESS",
    }),
    false,
  );
});

test("case lifecycle: cancellation is restricted by role and status", () => {
  assert.equal(canCancel("VOLUNTEER", "VALIDATION_PASSED"), true);
  assert.equal(canCancel("VOLUNTEER", "IN_PROGRESS"), true);
  assert.equal(canCancel("NGO", "IN_PROGRESS"), true);
  assert.equal(canCancel("USER", "IN_PROGRESS"), false);
  assert.equal(canCancel("ADMIN", "RESOLVED"), false);
});

test("completion verification: NGO requires jurisdiction while ADMIN does not", () => {
  assert.equal(
    canVerifyCompletion({
      role: "NGO",
      isWithinNgoJurisdiction: true,
      fromStatus: "RESCUE_COMPLETED",
    }),
    true,
  );

  assert.equal(
    canVerifyCompletion({
      role: "NGO",
      isWithinNgoJurisdiction: false,
      fromStatus: "RESCUE_COMPLETED",
    }),
    false,
  );

  assert.equal(
    canVerifyCompletion({
      role: "ADMIN",
      isWithinNgoJurisdiction: false,
      fromStatus: "RESCUE_COMPLETED",
    }),
    true,
  );

  assert.equal(
    canVerifyCompletion({
      role: "NGO",
      isWithinNgoJurisdiction: true,
      fromStatus: "IN_PROGRESS",
    }),
    false,
  );
});

test("geospatial coordination: identical coordinates produce zero distance", () => {
  assert.equal(haversineKm(19.076, 72.8777, 19.076, 72.8777), 0);
});

test("geospatial coordination: Haversine distance is symmetric", () => {
  const forward = haversineKm(19.076, 72.8777, 19.2183, 72.9781);
  const reverse = haversineKm(19.2183, 72.9781, 19.076, 72.8777);

  assert.ok(forward > 0);
  assert.ok(Math.abs(forward - reverse) < 0.000001);
});

test("geospatial coordination: a nearby point is closer than a distant point", () => {
  const casePoint = [19.076, 72.8777];
  const nearby = haversineKm(...casePoint, 19.08, 72.882);
  const distant = haversineKm(...casePoint, 19.2183, 72.9781);

  assert.ok(nearby < distant);
});
