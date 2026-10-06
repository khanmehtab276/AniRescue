const DB_NAME = 'anirescue_offline_v2';
const DB_VERSION = 1;
const STORE_NAME = 'reports';

function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB is not available in this browser.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const objectStore = db.createObjectStore(STORE_NAME, {
          keyPath: 'localId',
        });
        objectStore.createIndex('createdAt', 'createdAt', { unique: false });
        objectStore.createIndex('status', 'status', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error('Could not open offline storage.'));
  });
}

function withStore(mode, operation) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, mode);
        const store = transaction.objectStore(STORE_NAME);
        let result;

        try {
          result = operation(store);
        } catch (error) {
          db.close();
          reject(error);
          return;
        }

        transaction.oncomplete = () => {
          db.close();
          resolve(result);
        };
        transaction.onerror = () => {
          const error =
            transaction.error ||
            new Error('Offline storage transaction failed.');
          db.close();
          reject(error);
        };
        transaction.onabort = () => {
          const error =
            transaction.error ||
            new Error('Offline storage transaction was aborted.');
          db.close();
          reject(error);
        };
      }),
  );
}

export function createLocalReportId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function saveOfflineReport(report) {
  const record = {
    ...report,
    status: report.status || 'PENDING',
    retryCount: Number(report.retryCount || 0),
    createdAt: report.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await withStore('readwrite', (store) => store.put(record));
  return record;
}

export async function migrateLegacyOfflineQueue() {
  const legacyKey = 'anirescue_offline_queue';

  let legacyQueue = null;

  try {
    const raw = localStorage.getItem(legacyKey);
    if (!raw) return 0;

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      localStorage.removeItem(legacyKey);
      return 0;
    }

    legacyQueue = parsed;
  } catch (error) {
    console.warn('Could not read the legacy offline rescue queue:', error);
    return 0;
  }

  let migrated = 0;

  for (const item of legacyQueue) {
    if (!item?.localId) continue;

    try {
      await saveOfflineReport({
        ...item,
        status: 'PENDING',
        lastError: null,
      });
      migrated += 1;
    } catch (error) {
      console.error('Could not migrate a legacy offline rescue case:', error);
    }
  }

  if (migrated === legacyQueue.length) {
    localStorage.removeItem(legacyKey);
  }

  return migrated;
}

export async function listOfflineReports() {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).getAll();

    request.onsuccess = () => {
      db.close();
      const reports = Array.isArray(request.result) ? request.result : [];
      reports.sort((a, b) =>
        String(a.createdAt).localeCompare(String(b.createdAt))
      );
      resolve(reports);
    };

    request.onerror = () => {
      db.close();
      reject(request.error || new Error('Could not read offline reports.'));
    };
  });
}

export async function updateOfflineReport(localId, patch) {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(localId);

    request.onsuccess = () => {
      if (!request.result) {
        transaction.abort();
        reject(new Error('Offline report no longer exists.'));
        return;
      }

      store.put({
        ...request.result,
        ...patch,
        updatedAt: new Date().toISOString(),
      });
    };

    request.onerror = () => {
      transaction.abort();
      reject(request.error || new Error('Could not update offline report.'));
    };

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };

    transaction.onerror = () => {
      db.close();
      reject(transaction.error || new Error('Could not update offline report.'));
    };
  });
}

export async function deleteOfflineReport(localId) {
  await withStore('readwrite', (store) => store.delete(localId));
}

export async function clearOfflineReports() {
  await withStore('readwrite', (store) => store.clear());
}
