import { getStatusConfig, getPriorityConfig, TONE_CLASSES } from '../../utils/statusConfig';
import { StatusIcon } from './statusIcons.jsx';

export function StatusBadge({ status, compact = false, friendly = false }) {
  const config = getStatusConfig(status);

  const text = friendly
    ? config.friendlyLabel || config.label
    : compact
      ? config.shortLabel
      : config.label;

  return (
    <span
      className={`inline-flex items-center gap-1 shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full ${TONE_CLASSES[config.tone]}`}
    >
      <StatusIcon name={config.iconName} size={12} strokeWidth={2.5} />
      {text}
    </span>
  );
}

export function PriorityBadge({ priority }) {
  if (!priority || priority === 'STANDARD') return null;

  const config = getPriorityConfig(priority);

  return (
    <span
      className={`inline-flex items-center shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full ${TONE_CLASSES[config.tone]}`}
    >
      {config.label}
    </span>
  );
}
