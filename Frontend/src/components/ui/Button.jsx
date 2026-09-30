const VARIANTS = {
  primary:
    'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 active:bg-emerald-800',
  urgent:
    'bg-amber-500 text-white shadow-sm hover:bg-amber-600 active:bg-amber-700',
  dark:
    'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 hover:bg-stone-800 dark:hover:bg-white shadow-sm',
  secondary:
    'bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-200 border border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800',
  outline:
    'bg-transparent border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800/50',
  danger:
    'bg-rose-600 text-white shadow-sm hover:bg-rose-700 active:bg-rose-800',
  ghost:
    'bg-transparent text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800/50',
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
