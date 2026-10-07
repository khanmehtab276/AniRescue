import { useEffect, useRef, useState } from "react";
import { MapPin, WifiOff } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext.jsx";
import { createOfflineMapSource, getDownloadedMaps } from "../utils/offlineMapStore.js";
import { addOfflineArchive, loadOfflineMapRenderer } from "../utils/offlineMapRenderer.js";

const ZONE_BOUNDS = {
  "western-india": [68, 8, 78, 29],
  "central-india": [73, 16, 86, 28],
  "northern-india": [68, 23, 83, 37],
  "eastern-india": [80, 17, 90, 29],
  "southern-india": [73, 7, 87, 21],
  "north-eastern-india": [88, 20, 98, 30],
};

const INDIA_CENTER = [78.9629, 20.5937];
const PIN_ZOOM = 12.5;

function contains(bounds, position) {
  if (!bounds || !position) return false;
  const [minLng, minLat, maxLng, maxLat] = bounds;
  return (
    position.lng >= minLng &&
    position.lng <= maxLng &&
    position.lat >= minLat &&
    position.lat <= maxLat
  );
}

function getZoneIdForPosition(position) {
  if (!position) return null;

  return (
    Object.entries(ZONE_BOUNDS).find(([, bounds]) =>
      contains(bounds, position),
    )?.[0] || null
  );
}

function selectDownloadedZone(maps, position) {
  const zoneId = getZoneIdForPosition(position);
  if (!zoneId) return null;

  return (
    maps.find((map) => map.id === zoneId && map.status === "ready") || null
  );
}

function buildOnlineStyle(isDark) {
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
          "background-color": isDark ? "#171c19" : "#f5f5f4",
        },
      },
      {
        id: "osm",
        type: "raster",
        source: "osm",
        paint: {
          "raster-brightness-min": isDark ? 0.05 : 0,
          "raster-brightness-max": isDark ? 0.62 : 1,
          "raster-saturation": isDark ? -0.35 : 0,
          "raster-contrast": isDark ? 0.08 : 0,
          "raster-opacity": 1,
        },
      },
    ],
  };
}

function buildOfflineStyle(pmtilesUrl, attribution, isDark) {
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
        paint: { "background-color": isDark ? "#171c19" : "#f5f5f4" },
      },
      {
        id: "earth",
        type: "fill",
        source: "anirescue",
        "source-layer": "earth",
        paint: { "fill-color": isDark ? "#252c28" : "#f5f5f4" },
      },
      {
        id: "landuse",
        type: "fill",
        source: "anirescue",
        "source-layer": "landuse",
        paint: {
          "fill-color": isDark ? "#244235" : "#dcfce7",
          "fill-opacity": isDark ? 0.42 : 0.5,
        },
      },
      {
        id: "water",
        type: "fill",
        source: "anirescue",
        "source-layer": "water",
        paint: { "fill-color": isDark ? "#24445b" : "#bfdbfe" },
      },
      {
        id: "buildings",
        type: "fill",
        source: "anirescue",
        "source-layer": "buildings",
        minzoom: 14,
        paint: {
          "fill-color": isDark ? "#3b403e" : "#e7e5e4",
          "fill-opacity": isDark ? 0.55 : 0.7,
        },
      },
      {
        id: "roads",
        type: "line",
        source: "anirescue",
        "source-layer": "roads",
        paint: {
          "line-color": isDark ? "#8b918d" : "#78716c",
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            7, 0.35,
            11, 0.8,
            14, 1.5,
            17, 2.8,
          ],
        },
      },
    ],
  };
}

function addPin(maplibre, map, position) {
  if (!position) return null;

  return new maplibre.Marker({ color: "#dc143c" })
    .setLngLat([position.lng, position.lat])
    .addTo(map);
}

