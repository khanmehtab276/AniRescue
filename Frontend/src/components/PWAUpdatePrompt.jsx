import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

export default function PWAUpdatePrompt() {
  const [updateSW, setUpdateSW] = useState(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    const update = registerSW({
      onNeedRefresh() {
        setUpdateAvailable(true);
      },
      onOfflineReady() {
        console.log('AniRescue is ready to work offline.');
      },
    });

    setUpdateSW(() => update);
  }, []);

  if (!updateAvailable) {
    return null;
  }

  return (
    <div className="fixed bottom-5 left-1/2 z-[9999] w-[calc(100%-2rem)] max-w-md -translate-x-1/2">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.2)] dark:border-gray-700 dark:bg-[#0f172a]">
        <div className="flex items-start gap-3">
          <div className="text-xl">🔄</div>

          <div className="flex-1">
            <p className="font-bold text-sm text-gray-800 dark:text-gray-100">
              New update available
            </p>

            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              Refresh AniRescue to get the latest version.
            </p>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => updateSW?.(true)}
                className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
              >
                Update
              </button>

              <button
                type="button"
                onClick={() => setUpdateAvailable(false)}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Later
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}