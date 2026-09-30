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
 *
 * `friendly` swaps the operational wording (used by
 * volunteer/NGO/admin) for the plain-language version aimed at the
 * person who reported the case — same underlying status, same
 * history, different words.
 */
export default function CaseTimeline({ caseItem, history = [], friendly = false }) {
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
      label: friendly ? 'AI check passed' : 'AI verification passed',
      detail: friendly
        ? undefined
        : 'Automated species validation (not individually logged)',
      done: true,
      synthetic: true,
    });
  }

  if (!hasAiStep && caseItem.status === 'REJECTED_JUNK') {
    entries.push({
      label: friendly ? 'AI check needs a second look' : 'AI verification failed',
      detail: friendly
        ? undefined
        : 'Image could not be confirmed as a rescue-eligible animal',
      done: true,
      synthetic: true,
    });
  }

  const currentConfig = getStatusConfig(caseItem.status);
  const currentLabel = friendly
    ? currentConfig.friendlyLabel || currentConfig.label
    : currentConfig.label;

  return (
    <div className="space-y-0">
      {entries.map((entry, index) => (
        <div
          key={index}
          className="flex gap-3 animate-rescue-fade-up"
          style={{ animationDelay: `${index * 60}ms` }}
        >
          <div className="flex flex-col items-center">
            <div
              className={`w-3 h-3 rounded-full shrink-0 mt-1 ${
                entry.done ? 'bg-emerald-500' : 'bg-stone-300 dark:bg-stone-700'
              }`}
            />
            {index < entries.length - 1 && (
              <div className="w-px flex-1 bg-stone-200 dark:bg-stone-700 my-1" />
            )}
          </div>

          <div className="pb-5 min-w-0">
            <p className="text-sm font-bold text-stone-800 dark:text-stone-100">
              {entry.label}
            </p>

            {entry.detail && (
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                {entry.detail}
              </p>
            )}

            {entry.timestamp && (
              <p className="text-[11px] text-stone-400 dark:text-stone-500 mt-0.5">
                {new Date(entry.timestamp).toLocaleString()}
                {entry.role && !friendly && ` • ${entry.role}`}
              </p>
            )}
          </div>
        </div>
      ))}

      {/* Current state, always shown last */}
      <div
        className="flex gap-3 animate-rescue-fade-up"
        style={{ animationDelay: `${entries.length * 60}ms` }}
      >
        <div className="w-3 h-3 rounded-full shrink-0 mt-1 bg-emerald-600 ring-4 ring-emerald-600/20 animate-rescue-pop" />

        <div>
          <p className="text-sm font-black text-stone-800 dark:text-stone-100">
            {friendly ? currentLabel : `Current: ${currentLabel}`}
          </p>

          {friendly && currentConfig.friendlyDetail && (
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              {currentConfig.friendlyDetail}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
