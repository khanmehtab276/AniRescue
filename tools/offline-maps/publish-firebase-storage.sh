#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="${OUT_DIR:-$ROOT_DIR/tools/offline-maps/output}"
BUCKET="${FIREBASE_STORAGE_BUCKET:-}"

if [[ -z "$BUCKET" ]]; then
  echo "FIREBASE_STORAGE_BUCKET is required."
  echo "Example: export FIREBASE_STORAGE_BUCKET=anirescue-a5fd7.firebasestorage.app"
  exit 1
fi

if ! command -v gcloud >/dev/null 2>&1; then
  echo "Google Cloud CLI is required. Install gcloud first."
  exit 1
fi

shopt -s nullglob
FILES=( "$OUT_DIR"/*.pmtiles )
if (( ${#FILES[@]} == 0 )); then
  echo "No PMTiles files found in $OUT_DIR."
  echo "Build the India zones first with tools/offline-maps/build-india-zones.sh"
  exit 1
fi

echo "Applying browser CORS to gs://$BUCKET ..."
gcloud storage buckets update "gs://$BUCKET" \
  --cors-file="$ROOT_DIR/tools/offline-maps/cors.json"

echo "Uploading PMTiles to gs://$BUCKET/offline-maps/ ..."
gcloud storage cp \
  --cache-control="public,max-age=31536000,immutable,no-transform" \
  --content-type="application/octet-stream" \
  "$OUT_DIR"/*.pmtiles \
  "gs://$BUCKET/offline-maps/"

echo
echo "Uploaded:"
gcloud storage ls "gs://$BUCKET/offline-maps/*.pmtiles"

echo
echo "AniRescue will resolve these files through Firebase Storage getDownloadURL()."
echo "The frontend storage path is: offline-maps/<filename>.pmtiles"
