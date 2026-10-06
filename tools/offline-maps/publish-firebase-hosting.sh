#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="${OUT_DIR:-$ROOT_DIR/tools/offline-maps/output}"
PUBLIC_DIR="$ROOT_DIR/Frontend/public/offline-maps"

if ! command -v firebase >/dev/null 2>&1; then
  echo "Firebase CLI is required. Install/login to Firebase CLI first."
  exit 1
fi

shopt -s nullglob
FILES=( "$OUT_DIR"/*.pmtiles )
if (( ${#FILES[@]} == 0 )); then
  echo "No PMTiles files found in $OUT_DIR."
  echo "Build the India zones first with:"
  echo "  ./tools/offline-maps/build-india-zones.sh"
  exit 1
fi

TOTAL_BYTES="$(du -bc "$OUT_DIR"/*.pmtiles | tail -n 1 | awk '{print $1}')"
MAX_FILE_BYTES=$((2 * 1024 * 1024 * 1024))
MAX_HOSTING_BYTES=$((9 * 1024 * 1024 * 1024))

for file in "$OUT_DIR"/*.pmtiles; do
  size="$(stat -c '%s' "$file")"
  if (( size > MAX_FILE_BYTES )); then
    echo "ERROR: $(basename "$file") is larger than Firebase Hosting's 2 GiB per-file limit."
    exit 1
  fi
done

if (( TOTAL_BYTES > MAX_HOSTING_BYTES )); then
  echo "ERROR: generated PMTiles total more than 9 GiB."
  echo "Firebase Hosting has a 10 GB no-cost storage quota; keep headroom for the app and retained releases."
  exit 1
fi

mkdir -p "$PUBLIC_DIR"
rm -f "$PUBLIC_DIR"/*.pmtiles
cp "$OUT_DIR"/*.pmtiles "$PUBLIC_DIR/"

echo "PMTiles copied to Firebase Hosting source:"
ls -lh "$PUBLIC_DIR"/*.pmtiles
echo "Total PMTiles payload: $((TOTAL_BYTES / 1024 / 1024)) MiB"

cd "$ROOT_DIR/Frontend"
echo "Building the AniRescue frontend with the PMTiles packages..."
npm run build
echo "Deploying Firebase Hosting only..."
firebase deploy --only hosting

echo
echo "Offline map files are now served from:"
echo "  https://anirescue-a5fd7.web.app/offline-maps/<zone>.pmtiles"
echo
echo "The browser downloads these files once and stores them locally in IndexedDB."
