# AniRescue large offline map packages

AniRescue's large offline-map feature expects **vector PMTiles** packages.

Do not publish the raw Geofabrik .osm.pbf files as if they were browser maps. A PBF is source data; it must be converted to vector tiles first.

## Recommended pipeline

The current verified Protomaps daily source used by the build helper is:

`https://build.protomaps.com/20260925.pmtiles`

The browser must **not** download this planet archive directly. Protomaps documents the planet archive as roughly 120 GB; AniRescue extracts smaller India zones first, then publishes those zone files to CORS-enabled object storage.

~~~text
Geofabrik OpenStreetMap extract
        |
        v
   tilemaker / Protomaps
        |
        v
Mapbox Vector Tiles
        |
        v
     PMTiles
        |
        v
pmtiles verify
        |
        v
Firebase Hosting static files over HTTPS
        |
        v
AniRescue PWA
        |
        v
chunked IndexedDB storage
        |
        v
MapLibre GL JS + PMTiles
~~~

Geofabrik's India downloads are ODbL-licensed OpenStreetMap-derived data and must retain the required attribution/license conditions.

## Building a zone with tilemaker

Tilemaker can read a Geofabrik .osm.pbf extract and write PMTiles directly.

Example:

~~~bash
docker run --rm --pull always \
  -v "$PWD:/data" \
  ghcr.io/systemed/tilemaker:master \
  /data/western-india.osm.pbf \
  --output /data/western-india.pmtiles
~~~

For a production package, cluster and verify the result with the PMTiles CLI:

~~~bash
pmtiles cluster western-india.pmtiles western-india-clustered.pmtiles
pmtiles verify western-india-clustered.pmtiles
~~~

Use the clustered file as the published package.

### Important

The final PMTiles size is **not the same as the Geofabrik PBF size**. The application must display the measured PMTiles file size after generation; never copy the PBF size into the download UI.

## Better alternative for large zones

A Protomaps basemap build can also be extracted to a region with:

~~~bash
pmtiles extract SOURCE.pmtiles western-india.pmtiles --region western-india.geojson
pmtiles verify western-india.pmtiles
~~~

This is useful when a suitable clustered PMTiles source is available.

## Hosting requirements

The PMTiles URL used by the browser must be a stable HTTPS static-file URL. AniRescue uses the existing Firebase Hosting site by default, so no separate map server or Firebase Cloud Storage bucket is required.

The browser reads PMTiles directly; the backend does not proxy map bytes. Same-origin delivery also means the default Firebase Hosting path does not need a separate CORS configuration.

For interrupted downloads to resume efficiently, verify that the deployed hosting endpoint honors HTTP byte-range requests and returns `206 Partial Content` with `Content-Range`. The downloader can handle a first-time complete `200 OK` stream, but reliable resume requires range support.

## Zone package names expected by the PWA

By default the PWA uses the same Firebase Hosting origin at `/offline-maps/`. Configure `VITE_OFFLINE_MAP_BASE_URL` only when intentionally hosting the generated zone files somewhere else. Do not point it at the Protomaps planet URL.

- western-india.pmtiles
- central-india.pmtiles
- northern-india.pmtiles
- eastern-india.pmtiles
- southern-india.pmtiles
- north-eastern-india.pmtiles

The PWA intentionally does not hard-code download sizes because those sizes depend on the selected tile schema, zoom range, clipping method, and package generation.

## Attribution

The map UI should continue to show:

> © OpenStreetMap contributors

The exact ODbL attribution/share-alike requirements must be retained for the derived database/package. See the Geofabrik/OpenStreetMap licensing terms before publishing packages.

## Why PMTiles

PMTiles is a single-file archive for tiled data. It is particularly suitable for static object storage and browser delivery because clients can retrieve byte ranges instead of requiring a traditional tile server.

For AniRescue, the large package is downloaded once and then stored locally in IndexedDB. The local PMTiles source reads only the byte ranges needed by MapLibre, so the browser does not need to keep the entire zone in RAM.


## Firebase Hosting publishing

AniRescue does **not** use Firebase Cloud Storage for large offline maps. This keeps the offline-map feature independent of the paid Cloud Storage service.

The generated PMTiles packages are deployed as ordinary static files on the existing Firebase Hosting site:

```text
Firebase Hosting
└── /offline-maps/
    ├── western-india.pmtiles
    ├── central-india.pmtiles
    ├── northern-india.pmtiles
    ├── eastern-india.pmtiles
    ├── southern-india.pmtiles
    └── north-eastern-india.pmtiles
```

The PWA downloads a selected package over HTTPS and stores it in the user's browser using IndexedDB. The backend does not participate in map-file delivery and does not sign or proxy PMTiles data.

### Publish the generated packages

1. Build the six zone packages:

```bash
./tools/offline-maps/build-india-zones.sh
```

2. Make sure the Firebase CLI is installed and authenticated:

```bash
firebase login
```

3. Publish the packages through the existing AniRescue Firebase Hosting project:

```bash
./tools/offline-maps/publish-firebase-hosting.sh
```

The publisher copies the generated PMTiles into `Frontend/public/offline-maps/`, builds the frontend, and runs:

```bash
firebase deploy --only hosting
```

The resulting public package URLs are:

```text
https://anirescue-a5fd7.web.app/offline-maps/western-india.pmtiles
https://anirescue-a5fd7.web.app/offline-maps/central-india.pmtiles
...
```

Do **not** commit the generated PMTiles files to Git. They are generated deployment artifacts.

### Runtime flow

**Online download:** Login -> Offline Maps/ReportCase -> static Firebase Hosting PMTiles -> IndexedDB 4 MiB chunks.

**Offline use:** ReportCase -> OfflinePinnedMap -> IndexedDB -> PMTiles -> MapLibre.

After a map has been downloaded successfully, opening that map does not require Firebase Hosting, the AniRescue backend, Firebase Cloud Storage, or the OpenStreetMap tile server.

### HTTP range behavior

PMTiles is designed around HTTP byte-range reads. AniRescue first probes the hosted package with a `Range: bytes=0-0` request. If the hosting path returns `206 Partial Content`, the downloader stores fixed 4 MiB ranges directly in IndexedDB. If a first-time download receives a complete `200 OK` response instead, AniRescue can stream that response into IndexedDB without loading the entire file into RAM.

For **resume after an interrupted download**, the hosting endpoint must support byte ranges. Verify this after deployment with:

```bash
curl -I -H "Range: bytes=0-0" \
  https://anirescue-a5fd7.web.app/offline-maps/western-india.pmtiles
```

A range-capable response should report `206 Partial Content` and a `Content-Range` header. Do not claim range support from configuration alone; verify the deployed endpoint.