export default function PinnedLocationMap({
  position,
  setPosition,
  isOffline,
  onUnavailable,
  className = "h-full w-full",
}) {
  const { theme } = useTheme();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const maplibreRef = useRef(null);
  const [state, setState] = useState({
    loading: true,
    label: "",
    error: "",
  });

  const isDark = theme === "dark";
  const positionZoneId = getZoneIdForPosition(position);

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      try {
        setState({ loading: true, label: "", error: "" });

        const { maplibre, pmtiles } = await loadOfflineMapRenderer();

        if (cancelled || !containerRef.current) return;

        let style;
        let label = "Online map · tap to pin";

        if (isOffline) {
          if (!position) {
            throw new Error(
              "Waiting for your device location before opening the offline map.",
            );
          }

          const maps = await getDownloadedMaps();
          const selected = selectDownloadedZone(maps, position);

          if (!selected) {
            throw new Error(
              "No downloaded offline map covers your current location.",
            );
          }

          const { meta, pmtiles: archive } = await createOfflineMapSource(
            selected.id,
            pmtiles.PMTiles,
          );

          addOfflineArchive(archive);

          const header = await archive.getHeader();
          const center = position
            ? [position.lng, position.lat]
            : [
                header.centerLon || INDIA_CENTER[0],
                header.centerLat || INDIA_CENTER[1],
              ];

          style = buildOfflineStyle(
            `anirescue-offline://${selected.id}`,
            meta.attribution || "© OpenStreetMap contributors",
            isDark,
          );
          label = `Offline map · ${selected.name || "downloaded zone"} · tap to pin`;

          mapRef.current = new maplibre.Map({
            container: containerRef.current,
            center,
            zoom: PIN_ZOOM,
            minZoom: 5,
            maxZoom: 18,
            style,
            attributionControl: true,
            dragRotate: false,
            pitchWithRotate: false,
            touchPitch: false,
            maxPitch: 0,
          });
        } else {
          const center = position
            ? [position.lng, position.lat]
            : INDIA_CENTER;

          style = buildOnlineStyle(isDark);

          mapRef.current = new maplibre.Map({
            container: containerRef.current,
            center,
            zoom: position ? PIN_ZOOM : 5.5,
            minZoom: 2,
            maxZoom: 19,
            style,
            attributionControl: true,
            dragRotate: false,
            pitchWithRotate: false,
            touchPitch: false,
            maxPitch: 0,
          });
        }

        maplibreRef.current = maplibre;
        const map = mapRef.current;

        map.on("load", () => {
          if (cancelled) return;

          map.on("click", (event) => {
            const nextPosition = {
              lat: event.lngLat.lat,
              lng: event.lngLat.lng,
            };

            setPosition(nextPosition);
            map.flyTo({
              center: [nextPosition.lng, nextPosition.lat],
              zoom: Math.max(map.getZoom(), PIN_ZOOM),
              duration: 350,
              essential: true,
            });
          });

          markerRef.current = addPin(maplibre, map, position);

          setState({
            loading: false,
            label,
            error: "",
          });
        });

      } catch (error) {
        if (!cancelled) {
          const message =
            error?.message || "The location map could not be opened.";

          setState({
            loading: false,
            label: "",
            error: message,
          });

          if (isOffline) {
            onUnavailable?.(message);
          }
        }
      }
    }

    void setup();

    return () => {
      cancelled = true;

      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      maplibreRef.current = null;
    };
  }, [isDark, isOffline, positionZoneId]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || !position) return;

    if (markerRef.current) {
      markerRef.current.setLngLat([position.lng, position.lat]);
    } else if (maplibreRef.current) {
      markerRef.current = addPin(maplibreRef.current, map, position);
    }

    map.flyTo({
      center: [position.lng, position.lat],
      zoom: Math.max(map.getZoom(), PIN_ZOOM),
      duration: 350,
      essential: true,
    });
  }, [position]);

  if (state.error) {
    return (
      <div className={`${className} grid place-items-center bg-stone-100 p-5 text-center dark:bg-stone-900`}>
        <div className="max-w-sm">
          <WifiOff size={24} className="mx-auto mb-2 text-stone-400" />
          <p className="text-xs font-bold text-stone-600 dark:text-stone-300">
            {isOffline
              ? "Offline map is not available for this area yet."
              : "Online map could not be opened."}
          </p>
          <p className="mt-1 text-[11px] leading-4 text-stone-500 dark:text-stone-400">
            {isOffline
              ? "Download the matching India zone before going offline. Your saved GPS location can still be submitted."
              : "Your GPS location can still be submitted. Please try again or use the landmark field."}
          </p>
          {isOffline && (
            <p className="mt-2 text-[10px] leading-4 text-stone-400 dark:text-stone-500">
              {state.error}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`${className} relative`}>
      <div ref={containerRef} className="h-full w-full" />
      <div className="pointer-events-none absolute left-2 top-2 z-10 rounded-full bg-stone-950/75 px-3 py-1.5 text-[10px] font-bold text-white backdrop-blur-sm">
        <span className="inline-flex items-center gap-1.5">
          <MapPin size={12} />
          {state.label || (isOffline ? "Opening offline map…" : "Opening map…")}
        </span>
      </div>
      {state.loading && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-white/70 backdrop-blur-sm dark:bg-stone-950/70">
          <div className="rounded-xl bg-white px-3 py-2 text-[11px] font-bold text-stone-600 shadow dark:bg-stone-900 dark:text-stone-300">
            {isOffline ? "Opening downloaded map…" : "Opening map…"}
          </div>
        </div>
      )}
    </div>
  );
}
