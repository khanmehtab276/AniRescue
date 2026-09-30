import { useEffect } from 'react';

export default function Toast({ message, type = 'info', onClose }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 4000);

    return () => clearTimeout(timer);
  }, [onClose]);

  const styles = {
    success: {
      icon: '✅',
      title: 'Success',
    },
    error: {
      icon: '❌',
      title: 'Error',
    },
    warning: {
      icon: '⚠️',
      title: 'Warning',
    },
    info: {
      icon: 'ℹ️',
      title: 'Info',
    },
  };

  const current = styles[type] || styles.info;

  return (
    <div className="fixed top-5 right-5 z-[9999] w-[calc(100%-2rem)] max-w-sm animate-fade-in">
      <div className="flex items-start gap-3 p-4 rounded-2xl bg-white dark:bg-stone-900 shadow-[0_10px_30px_rgba(0,0,0,0.2)] border border-stone-200 dark:border-stone-700">

        <div className="text-xl">
          {current.icon}
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
          className="text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 text-lg"
          aria-label="Close notification"
        >
          ×
        </button>

      </div>
    </div>
  );
}