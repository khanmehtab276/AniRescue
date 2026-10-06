import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import API, { refreshCsrfToken } from '../utils/api';
import { useAuth } from './AuthContext.jsx';
import {
  createLocalReportId,
  deleteOfflineReport,
  listOfflineReports,
  saveOfflineReport,
  updateOfflineReport,
} from '../services/offlineReportStore.js';

const OfflineSyncContext = createContext(null);

function isNetworkFailure(error) {
  return !error?.response || error.code === 'ERR_NETWORK' || error.code === 'ECONNABORTED';
}

async function uploadImageToCloudinary(imageBlob) {
  const signatureResponse = await API.post('/cases/upload-signature');
  const {
    cloudName,
    apiKey,
    timestamp,
    signature,
    resourceType = 'image',
  } = signatureResponse.data || {};

  if (!cloudName || !apiKey || !timestamp || !signature) {
    throw new Error('Image upload authorization could not be created.');
  }

  const formData = new FormData();
  formData.append('file', imageBlob, imageBlob.name || 'rescue-photo.jpg');
  formData.append('api_key', apiKey);
  formData.append('timestamp', String(timestamp));
  formData.append('signature', signature);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
    {
      method: 'POST',
      body: formData,
    },
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error?.message || 'Cloudinary image upload failed.',
    );
  }

  if (!data.secure_url) {
    throw new Error('Cloudinary did not return an image URL.');
  }

  return data.secure_url;
}

export function OfflineSyncProvider({ children }) {
  const { user } = useAuth();
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : true,
  );
  const [pendingCases, setPendingCases] = useState([]);
  const [syncError, setSyncError] = useState('');
  const [authRequired, setAuthRequired] = useState(false);
  const isSyncingRef = useRef(false);

  const refreshQueue = useCallback(async () => {
    try {
      const reports = await listOfflineReports();
      setPendingCases(reports);
      return reports;
    } catch (error) {
      console.error('Failed to read offline rescue queue:', error);
      setSyncError('Could not read the rescue cases saved on this device.');
      return [];
    }
  }, []);

  const saveForOfflineSync = useCallback(async (reportData) => {
    const localId = reportData.localId || createLocalReportId();

    const record = await saveOfflineReport({
      ...reportData,
      localId,
      status: 'PENDING',
      retryCount: 0,
      lastError: null,
    });

    await refreshQueue();
    return record;
  }, [refreshQueue]);

  const syncCases = useCallback(async () => {
    if (isSyncingRef.current || !navigator.onLine || !user?.id) {
      return;
    }

    isSyncingRef.current = true;
    setSyncError('');
    setAuthRequired(false);

    try {
      const reports = await listOfflineReports();

      if (reports.length === 0) {
        setPendingCases([]);
        return;
      }

      /*
       * The CSRF token is intentionally not persisted in localStorage.
       * Re-create it only when a queued write actually needs to sync.
       * /auth/csrf validates the existing HttpOnly session cookie.
       */
      try {
        await refreshCsrfToken();
      } catch (error) {
        if (error.response?.status === 401 || error.response?.status === 403) {
          setAuthRequired(true);
          setSyncError('Sign in again to send the rescue cases saved on this device.');
        } else if (isNetworkFailure(error)) {
          setSyncError('Network is not ready yet. Your rescue cases remain safely stored.');
        } else {
          setSyncError('Could not prepare the secure rescue upload. Your cases remain stored.');
        }
        return;
      }

      for (const report of reports) {
        try {
          await updateOfflineReport(report.localId, {
            status: 'UPLOADING',
            lastError: null,
          });

          let imageUrl = report.imageUrl || null;

          if (!imageUrl) {
            if (!report.imageBlob) {
              throw new Error('The saved rescue photo is missing from device storage.');
            }

            imageUrl = await uploadImageToCloudinary(report.imageBlob);
          }

          const payload = {
            clientRequestId: report.clientRequestId || report.localId,
            location: report.location,
            description: report.description || '',
            imageUrl,
          };

          const response = await API.post('/cases/report', payload);

          await deleteOfflineReport(report.localId);
          setPendingCases((current) =>
            current.filter((item) => item.localId !== report.localId),
          );

          /*
           * Keep the last successful response in memory only. The actual
           * server case ID is shown by ReportCase when the user submits
           * online; queued reports are intentionally not duplicated.
           */
          void response;
        } catch (error) {
          const status = error.response?.status;

          if (status === 401 || status === 403) {
            await updateOfflineReport(report.localId, {
              status: 'PENDING',
              lastError: 'Authentication required.',
              retryCount: Number(report.retryCount || 0) + 1,
            });
            setAuthRequired(true);
            setSyncError('Sign in again to send the rescue cases saved on this device.');
            break;
          }

          await updateOfflineReport(report.localId, {
            status: 'PENDING',
            lastError:
              error.response?.data?.error ||
              error.message ||
              'Temporary upload failure.',
            retryCount: Number(report.retryCount || 0) + 1,
          });

          setSyncError(
            isNetworkFailure(error)
              ? 'Connection dropped. Your rescue case is still safely stored and will retry automatically.'
              : error.response?.data?.error ||
                  'The rescue case could not be sent yet. It remains safely stored and will retry.',
          );
          break;
        }
      }

      await refreshQueue();
    } finally {
      isSyncingRef.current = false;
    }
  }, [refreshQueue, user?.id]);

  useEffect(() => {
    let cancelled = false;

    refreshQueue().then(() => {
      if (!cancelled && navigator.onLine && user?.id) {
        window.setTimeout(() => {
          void syncCases();
        }, 500);
      }
    });

    const handleOnline = () => {
      setIsOffline(false);
      window.setTimeout(() => {
        void syncCases();
      }, 750);
    };

    const handleOffline = () => {
      setIsOffline(true);
      setSyncError('');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    /*
     * Browsers do not always fire a useful online event after a captive
     * portal / weak cellular connection recovers. A small foreground retry
     * interval makes the queue self-healing while the PWA is open.
     */
    const retryTimer = window.setInterval(() => {
      if (navigator.onLine) {
        void syncCases();
      }
    }, 30000);

    return () => {
      cancelled = true;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.clearInterval(retryTimer);
    };
  }, [refreshQueue, syncCases, user?.id]);

  return (
    <OfflineSyncContext.Provider
      value={{
        isOffline,
        pendingCases,
        syncError,
        authRequired,
        saveForOfflineSync,
        syncCases,
        refreshQueue,
      }}
    >
      {children}
    </OfflineSyncContext.Provider>
  );
}

export function useOfflineSync() {
  const context = useContext(OfflineSyncContext);

  if (!context) {
    throw new Error('useOfflineSync must be used inside OfflineSyncProvider.');
  }

  return context;
}
