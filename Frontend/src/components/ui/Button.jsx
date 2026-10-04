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
  info:
    'bg-blue-600 text-white shadow-sm hover:bg-blue-700 active:bg-blue-800',
  ai:
    'bg-violet-600 text-white shadow-sm hover:bg-violet-700 active:bg-violet-800',
  ghost:
    'bg-transparent text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800/50',
};

const SIZES = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-6 py-3.5 text-sm',
};

/**
 * Shared action button with consistent focus, motion and loading states.
 */
export default function Button({
  variant = 'primary',
  size = 'md',
  as: Component = 'button',
  className = '',
  disabled = false,
  loading = false,
  children,
  ...rest
}) {
  return (
    <Component
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`rescue-focus-ring inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:pointer-events-none ${VARIANTS[variant] || VARIANTS.primary} ${SIZES[size] || SIZES.md} ${className}`}
      {...rest}
    >
      {loading && (
        <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
      )}
      {children}
    </Component>
  );
}
