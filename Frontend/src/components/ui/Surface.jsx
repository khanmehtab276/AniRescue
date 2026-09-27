/**
 * One shared "card surface" for the whole app.
 *
 * Redesigned away from the previous neumorphic embossed look (long
 * dual-direction shadow strings on every element) toward a flatter,
 * bordered surface with restrained elevation — used consistently by
 * every role's pages, never varied per role.
 *
 * `elevated` (default) — subtle border + soft shadow, for primary
 *   content (dashboard cards, case cards, forms).
 * `flat` — border only, no shadow, for dense/secondary areas.
 * `subtle` — a faint tinted panel with no border/shadow, for
 *   secondary or "inset" content (replaces the old inset-shadow look).
 */
export default function Surface({
  as: Component = 'div',
  variant = 'elevated',
  inset = false,
  className = '',
  children,
  ...rest
}) {
  const base = 'rounded-2xl transition-colors duration-200';

  const flat =
    'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800';

  const elevated =
    'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm shadow-slate-200/60 dark:shadow-black/20';

  const subtle =
    'bg-slate-100/70 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800/60';

  const variantClass =
    inset || variant === 'subtle' ? subtle : variant === 'flat' ? flat : elevated;

  return (
    <Component className={`${base} ${variantClass} ${className}`} {...rest}>
      {children}
    </Component>
  );
}
