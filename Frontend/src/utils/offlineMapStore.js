import { getStorage, getDownloadURL, ref as storageRef } from "firebase/storage";
import { app } from "../services/firebase.js";

const DB_NAME = "anirescue_offline_maps";
const DB_VERSION = 1;
const META_STORE = "maps";
const CHUNK_STORE = "chunks";
const CHUNK_SIZE = 4 * 1024 * 1024;
const DOWNLOAD_RETRIES = 3;
const RETRY_DELAY_MS = 1200;

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

async function putMeta(meta) {
  const db = await openDb();

  try {
    const tx = db.transaction(META_STORE, "readwrite");
    tx.objectStore(META_STORE).put(meta);

    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function getMeta(mapId) {
  const db = await openDb();

  try {
    const tx = db.transaction(META_STORE, "readonly");
    return await requestToPromise(tx.objectStore(META_STORE).get(mapId));
  } finally {
    db.close();
  }
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
          return;
        }

        cursor.delete();
        cursor.continue();
      };

      request.onerror = () => reject(request.error);
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

function getFirebaseStoragePath(map) {
  if (map?.storagePath) return map.storagePath;
  if (map?.filename) return `offline-maps/${map.filename}`;
  return "";
}

export function canResolveOfflineMapUrl() {
  return Boolean(
    import.meta.env.VITE_OFFLINE_MAP_BASE_URL ||
      (app && import.meta.env.VITE_FIREBASE_STORAGE_BUCKET),
  );
}

export async function resolveOfflineMapUrl(map) {
  if (map?.url) return map.url;

  const customBase = String(
    import.meta.env.VITE_OFFLINE_MAP_BASE_URL || "",
  ).replace(/\\/+$/, "");

  if (customBase && map?.filename) {
    return `${customBase}/${map.filename}`;
  }

  const path = getFirebaseStoragePath(map);

  if (!path) {
    throw new Error("No offline map storage path is configured.");
  }

  if (!app) {
    throw new Error(
      "Firebase is not configured in this build. Set VITE_FIREBASE_STORAGE_BUCKET or VITE_OFFLINE_MAP_BASE_URL.",
    );
  }

  try {
    const storage = getStorage(app);
    return await getDownloadURL(storageRef(storage, path));
  } catch (error) {
    const code = error?.code || "";

    if (code === "storage/object-not-found") {
      throw new Error(
        `Offline map package is not uploaded yet: ${path}`,
      );
    }

    if (code === "storage/unauthorized" || code === "storage/unauthenticated") {
      throw new Error(
        "You must be signed in to download AniRescue offline maps.",
      );
    }

    throw new Error(
      error?.message || "Could not obtain the offline map download URL.",
    );
  }
}

function parseTotalBytes(response) {
  const contentRange = response.headers.get("content-range") || "";
  const rangeMatch = contentRange.match(/\\/([0-9]+)$/);

  if (rangeMatch) {
    return Number(rangeMatch[1]);
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  return contentLength > 0 ? contentLength : 0;
}

async function fetchWithRetry(url, options, label) {
  let lastError = null;

  for (let attempt = 1; attempt <= DOWNLOAD_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(
          `${label} failed (HTTP ${response.status}).`,
        );
      }

      return response;
    } catch (error) {
      lastError = error;

      if (attempt < DOWNLOAD_RETRIES) {
        await new Promise((resolve) =>
          setTimeout(resolve, RETRY_DELAY_MS * attempt),
        );
      }
    }
  }

  const message = lastError?.message || "Network request failed.";

  if (/failed to fetch|networkerror|network error/i.test(message)) {
    throw new Error(
      "Could not reach the offline map server. Check the Firebase Storage CORS configuration and your internet connection.",
    );
  }

  throw lastError || new Error("Offline map download failed.");
}

async function probeRemoteMap(url) {
  const response = await fetchWithRetry(
    url,
    {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      mode: "cors",
    },
    "Offline map connection test",
  );

  const totalBytes = parseTotalBytes(response);

  return {
    response,
    totalBytes,
    ranged: response.status === 206,
  };
}

function mergeMeta(map, totalBytes, existing) {
  const sameSource =
    existing &&
    existing.storagePath === getFirebaseStoragePath(map) &&
    Number(existing.sizeBytes || 0) === Number(totalBytes || 0) &&
    existing.chunkSize === CHUNK_SIZE;

  if (sameSource && existing.status === "downloading") {
    return existing;
  }

  return {
    id: map.id,
    name: map.name,
    description: map.description,
    provider: map.provider,
    attribution: map.attribution,
    storagePath: getFirebaseStoragePath(map),
    status: "downloading",
    sizeBytes: totalBytes || null,
    downloadedBytes: 0,
    chunkSize: CHUNK_SIZE,
    chunkCount: 0,
    updatedAt: Date.now(),
  };
}

