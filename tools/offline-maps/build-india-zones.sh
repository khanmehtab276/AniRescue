#!/usr/bin/env bash
set -euo pipefail

# Verified Protomaps daily basemap source used to build AniRescue's
# region-specific offline packages. Update this date when a newer daily
# build has been selected and verified.
SOURCE_URL="https://build.protomaps.com/20260925.pmtiles"

OUT_DIR="${1:-dist}"

mkdir -p "$OUT_DIR"

extract() {
  local name="$1"
  local bbox="$2"

  echo "==> Building $name from $SOURCE_URL"
  pmtiles extract "$SOURCE_URL" "$OUT_DIR/$name.pmtiles" --bbox="$bbox"
  pmtiles verify "$OUT_DIR/$name.pmtiles"
}

# Bounding boxes are intentionally broad so each rescue zone has map context.
# Format: minLon,minLat,maxLon,maxLat
extract "western-india" "68,8,78,29"
extract "central-india" "73,16,86,28"
extract "northern-india" "68,23,83,37"
extract "eastern-india" "80,17,90,29"
extract "southern-india" "73,7,87,21"
extract "north-eastern-india" "88,20,98,30"

echo
echo "Packages created in $OUT_DIR/"
ls -lh "$OUT_DIR"/*.pmtiles
