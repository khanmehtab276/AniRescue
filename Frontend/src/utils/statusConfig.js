/**
 * One shared definition of every case status and priority, used by
 * every dashboard/case component. Previously each dashboard defined
 * its own copy of this — this file is the single source of truth so
 * a status looks and reads the same everywhere in the app.
 */

export const STATUS_ORDER = [
  'PENDING_VALIDATION',
  'PROCESSING_ANALYSIS',
  'VALIDATION_PASSED',
  'IN_PROGRESS',
  'RESCUE_COMPLETED',
  'RESOLVED',
];

export const STATUS_CONFIG = {
  PENDING_VALIDATION: {
    label: 'Pending AI Review',
    shortLabel: 'Pending',
    iconName: 'bot',
    tone: 'info',
  },
  PROCESSING_ANALYSIS: {
    label: 'Analyzing Image',
    shortLabel: 'Analyzing',
    iconName: 'search',
    tone: 'info',
  },
  VALIDATION_PASSED: {
    label: 'Verified — Awaiting Volunteer',
    shortLabel: 'Verified',
    iconName: 'check-circle',
    tone: 'success',
  },
  REJECTED_JUNK: {
    label: 'Not Verified',
    shortLabel: 'Rejected',
    iconName: 'ban',
    tone: 'danger',
  },
  IN_PROGRESS: {
    label: 'Rescue In Progress',
    shortLabel: 'In Progress',
    iconName: 'siren',
    tone: 'warning',
  },
  RESCUE_COMPLETED: {
    label: 'Awaiting Verification',
    shortLabel: 'Awaiting Review',
    iconName: 'clipboard-check',
    tone: 'info',
  },
  RESOLVED: {
    label: 'Resolved',
    shortLabel: 'Resolved',
    iconName: 'party-popper',
    tone: 'success',
  },
  CANCELLED: {
    label: 'Cancelled',
    shortLabel: 'Cancelled',
    iconName: 'x-circle',
    tone: 'neutral',
  },
};

export const PRIORITY_CONFIG = {
  LOW: { label: 'Low', tone: 'neutral' },
  STANDARD: { label: 'Standard', tone: 'info' },
  HIGH: { label: 'High', tone: 'warning' },
  CRITICAL: { label: 'Critical', tone: 'danger' },
};

/**
 * Tailwind classes per semantic tone. This is the ONLY place color
 * decisions for status/priority live — every role uses the same
 * mapping, so "verified" looks identical on every dashboard.
 */
export const TONE_CLASSES = {
  info: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  danger: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  neutral: 'bg-gray-500/10 text-gray-600 dark:text-gray-400',
};

export function getStatusConfig(status) {
  return (
    STATUS_CONFIG[status] || {
      label: status || 'Unknown',
      shortLabel: status || 'Unknown',
      iconName: 'help-circle',
      tone: 'neutral',
    }
  );
}

export function getPriorityConfig(priority) {
  return PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.STANDARD;
}
