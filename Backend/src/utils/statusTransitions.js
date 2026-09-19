/**
 * Case status lifecycle:
 *
 *   PENDING_VALIDATION   -- AI worker writes this directly to the DB,
 *   PROCESSING_ANALYSIS     not through this HTTP API. Listed here only
 *                            for documentation completeness.
 *        |
 *        v
 *   VALIDATION_PASSED  <-- also reachable from REJECTED_JUNK via the
 *   REJECTED_JUNK           existing /verify-junk override (NGO/ADMIN)
 *        |
 *        v  (claimCase — atomic UPDATE, not this matrix)
 *   IN_PROGRESS
 *        |
 *        v  (submitRescueEvidence — requires evidence)
 *   RESCUE_COMPLETED
 *        |
 *        v  (verifyCompletion — accept)
 *   RESOLVED
 *
 *   RESCUE_COMPLETED --(verifyCompletion — reject, with reason)--> IN_PROGRESS
 *   IN_PROGRESS / VALIDATION_PASSED --(cancel)--> CANCELLED
 *
 * This module governs ONLY the plain PUT /api/cases/:id/status endpoint,
 * which is now scoped to cancellation. Claiming, evidence submission and
 * verification each have their own dedicated endpoint/handler because
 * they carry extra requirements (atomicity, evidence payload, reviewer
 * role) that a generic status-setter can't safely express.
 */

const CANCELLABLE_FROM = ["VALIDATION_PASSED", "IN_PROGRESS"];

/**
 * Can this role cancel a case currently in `fromStatus`?
 * ADMIN can cancel from any non-terminal state.
 */
function canCancel(role, fromStatus) {
  const normalizedRole = (role || "").toUpperCase();

  if (normalizedRole === "ADMIN") {
    return !["RESOLVED", "CANCELLED"].includes(fromStatus);
  }

  if (normalizedRole === "VOLUNTEER" || normalizedRole === "NGO") {
    return CANCELLABLE_FROM.includes(fromStatus);
  }

  return false;
}

/**
 * Can this role submit rescue evidence to move IN_PROGRESS -> RESCUE_COMPLETED?
 * Must be the case's assigned volunteer/NGO handler, or an admin.
 */
function canSubmitEvidence({ role, isAssignedToCaller, fromStatus }) {
  if (fromStatus !== "IN_PROGRESS") return false;

  const normalizedRole = (role || "").toUpperCase();

  if (normalizedRole === "ADMIN") return true;

  if (normalizedRole === "VOLUNTEER" || normalizedRole === "NGO") {
    return isAssignedToCaller;
  }

  return false;
}

/**
 * Can this role verify (accept/reject) a RESCUE_COMPLETED case?
 * Per the role matrix: ADMIN always; NGO only within their own
 * jurisdiction (checked by the caller before this function runs).
 */
function canVerifyCompletion({ role, isWithinNgoJurisdiction, fromStatus }) {
  if (fromStatus !== "RESCUE_COMPLETED") return false;

  const normalizedRole = (role || "").toUpperCase();

  if (normalizedRole === "ADMIN") return true;

  if (normalizedRole === "NGO") return Boolean(isWithinNgoJurisdiction);

  return false;
}

module.exports = {
  canCancel,
  canSubmitEvidence,
  canVerifyCompletion,
};
