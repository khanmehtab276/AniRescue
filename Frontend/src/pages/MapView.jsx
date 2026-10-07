import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Crosshair,
  Filter,
  HeartHandshake,
  MapPin,
  PawPrint,
  RefreshCw,
  Siren,
  Wifi,
  WifiOff,
} from "lucide-react";

import API from "../utils/api.js";
import { useAuth } from "../contexts/AuthContext.jsx";
import useLocation from "../hooks/useLocation";
import { useTheme } from "../contexts/ThemeContext.jsx";
import { getStatusConfig } from "../utils/statusConfig.js";
import { loadOfflineMapRenderer } from "../utils/offlineMapRenderer.js";
import { subscribeToLiveRescueMap } from "../utils/liveRescueSocket.js";

const INITIAL_CENTER = [78.9629, 20.5937];

const ROLE_CONFIG = {
  user: {
    title: "Your Rescue Map",
    eyebrow: "My reports",
    description: "Follow the animals you have reported and their rescue progress.",
    empty: "You have no active mapped rescue reports.",
    note: "Only your own active reports are shown here.",
    icon: PawPrint,
    filters: [["all", "All"], ["active", "Active"], ["rescue", "In rescue"]],
  },
  volunteer: {
    title: "Rescue Dispatch",
    eyebrow: "Field response",
    description: "Find validated cases that need a responder and follow your active rescue.",
    empty: "No available or active mapped rescues right now.",
    note: "Available cases and your active rescue are shown here.",
    icon: Siren,
    filters: [["all", "All"], ["available", "Available"], ["urgent", "Priority"], ["rescue", "In rescue"]],
  },
  ngo: {
    title: "NGO Rescue Map",
    eyebrow: "Local operations",
    description: "Monitor active rescue activity within your organisation’s operating area.",
    empty: "No active mapped cases are available for your operational view.",
    note: "Your NGO operational map is focused on active rescue work.",
    icon: HeartHandshake,
    filters: [["all", "All"], ["available", "Unassigned"], ["urgent", "Priority"], ["rescue", "In rescue"]],
  },
  admin: {
    title: "Rescue Operations",
    eyebrow: "System overview",
    description: "Monitor active rescue cases across the AniRescue operation.",
    empty: "There are no active mapped rescue cases right now.",
    note: "Administrator view includes all active mapped rescue cases.",
    icon: Siren,
    filters: [["all", "All"], ["urgent", "Priority"], ["rescue", "In rescue"]],
  },
};

const ROLE_LABELS = {
  user: "My reports",
  volunteer: "Dispatch",
  ngo: "NGO area",
  admin: "All active",
};

const STATUS_LABEL = {
  VALIDATION_PASSED: "Needs rescue",
  IN_PROGRESS: "In rescue",
  RESCUE_COMPLETED: "Rescue completed",
  PROCESSING_ANALYSIS: "AI analysis",
  PENDING_VALIDATION: "Validation",
  AI_PROCESSING_FAILED: "AI needs review",
};

function normalizeCases(rows) {
  if (!Array.isArray(rows)) return [];

  const seen = new Set();

  return rows
    .map((item) => {
      const id = String(item?.id ?? "");
      const latitude = Number(item?.latitude);
      const longitude = Number(item?.longitude);

      if (!id || seen.has(id)) return null;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
      if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;

      seen.add(id);

      return {
        id,
        species: item.species || "Animal in need",
        priority: item.priority || "STANDARD",
        status: item.status || "PENDING_VALIDATION",
        latitude,
        longitude,
      };
    })
    .filter(Boolean);
}

function toFeatureCollection(cases) {
  return {
    type: "FeatureCollection",
    features: cases.map((item) => ({
      type: "Feature",
      id: item.id,
      properties: {
        id: item.id,
        species: item.species,
        priority: item.priority,
        status: item.status,
      },
      geometry: {
        type: "Point",
        coordinates: [item.longitude, item.latitude],
      },
    })),
  };
}

