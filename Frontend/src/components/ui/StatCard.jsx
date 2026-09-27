import Surface from './Surface.jsx';

const COLOR_CLASSES = {
  neutral: 'text-slate-800 dark:text-slate-100',
  info: 'text-blue-500',
  warning: 'text-amber-500',
  success: 'text-emerald-500',
  danger: 'text-rose-500',
};

export default function StatCard({ label, value, tone = 'neutral' }) {
  return (
    <Surface className="p-4 text-center">
      <p className={`text-2xl font-black ${COLOR_CLASSES[tone] || COLOR_CLASSES.neutral}`}>
        {value}
      </p>

      <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </p>
    </Surface>
  );
}
