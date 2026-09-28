import { Radio, PowerOff, Siren } from 'lucide-react';
import Surface from './ui/Surface.jsx';

/**
 * Availability control for volunteers.
 *
 * `onRescue` comes from the dashboard's own data (the volunteer has an
 * IN_PROGRESS case assigned to them) — the backend moves them to
 * ON_RESCUE automatically and blocks manual changes until they finish
 * or release the case.
 */
export default function AvailabilityToggle({
  status,
  isUpdating,
  error,
  onChange,
  onRescue,
}) {
  const isAvailable = status === 'AVAILABLE';
  const isOffline = status === 'OFFLINE';

  let summary = 'Choose whether dispatchers can send you cases.';
  if (onRescue) summary = 'You are on an active rescue.';
  else if (isAvailable) summary = 'Visible to dispatchers. Your location refreshes while this page is open.';
  else if (isOffline) summary = 'Hidden from dispatchers.';

  return (
    <Surface className="p-4 mb-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Your availability
          </p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {summary}
          </p>
        </div>

        {onRescue ? (
          <span className="inline-flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Siren size={14} strokeWidth={2.5} /> On rescue
          </span>
        ) : (
          <div
            role="group"
            aria-label="Availability"
            className="flex shrink-0 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800"
          >
            <button
              type="button"
              onClick={() => onChange('AVAILABLE')}
              disabled={isUpdating || isAvailable}
              aria-pressed={isAvailable}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors disabled:cursor-default ${
                isAvailable
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100'
              }`}
            >
              <Radio size={14} strokeWidth={2.5} /> Available
            </button>

            <button
              type="button"
              onClick={() => onChange('OFFLINE')}
              disabled={isUpdating || isOffline}
              aria-pressed={isOffline}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors disabled:cursor-default ${
                isOffline
                  ? 'bg-slate-700 dark:bg-slate-600 text-white'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100'
              }`}
            >
              <PowerOff size={14} strokeWidth={2.5} /> Offline
            </button>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-xs font-semibold text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </Surface>
  );
}
