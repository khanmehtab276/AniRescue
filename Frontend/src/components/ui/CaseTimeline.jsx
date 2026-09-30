import { getStatusConfig } from '../../utils/statusConfig';

const ACTION_LABELS = {
  CASE_REPORTED: 'Report submitted',
  JUNK_REVIEW_OVERRIDE: 'Manually reviewed',
  CASE_CLAIMED: 'Case claimed',
  CASE_ASSIGNED: 'Volunteer assigned',
  CASE_RELEASED: 'Case released',
  CASE_CANCELLED: 'Case cancelled',
  EVIDENCE_SUBMITTED: 'Rescue evidence submitted',
  COMPLETION_VERIFIED: 'Rescue verified — resolved',
  COMPLETION_REJECTED: 'Completion sent back for more work',
  PRIORITY_CHANGED: 'Priority updated',
};

export default function CaseTimeline({ caseItem, history = [], friendly = false }) {
  const entries = history.map((row) => ({
    label: ACTION_LABELS[row.action] || row.action || 'Case updated',
    detail: row.notes,
    timestamp: row.created_at,
    role: row.actor_role,
  }));

  const currentConfig = getStatusConfig(caseItem.status);
  const currentLabel = friendly
    ? currentConfig.friendlyLabel || currentConfig.label
    : currentConfig.label;

  return (
    <div className="space-y-0">
      {entries.length === 0 && (
        <p className="mb-5 text-sm text-stone-500 dark:text-stone-400">
          No recorded case-history events are available yet.
        </p>
      )}

      {entries.map((entry, index) => (
        <div
          key={`${entry.timestamp || 'event'}-${index}`}
          className="flex gap-3 animate-rescue-fade-up"
          style={{ animationDelay: `${index * 60}ms` }}
        >
          <div className="flex flex-col items-center">
            <div className="mt-1 h-3 w-3 shrink-0 rounded-full bg-emerald-500" />
            {index < entries.length - 1 && (
              <div className="my-1 w-px flex-1 bg-stone-200 dark:bg-stone-700" />
            )}
          </div>

          <div className="min-w-0 pb-5">
            <p className="text-sm font-bold text-stone-800 dark:text-stone-100">{entry.label}</p>
            {entry.detail && (
              <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">{entry.detail}</p>
            )}
            {entry.timestamp && (
              <p className="mt-0.5 text-[11px] text-stone-400 dark:text-stone-500">
                {new Date(entry.timestamp).toLocaleString()}
                {entry.role && !friendly && ` • ${entry.role}`}
              </p>
            )}
          </div>
        </div>
      ))}

      <div className="flex gap-3 animate-rescue-fade-up">
        <div className="mt-1 h-3 w-3 shrink-0 rounded-full bg-emerald-600 ring-4 ring-emerald-600/20 animate-rescue-pop" />
        <div>
          <p className="text-sm font-black text-stone-800 dark:text-stone-100">
            {friendly ? currentLabel : `Current: ${currentLabel}`}
          </p>
          {friendly && currentConfig.friendlyDetail && (
            <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
              {currentConfig.friendlyDetail}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
