# AniRescue large offline map packages

AniRescue's large offline-map feature expects **vector PMTiles** packages.

Do not publish the raw Geofabrik .osm.pbf files as if they were browser maps. A PBF is source data; it must be converted to vector tiles first.

## Recommended pipeline

The current verified Protomaps daily source used by the build helper is:

`https://build.protomaps.com/20260925.pmtiles`

The browser must **not** download this planet archive directly. Protomaps documents the planet archive as roughly 120 GB; AniRescue extracts smaller India zones first, then publishes those zone files to CORS-enabled object storage. cite? no citations in repo docs. 

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
HTTPS object storage with CORS + byte-range support
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

The PMTiles URL used by the browser must support:

- HTTPS
- CORS for the AniRescue origin
- HTTP byte-range requests
- stable object URLs
- enough storage/egress for the expected download volume

Object storage such as S3-compatible storage is a good fit. The browser does not need a custom tile backend when it reads PMTiles directly.

## Zone package names expected by the PWA

Configure `VITE_OFFLINE_MAP_BASE_URL` to the directory containing the generated zone files. Do not point this variable at the Protomaps planet URL.

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
