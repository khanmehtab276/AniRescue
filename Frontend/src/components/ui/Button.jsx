const VARIANTS = {
  primary:
    'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 active:bg-emerald-800',
  urgent:
    'bg-amber-500 text-white shadow-sm hover:bg-amber-600 active:bg-amber-700',
  dark:
    'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white shadow-sm',
  secondary:
    'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800',
  outline:
    'bg-transparent border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/50',
  danger:
    'bg-rose-600 text-white shadow-sm hover:bg-rose-700 active:bg-rose-800',
  ghost:
    'bg-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/50',
};

const SIZES = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-6 py-3.5 text-sm',
};

/**
 * One shared Button used by every role's pages. Indigo is the ONLY
 * brand color for primary actions everywhere — no role-specific hues.
 * Rose ("danger") is reserved for destructive actions and the
 * emergency Report CTA specifically, as a semantic urgency signal,
 * not a role theme.
 */
export default function Button({
  variant = 'primary',
  size = 'md',
  as: Component = 'button',
  className = '',
  disabled = false,
  children,
  ...rest
}) {
  return (
    <Component
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none ${VARIANTS[variant] || VARIANTS.primary} ${SIZES[size] || SIZES.md} ${className}`}
      {...rest}
    >
      {children}
    </Component>
  );
}
