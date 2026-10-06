const DB_NAME = "anirescue_offline_maps";
const DB_VERSION = 1;
const META_STORE = "maps";
const CHUNK_STORE = "chunks";
const CHUNK_SIZE = 1024 * 1024;

function openDb() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB is not available in this browser."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(CHUNK_STORE)) {
        const chunks = db.createObjectStore(CHUNK_STORE, {
          keyPath: ["mapId", "index"],
        });
        chunks.createIndex("mapId", "mapId", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error("Could not open offline map storage."));
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putChunk(mapId, index, bytes) {
  const db = await openDb();

  try {
    const tx = db.transaction(CHUNK_STORE, "readwrite");
    tx.objectStore(CHUNK_STORE).put({
      mapId,
      index,
      bytes,
    });

    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function getChunk(mapId, index) {
  const db = await openDb();

  try {
    const tx = db.transaction(CHUNK_STORE, "readonly");
    const request = tx.objectStore(CHUNK_STORE).get([mapId, index]);
    return (await requestToPromise(request))?.bytes || null;
  } finally {
    db.close();
  }
}

async function deleteMap(mapId) {
  const db = await openDb();

  try {
    const tx = db.transaction([META_STORE, CHUNK_STORE], "readwrite");
    tx.objectStore(META_STORE).delete(mapId);

    const index = tx.objectStore(CHUNK_STORE).index("mapId");
    const request = index.openCursor(IDBKeyRange.only(mapId));

    await new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const cursor = request.result;

        if (!cursor) {
          resolve();
          return;
        }

        cursor.delete();
        cursor.continue();
      };

      request.onerror = () => reject(request.error);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });

    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function listMaps() {
  const db = await openDb();

  try {
    const tx = db.transaction(META_STORE, "readonly");
    const request = tx.objectStore(META_STORE).getAll();
    return await requestToPromise(request);
  } finally {
    db.close();
  }
}

export async function getOfflineStorageEstimate() {
  if (!navigator.storage?.estimate) {
    return { usage: 0, quota: 0, available: 0 };
  }

  const estimate = await navigator.storage.estimate();
  const usage = Number(estimate.usage || 0);
  const quota = Number(estimate.quota || 0);

  return {
    usage,
    quota,
    available: Math.max(0, quota - usage),
  };
}

export async function requestPersistentOfflineStorage() {
  if (!navigator.storage?.persist) return false;

  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function getDownloadedMaps() {
  return listMaps();
}

export async function removeDownloadedMap(mapId) {
  await deleteMap(mapId);
}

export async function downloadOfflineMap(map, onProgress) {
  if (!map?.id || !map?.url) {
    throw new Error("This offline map is not configured for download yet.");
  }

  if (!navigator.onLine) {
    throw new Error("Connect to the internet before downloading an offline map.");
  }

  const response = await fetch(map.url, {
    method: "GET",
    mode: "cors",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Offline map download failed (HTTP ${response.status}).`);
  }

  const contentLength = Number(response.headers.get("content-length") || 0);

  if (contentLength > 0) {
    const estimate = await getOfflineStorageEstimate();
    const requiredWithHeadroom = Math.ceil(contentLength * 1.05);

    if (
      estimate.available > 0 &&
      requiredWithHeadroom > estimate.available
    ) {
      throw new Error(
        `Not enough browser storage for this map. Required about ${Math.ceil(requiredWithHeadroom / 1024 / 1024)} MB, with only ${Math.floor(estimate.available / 1024 / 1024)} MB estimated available.`,
      );
    }
  }

  if (!response.body) {
    throw new Error("This browser cannot stream the offline map download.");
  }

  const db = await openDb();

  try {
    const metaStore = db.transaction(META_STORE, "readwrite").objectStore(META_STORE);
    metaStore.put({
      id: map.id,
      name: map.name,
      status: "downloading",
      sizeBytes: contentLength || null,
      downloadedBytes: 0,
      chunkSize: CHUNK_SIZE,
      updatedAt: Date.now(),
    });
  } finally {
    db.close();
  }

  const reader = response.body.getReader();
  let buffer = new Uint8Array(0);
  let downloadedBytes = 0;
  let chunkIndex = 0;

  const flushChunk = async (bytes) => {
    await putChunk(map.id, chunkIndex, bytes);
    chunkIndex += 1;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      const incoming = value instanceof Uint8Array
        ? value
        : new Uint8Array(value);

      const merged = new Uint8Array(buffer.length + incoming.length);
      merged.set(buffer);
      merged.set(incoming, buffer.length);
      buffer = merged;

      while (buffer.length >= CHUNK_SIZE) {
        const chunk = buffer.slice(0, CHUNK_SIZE);
        buffer = buffer.slice(CHUNK_SIZE);

        await flushChunk(chunk);

        downloadedBytes += chunk.length;
        onProgress?.({
          downloadedBytes,
          totalBytes: contentLength,
          percent: contentLength
            ? Math.min(100, Math.round((downloadedBytes / contentLength) * 100))
            : null,
        });
      }
    }

    if (buffer.length > 0) {
      await flushChunk(buffer);
      downloadedBytes += buffer.length;
    }

    const finalMeta = {
      id: map.id,
      name: map.name,
      description: map.description,
      provider: map.provider,
      attribution: map.attribution,
      status: "ready",
      sizeBytes: downloadedBytes,
      downloadedBytes,
      chunkSize: CHUNK_SIZE,
      chunkCount: chunkIndex,
      updatedAt: Date.now(),
    };

    const finalDb = await openDb();

    try {
      const tx = finalDb.transaction(META_STORE, "readwrite");
      tx.objectStore(META_STORE).put(finalMeta);

      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      finalDb.close();
    }

    onProgress?.({
      downloadedBytes,
      totalBytes: downloadedBytes,
      percent: 100,
    });

    return finalMeta;
  } catch (error) {
    await deleteMap(map.id).catch(() => {});
    throw error;
  }
}

export async function createOfflineMapSource(mapId, PMTilesClass) {
  const maps = await listMaps();
  const meta = maps.find((item) => item.id === mapId);

  if (!meta || meta.status !== "ready") {
    throw new Error("This offline map has not been downloaded.");
  }

  class IndexedDbSource {
    getKey() {
      return `anirescue-offline://${meta.id}`;
    }

    async getBytes(offset, length) {
      if (length <= 0) {
        return { data: new ArrayBuffer(0) };
      }

      const startChunk = Math.floor(offset / meta.chunkSize);
      const endChunk = Math.floor((offset + length - 1) / meta.chunkSize);
      const parts = [];

      for (let index = startChunk; index <= endChunk; index += 1) {
        const bytes = await getChunk(meta.id, index);

        if (!bytes) {
          throw new Error(`Offline map chunk ${index} is missing.`);
        }

        parts.push(new Uint8Array(bytes));
      }

      const combined = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
      let cursor = 0;

      for (const part of parts) {
        combined.set(part, cursor);
        cursor += part.length;
      }

      const startOffset = offset - startChunk * meta.chunkSize;
      const sliced = combined.slice(startOffset, startOffset + length);

      return { data: sliced.buffer };
    }
  }

  return {
    meta,
    pmtiles: new PMTilesClass(new IndexedDbSource()),
  };
}
