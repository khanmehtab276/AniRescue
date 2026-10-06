import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, HardDrive, MapPinned, Trash2 } from "lucide-react";
import {
  createOfflineMapSource,
  downloadOfflineMap,
  getDownloadedMaps,
  getOfflineStorageEstimate,
  removeDownloadedMap,
  requestPersistentOfflineStorage,
} from "../utils/offlineMapStore.js";

const MAPLIBRE_URL =
  "https://unpkg.com/maplibre-gl@6.12.0/dist/maplibre-gl.mjs";
const MAPLIBRE_CSS_URL =
  "https://unpkg.com/maplibre-gl@6.12.0/dist/maplibre-gl.css";
const PMTILES_URL =
  "https://cdn.jsdelivr.net/npm/pmtiles@4.5.0/+esm";

const MAP_BASE_URL = String(
  import.meta.env.VITE_OFFLINE_MAP_BASE_URL || "",
).replace(/\/+$/, "");

const ZONES = [
  {
    id: "western-india",
    name: "Western India",
    filename: "western-india.pmtiles",
    description: "Large offline basemap for western-region field operations.",
  },
  {
    id: "central-india",
    name: "Central India",
    filename: "central-india.pmtiles",
    description: "Large offline basemap for central-region field operations.",
  },
  {
    id: "northern-india",
    name: "Northern India",
    filename: "northern-india.pmtiles",
    description: "Large offline basemap for northern-region field operations.",
  },
  {
    id: "eastern-india",
    name: "Eastern India",
    filename: "eastern-india.pmtiles",
    description: "Large offline basemap for eastern-region field operations.",
  },
  {
    id: "southern-india",
    name: "Southern India",
    filename: "southern-india.pmtiles",
    description: "Large offline basemap for southern-region field operations.",
  },
  {
    id: "north-eastern-india",
    name: "North-Eastern India",
    filename: "north-eastern-india.pmtiles",
    description: "Large offline basemap for north-eastern field operations.",
  },
].map((zone) => ({
  ...zone,
  url: MAP_BASE_URL ? `${MAP_BASE_URL}/${zone.filename}` : "",
  provider: "OpenStreetMap-derived vector map",
  attribution: "© OpenStreetMap contributors",
}));

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "Size not measured yet";

  const units = ["B", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[unit]}`;
}

async function loadMapLibraries() {
  const cssAlreadyLoaded = document.querySelector(
    `link[data-anirescue-maplibre="true"]`,
  );

  if (!cssAlreadyLoaded) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = MAPLIBRE_CSS_URL;
    link.dataset.anirescueMaplibre = "true";
    document.head.appendChild(link);
  }

  const [maplibre, pmtiles] = await Promise.all([
    import(/* @vite-ignore */ MAPLIBRE_URL),
    import(/* @vite-ignore */ PMTILES_URL),
  ]);

  return {
    maplibre,
    pmtiles,
  };
}

function buildStyle(pmtilesUrl, attribution) {
  return {
    version: 8,
    sources: {
      anirescue: {
        type: "vector",
        url: `pmtiles://${pmtilesUrl}`,
        attribution,
      },
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": "#f5f5f4" },
      },
      {
        id: "water",
        type: "fill",
        source: "anirescue",
        "source-layer": "water",
        paint: { "fill-color": "#bfdbfe" },
      },
      {
        id: "landuse",
        type: "fill",
        source: "anirescue",
        "source-layer": "landuse",
        paint: { "fill-color": "#ecfccb", "fill-opacity": 0.45 },
      },
      {
        id: "buildings",
        type: "fill",
        source: "anirescue",
        "source-layer": "buildings",
        paint: { "fill-color": "#e7e5e4", "fill-opacity": 0.75 },
      },
      {
        id: "roads",
        type: "line",
        source: "anirescue",
        "source-layer": "roads",
        paint: {
          "line-color": "#a8a29e",
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            8, 0.4,
            12, 1,
            16, 2.2,
          ],
        },
      },
    ],
  };
}

