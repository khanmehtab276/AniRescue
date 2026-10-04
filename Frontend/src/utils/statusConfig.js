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
    friendlyLabel: 'Report Received',
    friendlyDetail: 'We got your report and it\u2019s next in line for a quick AI check.',
    iconName: 'bot',
    tone: 'info',
  },
  PROCESSING_ANALYSIS: {
    label: 'Analyzing Image',
    shortLabel: 'Analyzing',
    friendlyLabel: 'AI Checking',
    friendlyDetail: 'Confirming the photo shows an animal that needs help.',
    iconName: 'search',
    tone: 'info',
  },
  VALIDATION_PASSED: {
    label: 'Verified — Awaiting Volunteer',
    shortLabel: 'Verified',
    friendlyLabel: 'Report Verified',
    friendlyDetail: 'Confirmed. We\u2019re now looking for a rescuer nearby.',
    iconName: 'check-circle',
    tone: 'success',
  },
  REJECTED_JUNK: {
    label: 'Not Verified',
    shortLabel: 'Rejected',
    friendlyLabel: 'Could Not Be Verified',
    friendlyDetail: 'A team member is taking a closer look at this one.',
    iconName: 'ban',
    tone: 'danger',
  },
  IN_PROGRESS: {
    label: 'Rescue In Progress',
    shortLabel: 'In Progress',
    friendlyLabel: 'Rescuer Assigned',
    friendlyDetail: 'A volunteer has taken this case and is on it.',
    iconName: 'siren',
    tone: 'warning',
  },
  RESCUE_COMPLETED: {
    label: 'Awaiting Verification',
    shortLabel: 'Awaiting Review',
    friendlyLabel: 'Rescue Completed',
    friendlyDetail: 'The rescue happened — a final check is confirming everything.',
    iconName: 'clipboard-check',
    tone: 'info',
  },
  RESOLVED: {
    label: 'Resolved',
    shortLabel: 'Resolved',
    friendlyLabel: 'Verified & Resolved',
    friendlyDetail: 'This case is closed. Thank you for speaking up for them.',
    iconName: 'party-popper',
    tone: 'success',
  },
  CANCELLED: {
    label: 'Cancelled',
    shortLabel: 'Cancelled',
    friendlyLabel: 'Cancelled',
    friendlyDetail: 'This report was closed without a rescue.',
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
  neutral: 'bg-stone-500/10 text-stone-600 dark:text-stone-400',
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
