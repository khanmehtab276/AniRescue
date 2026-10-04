import Surface from './Surface.jsx';
import { PawPrint } from 'lucide-react';

export default function EmptyState({ icon = <PawPrint size={30} strokeWidth={2} />, title, message, children }) {
  return (
    <Surface inset className="p-10 text-center">
      <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">{icon}</div>

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

      {children && <div className="mt-5 flex justify-center">{children}</div>}
    </Surface>
  );
}
