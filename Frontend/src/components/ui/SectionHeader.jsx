export default function SectionHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <h2 className="text-lg font-extrabold text-stone-800 dark:text-stone-100">
          {title}
        </h2>

        {subtitle && (
          <p className="text-sm text-stone-500 dark:text-stone-400">{subtitle}</p>
        )}
      </div>

      {action}
    </div>
  );
}