export default function OfflineMaps() {
  const [downloaded, setDownloaded] = useState([]);
  const [storage, setStorage] = useState({
    usage: 0,
    quota: 0,
    available: 0,
  });
  const [progress, setProgress] = useState({});
  const [error, setError] = useState("");
  const [mapError, setMapError] = useState("");
  const [selectedMap, setSelectedMap] = useState(null);
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);

  const refresh = async () => {
    try {
      setDownloaded(await getDownloadedMaps());
      setStorage(await getOfflineStorageEstimate());
    } catch (loadError) {
      setError(loadError?.message || "Could not load offline map storage.");
    }
  };

  useEffect(() => {
    void refresh();
    // Load the renderer while online so the PWA service worker can cache the
    // exact MapLibre/PMTiles runtime before the user later goes offline.
    loadMapLibraries().catch((libraryError) => {
      console.warn(
        "Offline map renderer could not be warmed yet:",
        libraryError?.message || libraryError,
      );
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    const renderSelectedMap = async () => {
      if (!selectedMap || !mapContainerRef.current) return;

      try {
        setMapError("");

        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }

        const { maplibre, pmtiles } = await loadMapLibraries();
        if (cancelled) return;

        const protocol = new pmtiles.Protocol();
        maplibre.addProtocol("pmtiles", protocol.tile);

        const { meta, pmtiles: archive } =
          await createOfflineMapSource(selectedMap.id, pmtiles.PMTiles);

        protocol.add(archive);

        const header = await archive.getHeader();
        if (cancelled) return;

        const map = new maplibre.Map({
          container: mapContainerRef.current,
          center: [header.centerLon || 78.9629, header.centerLat || 22.5937],
          zoom: Math.max(2, Math.min(header.centerZoom || 5, 12)),
          style: buildStyle(
            `anirescue-offline://${selectedMap.id}`,
            meta.attribution || "© OpenStreetMap contributors",
          ),
          attributionControl: true,
        });

        mapRef.current = map;
      } catch (renderError) {
        if (!cancelled) {
          setMapError(
            renderError?.message ||
              "Could not open this offline map package.",
          );
        }
      }
    };

    void renderSelectedMap();

    return () => {
      cancelled = true;

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [selectedMap]);

  const handleDownload = async (zone) => {
    setError("");
    setProgress((current) => ({
      ...current,
      [zone.id]: { downloadedBytes: 0, totalBytes: 0, percent: 0 },
    }));

    try {
      await requestPersistentOfflineStorage();

      await downloadOfflineMap(zone, (next) => {
        setProgress((current) => ({
          ...current,
          [zone.id]: next,
        }));
      });

      await refresh();
    } catch (downloadError) {
      setError(downloadError?.message || "Offline map download failed.");
    } finally {
      setProgress((current) => {
        const next = { ...current };
        delete next[zone.id];
        return next;
      });
    }
  };

  const handleDelete = async (zoneId) => {
    try {
      if (selectedMap?.id === zoneId) {
        setSelectedMap(null);
      }

      await removeDownloadedMap(zoneId);
      await refresh();
    } catch (deleteError) {
      setError(deleteError?.message || "Could not remove the offline map.");
    }
  };

  const storageLabel = storage.quota
    ? `${formatBytes(storage.usage)} used of ${formatBytes(storage.quota)} estimated`
    : "Browser storage estimate unavailable";

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 md:px-8">
      <header className="mb-6">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
            <MapPinned size={23} />
          </div>
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-400">
              Offline maps
            </p>
            <h1 className="text-2xl font-black text-stone-900 dark:text-stone-50">
              Download large rescue areas
            </h1>
          </div>
        </div>

        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
          <HardDrive size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-bold">{storageLabel}</p>
            <p className="mt-1 text-xs leading-5">
              Large maps are stored in IndexedDB in chunks. The browser's
              storage quota is dynamic, so AniRescue checks it before and
              during downloads.
            </p>
          </div>
        </div>
      </header>

      {error && (
        <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-300">
          {error}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2">
        {ZONES.map((zone) => {
          const saved = downloaded.find((item) => item.id === zone.id);
          const currentProgress = progress[zone.id];
          const configured = Boolean(zone.url);

          return (
            <article
              key={zone.id}
              className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-black text-stone-900 dark:text-stone-100">
                    {zone.name}
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">
                    {zone.description}
                  </p>
                </div>

                {saved?.status === "ready" && (
                  <CheckCircle2
                    size={20}
                    className="shrink-0 text-emerald-600 dark:text-emerald-400"
                  />
                )}
              </div>

              <div className="mt-4 text-xs font-bold text-stone-500 dark:text-stone-400">
                {saved?.status === "ready"
                  ? `${formatBytes(saved.sizeBytes)} stored offline`
                  : configured
                    ? "Package available for download"
                    : "Package URL not configured yet"}
              </div>

              {currentProgress && (
                <div className="mt-4">
                  <div className="mb-1 flex justify-between text-[11px] font-bold text-stone-500">
                    <span>Downloading…</span>
                    <span>
                      {currentProgress.percent == null
                        ? formatBytes(currentProgress.downloadedBytes)
                        : `${currentProgress.percent}%`}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
                    <div
                      className="h-full rounded-full bg-emerald-600 transition-all"
                      style={{
                        width: `${currentProgress.percent || 0}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              <div className="mt-5 flex flex-wrap gap-2">
                {saved?.status === "ready" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setSelectedMap(zone)}
                      className="rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-black text-white transition-all hover:bg-emerald-800 active:scale-95"
                    >
                      Open offline map
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(zone.id)}
                      className="inline-flex items-center gap-2 rounded-xl border border-stone-200 px-4 py-2.5 text-xs font-bold text-stone-600 dark:border-stone-700 dark:text-stone-300"
                    >
                      <Trash2 size={14} />
                      Remove
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={!configured || Boolean(currentProgress)}
                    onClick={() => void handleDownload(zone)}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-black text-white transition-all hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Download size={14} />
                    Download zone
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </section>

      {selectedMap && (
        <section className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm dark:border-stone-800 dark:bg-stone-900">
          <div className="flex items-center justify-between gap-3 border-b border-stone-200 px-4 py-3 dark:border-stone-800">
            <div>
              <p className="text-sm font-black text-stone-900 dark:text-stone-100">
                {selectedMap.name}
              </p>
              <p className="text-[11px] font-medium text-stone-500 dark:text-stone-400">
                Rendered from the locally stored PMTiles package.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedMap(null)}
              className="rounded-lg px-2 py-1 text-xs font-bold text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
            >
              Close
            </button>
          </div>

          {mapError && (
            <div className="px-4 py-3 text-sm font-semibold text-rose-600 dark:text-rose-300">
              {mapError}
            </div>
          )}

          <div ref={mapContainerRef} className="h-[60vh] min-h-[460px] w-full bg-stone-100 dark:bg-stone-950" />
        </section>
      )}

      <p className="mt-5 text-[11px] leading-5 text-stone-500 dark:text-stone-400">
        Map data must be packaged as AniRescue-compatible PMTiles before it can
        be downloaded. The source data remains OpenStreetMap-derived and must
        retain the required ODbL attribution.
      </p>
    </main>
  );
}
