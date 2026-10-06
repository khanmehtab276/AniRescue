import { useEffect, useRef, useState } from "react";
import { MapPin, WifiOff } from "lucide-react";
import {
  createOfflineMapSource,
  getDownloadedMaps,
} from "../utils/offlineMapStore.js";

const MAPLIBRE_URL =
  "https://unpkg.com/maplibre-gl@6.12.0/dist/maplibre-gl.mjs";
const PMTILES_URL =
  "https://cdn.jsdelivr.net/npm/pmtiles@4.5.0/+esm";

const ZONE_BOUNDS = {
  "western-india": [68, 8, 78, 29],
  "central-india": [73, 16, 86, 28],
  "northern-india": [68, 23, 83, 37],
  "eastern-india": [80, 17, 90, 29],
  "southern-india": [73, 7, 87, 21],
  "north-eastern-india": [88, 20, 98, 30],
};

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

function selectDownloadedZone(maps, position) {
  const ready = maps.filter((map) => map.status === "ready");
  if (!position) return ready[0] || null;

  return (
    ready.find((map) => contains(ZONE_BOUNDS[map.id], position)) ||
    ready[0] ||
    null
  );
}

function buildOfflineStyle(attribution) {
  return {
    version: 8,
    sources: {
      anirescue: {
        type: "vector",
        url: `pmtiles://anirescue-offline-${selected.id}`,
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
        id: "earth",
        type: "fill",
        source: "anirescue",
        "source-layer": "earth",
        paint: { "fill-color": "#f5f5f4" },
      },
      {
        id: "landuse",
        type: "fill",
        source: "anirescue",
        "source-layer": "landuse",
        paint: { "fill-color": "#dcfce7", "fill-opacity": 0.5 },
      },
      {
        id: "water",
        type: "fill",
        source: "anirescue",
        "source-layer": "water",
        paint: { "fill-color": "#bfdbfe" },
      },
      {
        id: "buildings",
        type: "fill",
        source: "anirescue",
        "source-layer": "buildings",
        minzoom: 14,
        paint: { "fill-color": "#e7e5e4", "fill-opacity": 0.7 },
      },
      {
        id: "roads",
        type: "line",
        source: "anirescue",
        "source-layer": "roads",
        paint: {
          "line-color": "#78716c",
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

export default function OfflinePinnedMap({
  position,
  setPosition,
  className = "h-full w-full",
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const protocolRef = useRef(null);\n  const maplibreRef = useRef(null);
  const [state, setState] = useState({
    loading: true,
    map: null,
    error: "",
  });

  useEffect(() => {
    let cancelled = false;

    const setup = async () => {
      try {
        setState({ loading: true, map: null, error: "" });

        const maps = await getDownloadedMaps();
        const selected = selectDownloadedZone(maps, position);

        if (!selected) {
          throw new Error(
            "No large offline map covering this location is downloaded.",
          );
        }

        const [{ default: maplibre }, pmtiles] = await Promise.all([
          import(/* @vite-ignore */ MAPLIBRE_URL),
          import(/* @vite-ignore */ PMTILES_URL),
        ]);

        if (cancelled || !containerRef.current) return;

        const protocol = new pmtiles.Protocol();
        const { meta, pmtiles: archive } = await createOfflineMapSource(
          selected.id,
          pmtiles.PMTiles,
        );

        protocol.add(archive);
        maplibre.addProtocol("pmtiles", protocol.tile);\n        maplibreRef.current = maplibre;
        protocolRef.current = protocol;

        const header = await archive.getHeader();
        if (cancelled || !containerRef.current) return;

        const center =
          position
            ? [position.lng, position.lat]
            : [
                header.centerLon || 78.9629,
                header.centerLat || 22.5937,
              ];

        const map = new maplibre.Map({
          container: containerRef.current,
          center,
          zoom: position ? 13 : Math.max(5, Math.min(header.centerZoom || 6, 12)),
          style: buildOfflineStyle(
            meta.attribution || "© OpenStreetMap contributors",
          ),
          attributionControl: true,
          maxZoom: 18,
        });

        map.on("load", () => {
          if (cancelled) return;

          map.on("click", (event) => {
            setPosition({
              lat: event.lngLat.lat,
              lng: event.lngLat.lng,
            });
          });

          if (position) {
            markerRef.current = new maplibre.Marker({ color: "#dc143c" })
              .setLngLat([position.lng, position.lat])
              .addTo(map);
          }

          setState({ loading: false, map: selected.name, error: "" });
        });

        mapRef.current = map;
      } catch (error) {
        if (!cancelled) {
          setState({
            loading: false,
            map: null,
            error:
              error?.message ||
              "Offline map could not be opened on this device.",
          });
        }
      }
    };

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

      maplibreRef.current = null;\n\n      if (protocolRef.current) {
        // MapLibre owns the protocol registration lifecycle; removing the
        // map is sufficient for this short-lived report-page instance.
        protocolRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !position) return;

    if (markerRef.current) {
      markerRef.current.setLngLat([position.lng, position.lat]);
    } else if (window.maplibregl) {
      markerRef.current = new window.maplibregl.Marker({ color: "#dc143c" })
        .setLngLat([position.lng, position.lat])
        .addTo(map);
    }

    map.flyTo({
      center: [position.lng, position.lat],
      zoom: Math.max(map.getZoom(), 13),
      duration: 350,
    });
  }, [position]);

  if (state.error) {
    return (
      <div className={`${className} grid place-items-center bg-stone-100 p-5 text-center dark:bg-stone-900`}>
        <div className="max-w-sm">
          <WifiOff size={24} className="mx-auto mb-2 text-stone-400" />
          <p className="text-xs font-bold text-stone-600 dark:text-stone-300">
            Offline map is not available for this area yet.
          </p>
          <p className="mt-1 text-[11px] leading-4 text-stone-500 dark:text-stone-400">
            Download the matching India zone before going offline. You can
            still submit a report using the saved GPS location.
          </p>
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
          Offline map · tap to pin
        </span>
      </div>
      {state.loading && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-white/70 backdrop-blur-sm dark:bg-stone-950/70">
          <div className="rounded-xl bg-white px-3 py-2 text-[11px] font-bold text-stone-600 shadow dark:bg-stone-900 dark:text-stone-300">
            Opening downloaded map…
          </div>
        </div>
      )}
    </div>
  );
}