async function streamFullResponse(response, meta, onProgress) {
  if (!response.body) {
    throw new Error(
      "This browser cannot stream the offline map download. Try an updated Chrome, Firefox, Safari, or installed PWA.",
    );
  }

  const reader = response.body.getReader();
  let buffer = new Uint8Array(0);
  let downloadedBytes = meta.downloadedBytes || 0;
  let chunkIndex = Math.floor(downloadedBytes / CHUNK_SIZE);

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const incoming =
      value instanceof Uint8Array ? value : new Uint8Array(value);
    const merged = new Uint8Array(buffer.length + incoming.length);
    merged.set(buffer);
    merged.set(incoming, buffer.length);
    buffer = merged;

    while (buffer.length >= CHUNK_SIZE) {
      const chunk = buffer.slice(0, CHUNK_SIZE);
      buffer = buffer.slice(CHUNK_SIZE);

      await putChunk(meta.id, chunkIndex, chunk);
      chunkIndex += 1;
      downloadedBytes += chunk.length;

      meta.downloadedBytes = downloadedBytes;
      meta.chunkCount = chunkIndex;
      meta.updatedAt = Date.now();
      await putMeta(meta);

      onProgress?.({
        downloadedBytes,
        totalBytes: meta.sizeBytes || 0,
        percent: meta.sizeBytes
          ? Math.min(100, Math.round((downloadedBytes / meta.sizeBytes) * 100))
          : null,
      });
    }
  }

  if (buffer.length > 0) {
    await putChunk(meta.id, chunkIndex, buffer);
    chunkIndex += 1;
    downloadedBytes += buffer.length;
  }

  return {
    downloadedBytes,
    chunkCount: chunkIndex,
  };
}

export async function downloadOfflineMap(map, onProgress) {
  if (!map?.id) {
    throw new Error("This offline map has no valid identifier.");
  }

  if (!navigator.onLine) {
    throw new Error("Connect to the internet before downloading an offline map.");
  }

  const url = await resolveOfflineMapUrl(map);
  const { response: probeResponse, totalBytes, ranged } =
    await probeRemoteMap(url);

  if (!totalBytes) {
    throw new Error(
      "The map server did not provide a usable file size. Configure Firebase Storage CORS and object metadata correctly.",
    );
  }

  const existing = await getMeta(map.id);

  if (existing?.status === "ready" && existing.sizeBytes === totalBytes) {
    return existing;
  }

  const estimate = await getOfflineStorageEstimate();
  const alreadyStored = existing?.status === "downloading"
    ? Number(existing.downloadedBytes || 0)
    : 0;
  const remainingBytes = Math.max(0, totalBytes - alreadyStored);
  const requiredWithHeadroom = Math.ceil(remainingBytes * 1.05);

  if (
    estimate.available > 0 &&
    requiredWithHeadroom > estimate.available
  ) {
    throw new Error(
      `Not enough browser storage for this map. About ${Math.ceil(requiredWithHeadroom / 1024 / 1024)} MB is still required, with only ${Math.floor(estimate.available / 1024 / 1024)} MB estimated available.`,
    );
  }

  const meta = mergeMeta(map, totalBytes, existing);
  await putMeta(meta);

  try {
    let downloadedBytes = meta.downloadedBytes || 0;
    let chunkCount = meta.chunkCount || 0;

    if (!ranged && downloadedBytes === 0) {
      const streamed = await streamFullResponse(
        probeResponse,
        meta,
        onProgress,
      );
      downloadedBytes = streamed.downloadedBytes;
      chunkCount = streamed.chunkCount;
    } else {
      // The first request proved that the storage endpoint supports byte
      // ranges. Download fixed-size ranges so mobile browsers do not need
      // to keep a multi-hundred-MB response in memory.
      const totalChunks = Math.ceil(totalBytes / CHUNK_SIZE);

      for (let index = chunkCount; index < totalChunks; index += 1) {
        const start = index * CHUNK_SIZE;
        const end = Math.min(totalBytes - 1, start + CHUNK_SIZE - 1);

        const response = await fetchWithRetry(
          url,
          {
            method: "GET",
            headers: { Range: `bytes=${start}-${end}` },
            mode: "cors",
          },
          `Offline map chunk ${index + 1}/${totalChunks}`,
        );

        if (response.status !== 206) {
          throw new Error(
            "The map server does not support HTTP range downloads. Use the provided Firebase Storage setup.",
          );
        }

        const bytes = new Uint8Array(await response.arrayBuffer());

        if (bytes.length !== end - start + 1) {
          throw new Error(
            `Offline map chunk ${index + 1} has an unexpected size.`,
          );
        }

        await putChunk(map.id, index, bytes);

        downloadedBytes = end + 1;
        chunkCount = index + 1;
        meta.downloadedBytes = downloadedBytes;
        meta.chunkCount = chunkCount;
        meta.updatedAt = Date.now();
        await putMeta(meta);

        onProgress?.({
          downloadedBytes,
          totalBytes,
          percent: Math.min(
            100,
            Math.round((downloadedBytes / totalBytes) * 100),
          ),
        });
      }
    }

    const finalMeta = {
      ...meta,
      status: "ready",
      sizeBytes: totalBytes,
      downloadedBytes,
      chunkCount,
      updatedAt: Date.now(),
    };

    await putMeta(finalMeta);

    onProgress?.({
      downloadedBytes: totalBytes,
      totalBytes,
      percent: 100,
    });

    return finalMeta;
  } catch (error) {
    // Keep completed chunks and the downloading metadata. A retry can resume
    // from the last successful chunk instead of starting the large download
    // again from zero.
    await putMeta({
      ...meta,
      status: "downloading",
      updatedAt: Date.now(),
    }).catch(() => {});

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

      const combined = new Uint8Array(
        parts.reduce((sum, part) => sum + part.length, 0),
      );
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