function matchesFilter(item, filter) {
  if (filter === "all") return true;
  if (filter === "active") return item.status !== "RESOLVED";
  if (filter === "available") return item.status === "VALIDATION_PASSED";
  if (filter === "urgent") return ["CRITICAL", "HIGH"].includes(item.priority);
  if (filter === "rescue") return item.status === "IN_PROGRESS" || item.status === "RESCUE_COMPLETED";
  return true;
}

function createOnlineStyle(isDark) {
  return {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors",
        maxzoom: 19,
      },
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: {
          "background-color": isDark ? "#171c19" : "#edf7f1",
        },
      },
      {
        id: "osm",
        type: "raster",
        source: "osm",
        paint: {
          "raster-brightness-min": isDark ? 0.05 : 0,
          "raster-brightness-max": isDark ? 0.58 : 1,
          "raster-saturation": isDark ? -0.35 : 0,
          "raster-contrast": isDark ? 0.08 : 0,
          "raster-opacity": 1,
        },
      },
    ],
  };
}

function addCaseLayers(map) {
  map.addSource("cases", {
    type: "geojson",
    data: toFeatureCollection([]),
    cluster: true,
    clusterMaxZoom: 13,
    clusterRadius: 48,
    clusterProperties: {
      critical: ["+", ["case", ["==", ["get", "priority"], "CRITICAL"], 1, 0]],
      high: ["+", ["case", ["==", ["get", "priority"], "HIGH"], 1, 0]],
    },
  });

  map.addLayer({
    id: "case-clusters",
    type: "circle",
    source: "cases",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": [
        "step",
        ["get", "point_count"],
        "#059669",
        5,
        "#f97316",
        15,
        "#e11d48",
      ],
      "circle-radius": [
        "step",
        ["get", "point_count"],
        20,
        5,
        26,
        15,
        32,
      ],
      "circle-stroke-color": "rgba(255,255,255,0.9)",
      "circle-stroke-width": 2,
    },
  });

  map.addLayer({
    id: "case-cluster-count",
    type: "symbol",
    source: "cases",
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-size": 12,
      "text-font": ["Open Sans Bold"],
    },
    paint: {
      "text-color": "#ffffff",
    },
  });

  map.addLayer({
    id: "case-points",
    type: "circle",
    source: "cases",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": [
        "match",
        ["get", "priority"],
        "CRITICAL",
        "#e11d48",
        "HIGH",
        "#f97316",
        "LOW",
        "#0ea5e9",
        "#059669",
      ],
      "circle-radius": 9,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2.5,
      "circle-opacity": 0.96,
    },
  });

  map.addLayer({
    id: "selected-case",
    type: "circle",
    source: "cases",
    filter: ["==", ["get", "id"], ""],
    paint: {
      "circle-color": "transparent",
      "circle-radius": 15,
      "circle-stroke-color": "#064e3b",
      "circle-stroke-width": 3,
      "circle-opacity": 0,
      "circle-stroke-opacity": 0.95,
    },
  });
}

function setSelectedFilter(map, id) {
  if (!map.getLayer("selected-case")) return;
  map.setFilter("selected-case", ["==", ["get", "id"], id || ""]);
}

