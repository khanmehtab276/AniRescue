import Surface from './Surface.jsx';

export default function EmptyState({ icon = '🐕', title, message }) {
  return (
    <Surface inset className="p-10 text-center">
      <div className="text-4xl mb-3">{icon}</div>

      {title && (
        <p className="font-extrabold text-slate-700 dark:text-slate-200">
          {title}
        </p>
      )}

      {message && (
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
          {message}
        </p>
      )}
    </Surface>
  );
}
