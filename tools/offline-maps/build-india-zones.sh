#!/usr/bin/env bash
set -euo pipefail

BUILD_DATE="${PROTOMAPS_BUILD_DATE:-$(date -u +%Y%m%d)}"
SOURCE_URL="${PROTOMAPS_SOURCE_URL:-https://build.protomaps.com/${BUILD_DATE}.pmtiles}"
FALLBACK_BUILD_DATE="${PROTOMAPS_FALLBACK_BUILD_DATE:-20260925}"
FALLBACK_SOURCE_URL="https://build.protomaps.com/${FALLBACK_BUILD_DATE}.pmtiles"
PMTILES_IMAGE="${PMTILES_IMAGE:-ghcr.io/protomaps/go-pmtiles:v1.31.2}"
OUT_DIR="${OUT_DIR:-tools/offline-maps/output}"
MIN_ARCHIVE_BYTES="${MIN_ARCHIVE_BYTES:-1048576}"

mkdir -p "$OUT_DIR"
rm -f "$OUT_DIR"/*.pmtiles "$OUT_DIR"/.*.pmtiles.tmp

run_pmtiles() {
  docker run --rm \
    -v "$PWD/$OUT_DIR:/out" \
    "$PMTILES_IMAGE" "$@"
}

validate_archive() {
  local path="$1"
  local size
  size="$(stat -c "%s" "$OUT_DIR/$path")"

  if (( size < MIN_ARCHIVE_BYTES )); then
    echo "Generated archive $path is only $size bytes; refusing to publish an empty/tiny map package."
    return 1
  fi

  local summary
  summary="$(run_pmtiles show "/out/$path")"

  grep -Eq "^tile type: MVT$" <<<"$summary" || {
    echo "Generated archive $path is not an MVT PMTiles archive."
    return 1
  }

  grep -Eq "^tile contents count: [1-9][0-9]*$" <<<"$summary" || {
    echo "Generated archive $path contains no tile contents."
    return 1
  }

  run_pmtiles verify "/out/$path"
}

extract_from_source() {
  local name="$1"
  local bbox="$2"
  local source="$3"
  local tmp=".${name}.pmtiles.tmp"

  rm -f "$OUT_DIR/$tmp" "$OUT_DIR/$name.pmtiles"

  echo "Extracting $name from $source with bbox=$bbox maxzoom=12 overfetch=0"
  run_pmtiles extract "$source" "/out/$tmp" \
    --bbox="$bbox" \
    --maxzoom=12 \
    --overfetch=0

  validate_archive "$tmp"
  mv "$OUT_DIR/$tmp" "$OUT_DIR/$name.pmtiles"
}

extract() {
  local name="$1"
  local bbox="$2"

  if extract_from_source "$name" "$bbox" "$SOURCE_URL"; then
    return 0
  fi

  if [[ -n "${PROTOMAPS_SOURCE_URL:-}" || "$FALLBACK_SOURCE_URL" == "$SOURCE_URL" ]]; then
    echo "No automatic fallback is configured for the explicit PMTiles source."
    return 1
  fi

  echo "Primary Protomaps build did not produce a valid $name package. Retrying with fallback build $FALLBACK_BUILD_DATE."
  extract_from_source "$name" "$bbox" "$FALLBACK_SOURCE_URL"
}

extract "western-india" "68,8,78,29"
extract "central-india" "73,16,86,28"
extract "northern-india" "68,23,83,37"
extract "eastern-india" "80,17,90,29"
extract "southern-india" "73,7,87,21"
extract "north-eastern-india" "88,20,98,30"

echo "Offline PMTiles generated in $OUT_DIR"
ls -lh "$OUT_DIR"/*.pmtiles
