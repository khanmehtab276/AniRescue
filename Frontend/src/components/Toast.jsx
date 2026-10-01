import { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';

export default function Toast({ message, type = 'info', onClose }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 4000);

    return () => clearTimeout(timer);
  }, [onClose]);

  const styles = {
    success: {
      icon: CheckCircle2,
      title: 'Success',
    },
    error: {
      icon: XCircle,
      title: 'Error',
    },
    warning: {
      icon: AlertTriangle,
      title: 'Warning',
    },
    info: {
      icon: Info,
      title: 'Info',
    },
  };

  const current = styles[type] || styles.info;

  return (
    <div className="fixed left-1/2 top-4 z-[9999] w-[calc(100%-1rem)] max-w-sm -translate-x-1/2 animate-fade-in sm:left-auto sm:right-5 sm:translate-x-0" role="status" aria-live="polite">
      <div className="flex items-start gap-3 p-4 rounded-2xl bg-white dark:bg-stone-900 shadow-[0_10px_30px_rgba(0,0,0,0.2)] border border-stone-200 dark:border-stone-700">

        <div className="mt-0.5 text-emerald-600 dark:text-emerald-400">
          <current.icon size={19} aria-hidden="true" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm text-stone-800 dark:text-stone-100">
            {current.title}
          </p>

          <p className="text-sm text-stone-600 dark:text-stone-300 mt-1 break-words">
            {message}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="rescue-focus-ring rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200"
          aria-label="Close notification"
        >
          ×
        </button>

      </div>
    </div>
  );
}