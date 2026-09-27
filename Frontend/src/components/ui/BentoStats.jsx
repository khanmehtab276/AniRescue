import Surface from './Surface.jsx';

const TONE_TEXT = {
  neutral: 'text-slate-900 dark:text-slate-100',
  info: 'text-blue-600 dark:text-blue-400',
  warning: 'text-amber-600 dark:text-amber-400',
  success: 'text-emerald-600 dark:text-emerald-400',
  danger: 'text-rose-600 dark:text-rose-400',
};

const TONE_ICON_BG = {
  neutral: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
  info: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
  warning: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
  success: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400',
  danger: 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400',
};

/**
 * A small Bento-style metrics grid: the first item renders large
 * (spans 2 columns) as the primary/most important number, the rest
 * render as compact supporting cards alongside it. Falls back to an
 * even grid if only 1-2 items are given.
 *
 * items: [{ label, value, tone, Icon }]
 */
export default function BentoStats({ items }) {
  if (!items || items.length === 0) return null;

  const [primary, ...rest] = items;

  return (
    <div className="grid grid-cols-2 gap-3">

      <Surface className="col-span-2 sm:col-span-1 p-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            {primary.label}
          </p>
          <p className={`mt-1 text-3xl font-extrabold ${TONE_TEXT[primary.tone] || TONE_TEXT.neutral}`}>
            {primary.value}
          </p>
        </div>

        {primary.Icon && (
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${TONE_ICON_BG[primary.tone] || TONE_ICON_BG.neutral}`}>
            <primary.Icon size={20} strokeWidth={2} />
          </div>
        )}
      </Surface>

      <div className="col-span-2 sm:col-span-1 grid grid-cols-2 gap-3">
        {rest.map((item) => (
          <Surface key={item.label} className="p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                {item.label}
              </p>
              {item.Icon && (
                <item.Icon size={14} className={TONE_TEXT[item.tone] || TONE_TEXT.neutral} strokeWidth={2.2} />
              )}
            </div>
            <p className={`mt-1 text-xl font-extrabold ${TONE_TEXT[item.tone] || TONE_TEXT.neutral}`}>
              {item.value}
            </p>
          </Surface>
        ))}
      </div>

    </div>
  );
}
