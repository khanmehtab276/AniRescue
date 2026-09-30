import Surface from './Surface.jsx';

export default function EmptyState({ icon = '🐕', title, message }) {
  return (
    <Surface inset className="p-10 text-center">
      <div className="text-4xl mb-3">{icon}</div>

      {title && (
        <p className="font-extrabold text-stone-700 dark:text-stone-200">
          {title}
        </p>
      )}

      {message && (
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400 max-w-xs mx-auto">
          {message}
        </p>
      )}
    </Surface>
  );
}
