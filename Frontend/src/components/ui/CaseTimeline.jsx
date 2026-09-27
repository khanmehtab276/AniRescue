import { getStatusConfig } from '../../utils/statusConfig';

const ACTION_LABELS = {
  CASE_REPORTED: 'Report submitted',
  JUNK_REVIEW_OVERRIDE: 'Manually reviewed',
  CASE_CLAIMED: 'Volunteer claimed this case',
  CASE_CANCELLED: 'Case cancelled',
  EVIDENCE_SUBMITTED: 'Rescue evidence submitted',
  COMPLETION_VERIFIED: 'Rescue verified — resolved',
  COMPLETION_REJECTED: 'Completion sent back for more work',
  PRIORITY_CHANGED: 'Priority updated',
};

/**
 * Renders the case_status_history rows returned by GET /api/cases/:id
 * as a vertical timeline. AI-driven transitions (PENDING_VALIDATION ->
 * VALIDATION_PASSED/REJECTED_JUNK) aren't in the history table yet
 * (the worker writes directly to the DB), so we synthesize a single
 * "AI verification" entry from the case's current status when no
 * history exists for that step — this is stated honestly, not implied
 * as a logged event.
 */
export default function CaseTimeline({ caseItem, history = [] }) {
  const entries = history.map((row) => ({
    label: ACTION_LABELS[row.action] || row.action,
    detail: row.notes,
    timestamp: row.created_at,
    role: row.actor_role,
    done: true,
  }));

  const hasAiStep = history.some((row) =>
    ['VALIDATION_PASSED', 'REJECTED_JUNK'].includes(row.to_status),
  );

  if (
    !hasAiStep &&
    ['VALIDATION_PASSED', 'IN_PROGRESS', 'RESCUE_COMPLETED', 'RESOLVED'].includes(
      caseItem.status,
    )
  ) {
    entries.splice(1, 0, {
      label: 'AI verification passed',
      detail: 'Automated species validation (not individually logged)',
      done: true,
      synthetic: true,
    });
  }

  if (!hasAiStep && caseItem.status === 'REJECTED_JUNK') {
    entries.push({
      label: 'AI verification failed',
      detail: 'Image could not be confirmed as a rescue-eligible animal',
      done: true,
      synthetic: true,
    });
  }

  return (
    <div className="space-y-0">
      {entries.map((entry, index) => (
        <div key={index} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div
              className={`w-3 h-3 rounded-full shrink-0 mt-1 ${
                entry.done ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
              }`}
            />
            {index < entries.length - 1 && (
              <div className="w-px flex-1 bg-slate-200 dark:bg-slate-700 my-1" />
            )}
          </div>

          <div className="pb-5 min-w-0">
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
              {entry.label}
            </p>

            {entry.detail && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {entry.detail}
              </p>
            )}

            {entry.timestamp && (
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                {new Date(entry.timestamp).toLocaleString()}
                {entry.role && ` • ${entry.role}`}
              </p>
            )}
          </div>
        </div>
      ))}

      {/* Current state, always shown last */}
      <div className="flex gap-3">
        <div className="w-3 h-3 rounded-full shrink-0 mt-1 bg-emerald-600 ring-4 ring-emerald-600/20" />

        <div>
          <p className="text-sm font-black text-slate-800 dark:text-slate-100">
            Current: {getStatusConfig(caseItem.status).label}
          </p>
        </div>
      </div>
    </div>
  );
}
