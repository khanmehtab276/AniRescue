const test = require("node:test");
const assert = require("node:assert/strict");

const {
  canCancel,
  canSubmitEvidence,
  canVerifyCompletion,
} = require("../src/utils/statusTransitions");

test("permanent cancellation is restricted to admins", () => {
  assert.equal(canCancel("ADMIN", "VALIDATION_PASSED"), true);
  assert.equal(canCancel("ADMIN", "IN_PROGRESS"), true);
  assert.equal(canCancel("ADMIN", "PROCESSING_ANALYSIS"), true);
  assert.equal(canCancel("ADMIN", "RESOLVED"), false);
  assert.equal(canCancel("ADMIN", "CANCELLED"), false);
  assert.equal(canCancel("VOLUNTEER", "IN_PROGRESS"), false);
  assert.equal(canCancel("NGO", "IN_PROGRESS"), false);
  assert.equal(canCancel("USER", "IN_PROGRESS"), false);
});

test("evidence submission requires an assigned handler or admin", () => {
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

test("completion verification requires RESCUE_COMPLETED", () => {
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
      role: "NGO",
      isWithinNgoJurisdiction: true,
      fromStatus: "IN_PROGRESS",
    }),
    false,
  );
});
