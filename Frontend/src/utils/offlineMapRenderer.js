const MAPLIBRE_URL =
  "https://unpkg.com/maplibre-gl@6.12.0/dist/maplibre-gl.mjs";
const MAPLIBRE_CSS_URL =
  "https://unpkg.com/maplibre-gl@6.12.0/dist/maplibre-gl.css";
const PMTILES_URL =
  "https://cdn.jsdelivr.net/npm/pmtiles@4.5.0/+esm";

let rendererPromise = null;
let protocol = null;

function ensureMapLibreCss() {
  if (typeof document === "undefined") return;

  const existing = document.querySelector(
    'link[data-anirescue-maplibre="true"]',
  );

  if (existing) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = MAPLIBRE_CSS_URL;
  link.dataset.anirescueMaplibre = "true";
  document.head.appendChild(link);
}

export async function loadOfflineMapRenderer() {
  if (!rendererPromise) {
    rendererPromise = (async () => {
      ensureMapLibreCss();

      const [maplibreModule, pmtilesModule] = await Promise.all([
        import(/* @vite-ignore */ MAPLIBRE_URL),
        import(/* @vite-ignore */ PMTILES_URL),
      ]);

      const maplibre = maplibreModule.default || maplibreModule;

      if (!protocol) {
        protocol = new pmtilesModule.Protocol();
        maplibre.addProtocol("pmtiles", protocol.tile);
      }

      return {
        maplibre,
        pmtiles: pmtilesModule,
        protocol,
      };
    })().catch((error) => {
      rendererPromise = null;
      throw error;
    });
  }

  return rendererPromise;
}

export function addOfflineArchive(archive) {
  if (!protocol) {
    throw new Error("Offline PMTiles protocol is not initialized.");
  }

  protocol.add(archive);
}
