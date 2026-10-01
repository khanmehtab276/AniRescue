import { Link } from 'react-router-dom';
import Surface from './Surface.jsx';
import { StatusBadge, PriorityBadge } from './Badge.jsx';
import { MapPin } from 'lucide-react';

/**
 * One case card design used on every dashboard. Only the trailing
 * `action` node changes per role/context (Claim, View Progress,
 * Manage, etc.) — the layout, spacing and status/priority display
 * are identical everywhere.
 */
export default function CaseCard({ caseItem, action, distanceKm, meta, friendly = false }) {
  const timeAgo = caseItem.created_at
    ? formatRelativeTime(caseItem.created_at)
    : null;

  return (
    <Surface className="p-5 transition-transform duration-150 hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <Link
          to={`/cases/${caseItem.id}`}
          className="min-w-0 group"
        >
          <h3 className="font-bold text-stone-800 dark:text-stone-100 truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
            {caseItem.species || 'Animal Rescue Case'}
          </h3>

          <p className="text-xs font-bold text-stone-500 dark:text-stone-400">
            CASE-{caseItem.id}
            {timeAgo && ` • ${timeAgo}`}
            {typeof distanceKm === 'number' && ` • ${distanceKm.toFixed(1)} km`}
          </p>
        </Link>

        <div className="flex items-center gap-1.5 shrink-0">
          {!friendly && <PriorityBadge priority={caseItem.priority} />}
          <StatusBadge status={caseItem.status} compact friendly={friendly} />
        </div>
      </div>

      {caseItem.image_payload && (
        <img
          src={caseItem.image_payload}
          alt={`Photo submitted with the report for ${caseItem.species || 'this animal'}`}
          className="w-full h-auto max-h-[28rem] object-contain rounded-xl mb-3 rescue-image-fade bg-stone-100 dark:bg-stone-950"
          loading="lazy"
          onError={(event) => { event.currentTarget.hidden = true; }}
        />
      )}

      {caseItem.issue_description && (
        <p className="text-sm font-medium text-stone-600 dark:text-stone-300 line-clamp-2">
          {caseItem.issue_description}
        </p>
      )}

      {caseItem.manual_address && (
        <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
          <MapPin size={13} className="inline-block mr-1 align-[-2px]" aria-hidden="true" />{caseItem.manual_address}
        </p>
      )}

      {meta}

      {action && (
        <div className="mt-4 pt-4 border-t border-stone-200/60 dark:border-stone-700/40">
          {action}
        </div>
      )}
    </Surface>
  );
}

function formatRelativeTime(isoString) {
  const then = new Date(isoString).getTime();
  const now = Date.now();

  const diffMinutes = Math.floor((now - then) / (1000 * 60));

  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Date(isoString).toLocaleDateString();
}
