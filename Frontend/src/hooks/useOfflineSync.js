import { useState, useEffect, useCallback, useRef } from 'react';

import API from '../utils/api';

export default function useOfflineSync() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [pendingCases, setPendingCases] = useState([]);

  // Prevent multiple sync operations from running at the same time
  const isSyncingRef = useRef(false);

  // Safely load the offline queue from localStorage
  const loadPendingCases = useCallback(() => {
    try {
      const stored = localStorage.getItem(
        'anirescue_offline_queue'
      );

      if (!stored) {
        setPendingCases([]);
        return;
      }

      const queue = JSON.parse(stored);

      if (Array.isArray(queue)) {
        setPendingCases(queue);
      } else {
        setPendingCases([]);
      }
    } catch (error) {
      console.error(
        'Failed to load offline queue:',
        error
      );

      setPendingCases([]);
    }
  }, []);

  /*
   * Sync offline reports with the backend.
   *
   * The queued report must contain the same data expected
   * by the current backend, especially:
   *
   * location
   * description
   * imageUrl
   */
  const syncCases = useCallback(async () => {
    // Do not start another sync while one is already running
    if (isSyncingRef.current) {
      return;
    }

    // There is nothing to sync while offline
    if (!navigator.onLine) {
      return;
    }

    let queue = [];

    try {
      const stored = localStorage.getItem(
        'anirescue_offline_queue'
      );

      if (!stored) {
        setPendingCases([]);
        return;
      }

      queue = JSON.parse(stored);

      if (!Array.isArray(queue) || queue.length === 0) {
        setPendingCases([]);
        return;
      }
    } catch (error) {
      console.error(
        'Failed to read offline queue:',
        error
      );

      return;
    }

    /*
     * The API interceptor normally attaches the JWT.
     * This check prevents unnecessary sync attempts when
     * there is no authenticated session.
     */
    const token =
      localStorage.getItem('token') ||
      localStorage.getItem('anirescue_token');

    if (!token) {
      console.warn(
        'Cannot sync offline cases: User is not logged in.'
      );

      return;
    }

    isSyncingRef.current = true;

    let remainingQueue = [...queue];

    try {
      for (const caseData of queue) {
        try {
          /*
           * Send the report through the same API utility
           * used by the rest of the application.
           *
           * API automatically adds:
           * Authorization: Bearer <JWT>
           */
          await API.post(
            '/cases/report',
            caseData
          );

          /*
           * Backend accepted the report.
           * Remove only this successfully synced case.
           */
          remainingQueue =
            remainingQueue.filter(
              (item) =>
                item.localId !== caseData.localId
            );

          // Keep UI synchronized after each successful upload
          setPendingCases([
            ...remainingQueue
          ]);

          localStorage.setItem(
            'anirescue_offline_queue',
            JSON.stringify(remainingQueue)
          );

        } catch (error) {
          const status =
            error.response?.status;

          /*
           * Authentication failure:
           * stop syncing because the current token
           * cannot be used.
           */
          if (
            status === 401 ||
            status === 403
          ) {
            console.error(
              'Authentication failed during offline sync.'
            );

            break;
          }

          /*
           * Network/server error:
           * stop here and keep this case plus all
           * remaining cases in the queue.
           *
           * They can be retried when connectivity
           * returns.
           */
          console.error(
            'Failed to sync offline case:',
            error
          );

          break;
        }
      }

      /*
       * Persist whatever remains in the queue.
       */
      localStorage.setItem(
        'anirescue_offline_queue',
        JSON.stringify(remainingQueue)
      );

      setPendingCases(
        remainingQueue
      );

    } catch (error) {
      console.error(
        'Offline synchronization failed:',
        error
      );

    } finally {
      isSyncingRef.current = false;
    }

  }, []);

  /*
   * Save a rescue report locally when it cannot
   * immediately reach the backend.
   */
  const saveForOfflineSync = useCallback(
    (reportData) => {
      try {
        const stored =
          localStorage.getItem(
            'anirescue_offline_queue'
          );

        let queue = [];

        if (stored) {
          try {
            const parsed =
              JSON.parse(stored);

            if (Array.isArray(parsed)) {
              queue = parsed;
            }
          } catch {
            console.warn(
              'Existing offline queue was invalid. Creating a new queue.'
            );
          }
        }

        /*
         * Create a unique local identifier.
         *
         * Date.now() alone can theoretically collide if
         * multiple reports are created within the same
         * millisecond, so combine it with randomness.
         */
        const localId =
          `${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 9)}`;

        const offlineCase = {
          ...reportData,
          localId
        };

        queue.push(offlineCase);

        localStorage.setItem(
          'anirescue_offline_queue',
          JSON.stringify(queue)
        );

        setPendingCases(queue);

        return offlineCase;

      } catch (error) {
        console.error(
          'Failed to save case for offline sync:',
          error
        );

        return null;
      }
    },
    []
  );

  /*
   * Monitor browser connectivity.
   */
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);

      /*
       * Give the browser a moment to restore the
       * network connection before attempting the sync.
       */
      setTimeout(() => {
        syncCases();
      }, 500);
    };

    const handleOffline = () => {
      setIsOffline(true);
    };

    window.addEventListener(
      'online',
      handleOnline
    );

    window.addEventListener(
      'offline',
      handleOffline
    );

    // Load previously saved reports when the hook starts
    loadPendingCases();

    /*
     * If the app starts while already online,
     * try to synchronize any previously queued cases.
     */
    if (navigator.onLine) {
      syncCases();
    }

    return () => {
      window.removeEventListener(
        'online',
        handleOnline
      );

      window.removeEventListener(
        'offline',
        handleOffline
      );
    };
  }, [
    loadPendingCases,
    syncCases
  ]);

  /*
   * Manually clear all locally queued reports.
   */
  const clearQueue = useCallback(() => {
    localStorage.removeItem(
      'anirescue_offline_queue'
    );

    setPendingCases([]);
  }, []);

  return {
    isOffline,
    pendingCases,
    saveForOfflineSync,
    syncCases,
    clearQueue
  };
}