export default function MapView() {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const { location, getLocation, isLoading: locating } = useLocation();

  const role = String(user?.role || "").toLowerCase();
  const config = ROLE_CONFIG[role] || ROLE_CONFIG.user;
  const RoleIcon = config.icon;

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const rendererRef = useRef(null);
  const mapReadyRef = useRef(false);
  const firstSnapshotRef = useRef(true);
  const selectedCaseRef = useRef(null);

  const [mapCases, setMapCases] = useState([]);
  const [selectedCase, setSelectedCase] = useState(null);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [liveStatus, setLiveStatus] = useState("connecting");
  const [mapError, setMapError] = useState("");

  const visibleCases = useMemo(
    () => mapCases.filter((item) => matchesFilter(item, filter)),
    [mapCases, filter],
  );

  const updateCaseSource = useCallback((cases) => {
    const map = mapRef.current;

    if (!map || !mapReadyRef.current) return;

    const source = map.getSource("cases");

    if (source) {
      source.setData(toFeatureCollection(cases));
    }
  }, []);

  const applyCases = useCallback((rows) => {
    const normalized = normalizeCases(rows);
    setMapCases(normalized);
    updateCaseSource(normalized);

    if (
      selectedCaseRef.current &&
      !normalized.some((item) => item.id === selectedCaseRef.current.id)
    ) {
      selectedCaseRef.current = null;
      setSelectedCase(null);

      if (mapRef.current) {
        setSelectedFilter(mapRef.current, null);
      }
    }
  }, [updateCaseSource]);

  const loadMapCases = useCallback(async (silent = false) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const response = await API.get("/cases/map");
      applyCases(response.data);

      setError("");
    } catch (err) {
      console.error("Failed to load rescue map:", err);
      setError(
        err.response?.data?.error ||
          "Unable to load rescue activity right now.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [applyCases]);

  useEffect(() => {
    loadMapCases(false);
  }, [loadMapCases, role]);

  useEffect(() => {
    let unsubscribe;

    subscribeToLiveRescueMap(
      () => {
        // Socket events contain no case data. The REST endpoint remains the
        // authoritative, RBAC-filtered snapshot. Debounce rapid backend
        // changes so multiple updates do not create request storms.
        window.clearTimeout(window.__anirescueMapRefreshTimer);
        window.__anirescueMapRefreshTimer = window.setTimeout(() => {
          loadMapCases(true);
        }, 180);
      },
      setLiveStatus,
    ).then((cleanup) => {
      unsubscribe = cleanup;
    });

    return () => {
      unsubscribe?.();
      window.clearTimeout(window.__anirescueMapRefreshTimer);
    };
  }, [loadMapCases]);

  useEffect(() => {
    let cancelled = false;

    async function createMap() {
      try {
        const { maplibre } = await loadOfflineMapRenderer();

        if (cancelled || !mapContainerRef.current) return;

        rendererRef.current = maplibre;

        const map = new maplibre.Map({
          container: mapContainerRef.current,
          style: createOnlineStyle(isDark),
          center: INITIAL_CENTER,
          zoom: 4.2,
          minZoom: 2,
          maxZoom: 19,
          attributionControl: true,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          maxPitch: 0,
        });

        mapRef.current = map;

        map.addControl(new maplibre.NavigationControl({ showCompass: false }), "bottom-right");

        map.on("load", () => {
          if (cancelled) return;

          addCaseLayers(map);
          mapReadyRef.current = true;
          updateCaseSource(mapCases);
          setSelectedFilter(map, selectedCaseRef.current?.id || null);

          if (location) {
            map.flyTo({
              center: [location.lng, location.lat],
              zoom: 12,
              duration: 700,
              essential: true,
            });
          }
        });

        map.on("click", "case-clusters", (event) => {
          const feature = map.queryRenderedFeatures(event.point, {
            layers: ["case-clusters"],
          })[0];

          const clusterId = feature?.properties?.cluster_id;
          const source = map.getSource("cases");

          if (clusterId === undefined || !source?.getClusterExpansionZoom) return;

          source.getClusterExpansionZoom(clusterId, (err, zoom) => {
            if (err) return;

            const coordinates = feature.geometry.coordinates;

            map.easeTo({
              center: coordinates,
              zoom: Math.min(zoom, 16),
              duration: 450,
            });
          });
        });

        map.on("click", "case-points", (event) => {
          const feature = event.features?.[0];

          if (!feature) return;

          const item = mapCases.find(
            (candidate) => candidate.id === String(feature.properties?.id),
          );

          if (!item) return;

          selectedCaseRef.current = item;
          setSelectedCase(item);
          setSelectedFilter(map, item.id);

          map.flyTo({
            center: feature.geometry.coordinates,
            zoom: Math.max(map.getZoom(), 14),
            duration: 550,
            essential: true,
          });
        });

        map.on("mouseenter", "case-points", () => {
          map.getCanvas().style.cursor = "pointer";
        });

        map.on("mouseleave", "case-points", () => {
          map.getCanvas().style.cursor = "";
        });

        map.on("mouseenter", "case-clusters", () => {
          map.getCanvas().style.cursor = "pointer";
        });

        map.on("mouseleave", "case-clusters", () => {
          map.getCanvas().style.cursor = "";
        });
      } catch (err) {
        console.error("Failed to initialize rescue map renderer:", err);
        setMapError("The map renderer could not be loaded. Please try again.");
      }
    }

    createMap();

    return () => {
      cancelled = true;
      mapReadyRef.current = false;

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || !mapReadyRef.current) return;

    if (map.getStyle()) {
      // Keep the live case source intact while updating only the basemap
      // visual treatment. This avoids rebuilding markers on theme changes.
      const raster = map.getLayer("osm");

      if (raster) {
        map.setPaintProperty("osm", "raster-brightness-min", isDark ? 0.05 : 0);
        map.setPaintProperty("osm", "raster-brightness-max", isDark ? 0.58 : 1);
        map.setPaintProperty("osm", "raster-saturation", isDark ? -0.35 : 0);
        map.setPaintProperty("osm", "raster-contrast", isDark ? 0.08 : 0);
      }
    }
  }, [isDark]);

  useEffect(() => {
    if (!mapReadyRef.current || !mapRef.current) return;

    const map = mapRef.current;

    const filtered = visibleCases;

    const source = map.getSource("cases");

    if (source) {
      source.setData(toFeatureCollection(filtered));
    }

    if (
      selectedCaseRef.current &&
      !filtered.some((item) => item.id === selectedCaseRef.current.id)
    ) {
      selectedCaseRef.current = null;
      setSelectedCase(null);
      setSelectedFilter(map, null);
    }
  }, [visibleCases]);

  useEffect(() => {
    if (!location || !mapRef.current) return;

    const map = mapRef.current;

    if (!firstSnapshotRef.current) return;

    firstSnapshotRef.current = false;

    map.flyTo({
      center: [location.lng, location.lat],
      zoom: 12,
      duration: 800,
      essential: true,
    });
  }, [location]);

  const centerOnLocation = () => {
    if (!location) {
      getLocation();
      return;
    }

    mapRef.current?.flyTo({
      center: [location.lng, location.lat],
      zoom: Math.max(mapRef.current.getZoom(), 12),
      duration: 650,
      essential: true,
    });
  };

  const closeSelected = () => {
    selectedCaseRef.current = null;
    setSelectedCase(null);

    if (mapRef.current) {
      setSelectedFilter(mapRef.current, null);
    }
  };

  const roleCountLabel = ROLE_LABELS[role] || "Active";
  const urgentCount = mapCases.filter((item) => ["CRITICAL", "HIGH"].includes(item.priority)).length;

  const liveLabel =
    liveStatus === "live"
      ? "Live"
      : liveStatus === "reconnecting"
        ? "Reconnecting"
        : liveStatus === "connecting"
          ? "Connecting"
          : "Offline";

  return (
    <main className="mx-auto max-w-7xl px-4 pb-24 pt-5 md:px-8 md:pb-8 md:pt-8">
      <header className="mb-5 flex items-start justify-between gap-4 animate-rescue-fade-up">
        <div className="flex min-w-0 gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-emerald-700 shadow-sm ring-1 ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-800/60">
            <RoleIcon size={23} />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-400">
                {config.eyebrow}
              </p>

              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-800 ring-1 ring-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-900/60">
                {liveStatus === "live" ? <Wifi size={11} /> : <WifiOff size={11} />}
                {liveLabel}
              </span>
            </div>

            <h1 className="mt-1 text-2xl font-black tracking-tight text-stone-900 dark:text-stone-50 md:text-3xl">
              {config.title}
            </h1>

            <p className="mt-1 max-w-2xl text-sm leading-5 text-stone-500 dark:text-stone-400">
              {config.description}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => loadMapCases(true)}
          disabled={refreshing}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-stone-200 bg-white text-stone-500 shadow-sm transition-all hover:-translate-y-0.5 hover:text-emerald-700 active:scale-95 disabled:opacity-60 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-400 dark:hover:text-emerald-300"
          aria-label="Refresh rescue map"
          title="Refresh"
        >
          <RefreshCw size={17} className={refreshing ? "animate-spin" : ""} />
        </button>
      </header>

      <section className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Mapped" value={mapCases.length} />
        <Stat label={role === "user" ? "My reports" : "Available"} value={role === "user" ? mapCases.length : mapCases.filter((item) => item.status === "VALIDATION_PASSED").length} />
        <Stat label="Priority" value={urgentCount} />
        <Stat label="View" value={roleCountLabel} />
      </section>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1 rescue-stagger">
        <div className="flex h-9 shrink-0 items-center gap-2 rounded-xl bg-emerald-50 px-3 text-xs font-bold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
          <Filter size={14} />
          Role-scoped view
        </div>

        {config.filters.map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={
              `shrink-0 rounded-xl px-4 py-2 text-xs font-bold transition-all duration-200 active:scale-95 ${
                filter === value
                  ? "bg-emerald-700 text-white shadow-md shadow-emerald-700/20"
                  : "border border-stone-200 bg-white text-stone-600 hover:-translate-y-0.5 hover:border-emerald-200 hover:text-emerald-700 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-emerald-700 dark:hover:text-emerald-300"
              }`
            }
          >
            {label}
          </button>
        ))}
      </div>

      <section className="overflow-hidden rounded-[1.5rem] border border-stone-200 bg-white p-2 shadow-[0_14px_40px_rgba(41,37,36,0.08)] dark:border-stone-800 dark:bg-stone-900 dark:shadow-black/30 md:p-3">
        <div className="relative h-[62vh] min-h-[480px] overflow-hidden rounded-[1.15rem] bg-emerald-50 dark:bg-stone-950">
          <div ref={mapContainerRef} className="absolute inset-0" />

          {loading && (
            <div className="absolute inset-0 z-[20] grid place-items-center bg-white/85 backdrop-blur-sm dark:bg-stone-950/85">
              <div className="rounded-2xl border border-stone-200 bg-white px-5 py-4 text-center shadow-xl dark:border-stone-800 dark:bg-stone-900 animate-rescue-pop">
                <PawPrint size={28} className="mx-auto mb-2 animate-pulse text-emerald-600" />
                <p className="text-sm font-bold text-stone-700 dark:text-stone-200">Loading rescue activity...</p>
              </div>
            </div>
          )}

          {mapError && !loading && (
            <div className="absolute inset-0 z-[30] grid place-items-center bg-white/95 px-6 text-center dark:bg-stone-950/95">
              <div>
                <AlertTriangle size={38} className="mx-auto mb-3 text-amber-500" />
                <p className="font-black text-stone-800 dark:text-stone-100">Map unavailable</p>
                <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{mapError}</p>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="mt-4 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white active:scale-95"
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          {!loading && error && (
            <div className="absolute left-3 right-3 top-3 z-[25] rounded-2xl border border-amber-200 bg-amber-50/95 px-4 py-3 shadow-lg backdrop-blur-sm dark:border-amber-900/60 dark:bg-amber-950/80">
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
                <div>
                  <p className="text-xs font-black text-amber-900 dark:text-amber-100">Rescue activity could not be refreshed</p>
                  <p className="mt-0.5 text-[11px] text-amber-800 dark:text-amber-200">{error}</p>
                </div>
              </div>
            </div>
          )}

          {!loading && !mapError && (
            <>
              <div className="absolute right-3 top-3 z-[10] flex flex-col gap-2">
                <button
                  type="button"
                  onClick={centerOnLocation}
                  disabled={locating}
                  className="grid h-11 w-11 place-items-center rounded-xl border border-stone-200 bg-white/95 text-stone-600 shadow-lg backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:text-emerald-700 active:scale-95 disabled:opacity-60 dark:border-stone-800 dark:bg-stone-900/95 dark:text-stone-300 dark:hover:text-emerald-300"
                  aria-label="Center map on my location"
                  title="My location"
                >
                  <Crosshair size={18} className={locating ? "animate-spin" : ""} />
                </button>
              </div>

              {selectedCase && (
                <div className="absolute inset-x-3 bottom-3 z-[15] animate-rescue-fade-up md:left-1/2 md:right-auto md:w-[min(92%,430px)] md:-translate-x-1/2">
                  <div className="rounded-2xl border border-stone-200 bg-white/95 p-4 shadow-2xl backdrop-blur-sm dark:border-stone-800 dark:bg-stone-900/95">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-wider text-stone-400">
                          Case #{selectedCase.id}
                        </p>
                        <h3 className="mt-0.5 truncate text-sm font-black capitalize text-stone-900 dark:text-stone-100">
                          {selectedCase.species}
                        </h3>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                            {STATUS_LABEL[selectedCase.status] || getStatusConfig(selectedCase.status).shortLabel}
                          </span>
                          {selectedCase.priority !== "STANDARD" && (
                            <span className="rounded-full bg-rose-50 px-2 py-1 text-[10px] font-black text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                              {selectedCase.priority}
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={closeSelected}
                        className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-100"
                        aria-label="Close selected case"
                      >
                        ×
                      </button>
                    </div>

                    <Link
                      to={`/cases/${selectedCase.id}`}
                      className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-[0.98]"
                    >
                      Open case
                    </Link>
                  </div>
                </div>
              )}

              {visibleCases.length === 0 && (
                <div className="pointer-events-none absolute inset-x-4 top-4 z-[8] flex justify-center">
                  <div className="rounded-2xl border border-stone-200 bg-white/95 px-4 py-3 text-center shadow-lg backdrop-blur-sm dark:border-stone-800 dark:bg-stone-900/95">
                    <p className="text-sm font-black text-stone-700 dark:text-stone-100">{config.empty}</p>
                    <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">Try another filter when available.</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex flex-wrap gap-x-5 gap-y-2 px-2 pb-1 pt-3">
          <LegendItem color="#e11d48" label="Critical" />
          <LegendItem color="#f97316" label="High" />
          <LegendItem color="#059669" label="Standard" />
          <LegendItem color="#0ea5e9" label="Low" />
        </div>
      </section>

      <div className="mt-4 flex items-start gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-xs leading-5 text-emerald-900 ring-1 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-900">
        <MapPin size={15} className="mt-0.5 shrink-0 text-emerald-700" />
        <p>
          This map is role-scoped by the backend. Your browser only receives cases
          you are authorized to view, and live updates re-check those permissions.
        </p>
      </div>

      <div className="mt-4 flex justify-end">
        <Link
          to="/offline-maps"
          className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-black text-emerald-800 transition-all hover:-translate-y-0.5 hover:shadow-sm dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300"
        >
          <MapPin size={15} />
          Offline maps
        </Link>
      </div>
    </main>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 shadow-sm dark:border-stone-800 dark:bg-stone-900">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-stone-400">{label}</p>
      <p className="mt-1 text-xl font-black text-stone-900 dark:text-stone-50">{value}</p>
    </div>
  );
}

function LegendItem({ color, label }) {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold text-stone-600 dark:text-stone-300">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </div>
  );
}
