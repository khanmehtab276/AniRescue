import { STATUS_ICONS } from './statusIconMap.js';

export function StatusIcon({ name, ...props }) {
  const Icon = STATUS_ICONS[name] || STATUS_ICONS['help-circle'];
  return <Icon {...props} />;
}
