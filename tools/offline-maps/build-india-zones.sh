#!/usr/bin/env bash
set -euo pipefail

SOURCE_URL="${PROTOMAPS_SOURCE_URL:-https://build.protomaps.com/20260925.pmtiles}"
PMTILES_IMAGE="${PMTILES_IMAGE:-ghcr.io/protomaps/go-pmtiles:v1.31.2}"
OUT_DIR="${OUT_DIR:-tools/offline-maps/output}"

mkdir -p "$OUT_DIR"
rm -f "$OUT_DIR"/*.pmtiles

extract() {
  local name="$1"
  local bbox="$2"

  echo "Extracting $name from $SOURCE_URL with bbox=$bbox maxzoom=12"
  docker run --rm \
    -v "$PWD/$OUT_DIR:/out" \
    "$PMTILES_IMAGE" \
    extract "$SOURCE_URL" "/out/$name.pmtiles" \
    --bbox="$bbox" \
    --maxzoom=12

  docker run --rm \
    -v "$PWD/$OUT_DIR:/out" \
    "$PMTILES_IMAGE" \
    verify "/out/$name.pmtiles"
}

extract "western-india" "68,8,78,29"
extract "central-india" "73,16,86,28"
extract "northern-india" "68,23,83,37"
extract "eastern-india" "80,17,90,29"
extract "southern-india" "73,7,87,21"
extract "north-eastern-india" "88,20,98,30"

echo "Offline PMTiles generated in $OUT_DIR"
ls -lh "$OUT_DIR"/*.pmtiles
