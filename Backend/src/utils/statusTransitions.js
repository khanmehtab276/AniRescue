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
 *   IN_PROGRESS --(release, assigned handler)--> VALIDATION_PASSED
 *   VALIDATION_PASSED / IN_PROGRESS --(admin cancel)--> CANCELLED
 *
 * This module governs the authorization rules used by the dedicated
 * lifecycle endpoints. Permanent cancellation is intentionally ADMIN-only;
 * assigned volunteers use the dedicated release endpoint when they cannot
 * continue an IN_PROGRESS rescue.
 */

/**
 * Can this role permanently cancel a case currently in `fromStatus`?
 *
 * Permanent cancellation is an administrative operation. VOLUNTEER/NGO
 * handlers must use the dedicated release flow instead of terminating a
 * rescue case.
 */
function canCancel(role, fromStatus) {
  const normalizedRole = (role || "").toUpperCase();

  if (normalizedRole !== "ADMIN") return false;

  return !["RESOLVED", "CANCELLED"].includes(fromStatus);
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
