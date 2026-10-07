#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="${OUT_DIR:-$ROOT_DIR/tools/offline-maps/output}"
PUBLIC_DIR="$ROOT_DIR/Frontend/public/offline-maps"
PMTILES_IMAGE="${PMTILES_IMAGE:-ghcr.io/protomaps/go-pmtiles:v1.31.2}"
MIN_ARCHIVE_BYTES="${MIN_ARCHIVE_BYTES:-1048576}"

FIREBASE_CLI_VERSION="${FIREBASE_CLI_VERSION:-15.30.1}"
FIREBASE_CMD=(npx --yes "firebase-tools@${FIREBASE_CLI_VERSION}")

shopt -s nullglob
FILES=( "$OUT_DIR"/*.pmtiles )
if (( ${#FILES[@]} == 0 )); then
  echo "No PMTiles files found in $OUT_DIR."
  echo "Build the India zones first with:"
  echo "  ./tools/offline-maps/build-india-zones.sh"
  exit 1
fi

run_pmtiles() {
  docker run --rm \
    -v "$OUT_DIR:/out:ro" \
    "$PMTILES_IMAGE" "$@"
}

for file in "${FILES[@]}"; do
  size="$(stat -c "%s" "$file")"
  if (( size < MIN_ARCHIVE_BYTES )); then
    echo "ERROR: $(basename "$file") is only $size bytes. Refusing to publish a tiny/empty PMTiles package."
    exit 1
  fi

  summary="$(run_pmtiles show "/out/$(basename "$file")")"
  if ! grep -Eiq "^tile type: mvt$" <<<"$summary"; then
    echo "ERROR: $(basename "$file") is not an MVT PMTiles archive."
    exit 1
  fi

  if ! grep -Eq "^tile contents count: [1-9][0-9]*$" <<<"$summary"; then
    echo "ERROR: $(basename "$file") contains no tile contents."
    exit 1
  fi

  run_pmtiles verify "/out/$(basename "$file")"
done

TOTAL_BYTES="$(du -bc "$OUT_DIR"/*.pmtiles | tail -n 1 | awk '{print $1}')"
MAX_FILE_BYTES=$((2 * 1024 * 1024 * 1024))
MAX_HOSTING_BYTES=$((8 * 1024 * 1024 * 1024))

for file in "$OUT_DIR"/*.pmtiles; do
  size="$(stat -c '%s' "$file")"
  if (( size > MAX_FILE_BYTES )); then
    echo "ERROR: $(basename "$file") is larger than Firebase Hosting's 2 GiB per-file limit."
    exit 1
  fi
done

if (( TOTAL_BYTES > MAX_HOSTING_BYTES )); then
  echo "ERROR: generated PMTiles total more than 8 GiB."
  echo "Firebase Hosting has a 10 GB no-cost storage quota; keep at least 2 GiB of headroom for the app and retained releases."
  exit 1
fi

mkdir -p "$PUBLIC_DIR"
rm -f "$PUBLIC_DIR"/*.pmtiles
cp "$OUT_DIR"/*.pmtiles "$PUBLIC_DIR/"

echo "Validated PMTiles copied to Firebase Hosting source:"
ls -lh "$PUBLIC_DIR"/*.pmtiles
echo "Total PMTiles payload: $((TOTAL_BYTES / 1024 / 1024)) MiB"

cd "$ROOT_DIR/Frontend"
echo "Building the AniRescue frontend with the PMTiles packages..."
npm run build

DIST_DIR="$ROOT_DIR/Frontend/dist/offline-maps"
echo "Verifying PMTiles survived the frontend build..."
for file in "$OUT_DIR"/*.pmtiles; do
  name="$(basename "$file")"
  dist_file="$DIST_DIR/$name"

  if [[ ! -f "$dist_file" ]]; then
    echo "ERROR: $name is missing from $DIST_DIR after the frontend build."
    echo "The Firebase deployment would otherwise fall through to the SPA index.html rewrite."
    exit 1
  fi

  source_size="$(stat -c "%s" "$file")"
  dist_size="$(stat -c "%s" "$dist_file")"

  if [[ "$source_size" != "$dist_size" ]]; then
    echo "ERROR: $name changed size during the frontend build ($source_size -> $dist_size bytes)."
    exit 1
  fi

  if ! cmp -s "$file" "$dist_file"; then
    echo "ERROR: $name in dist/ is not byte-for-byte identical to the validated source package."
    exit 1
  fi
done

ls -lh "$DIST_DIR"/*.pmtiles

echo "Deploying Firebase Hosting only..."
"${FIREBASE_CMD[@]}" deploy --only hosting

if ! command -v curl >/dev/null 2>&1; then
  echo "ERROR: curl is required for the post-deploy PMTiles smoke test."
  exit 1
fi

echo "Running post-deploy PMTiles smoke test..."
for file in "$OUT_DIR"/*.pmtiles; do
  name="$(basename "$file")"
  url="https://anirescue-a5fd7.web.app/offline-maps/$name"
  headers_file="$(mktemp)"
  body_file="$(mktemp)"
  trap 'rm -f "$headers_file" "$body_file"' RETURN

  curl -fsS -D "$headers_file" -o "$body_file" \
    -H "Range: bytes=0-126" \
    "$url"

  status="$(awk 'NR==1 {print $2}' "$headers_file")"
  content_range="$(awk 'BEGIN{IGNORECASE=1} /^content-range:/ {sub(/^content-range:[[:space:]]*/, ""); print}' "$headers_file" | tr -d '\r')"
  content_type="$(awk 'BEGIN{IGNORECASE=1} /^content-type:/ {sub(/^content-type:[[:space:]]*/, ""); print}' "$headers_file" | tr -d '\r')"

  if [[ "$status" != "206" ]]; then
    echo "ERROR: $name returned HTTP $status instead of 206 Partial Content."
    exit 1
  fi

  if [[ "$content_range" != "bytes 0-126/"* ]]; then
    echo "ERROR: $name returned an invalid Content-Range: $content_range"
    exit 1
  fi

  if [[ "$content_type" == text/html* ]]; then
    echo "ERROR: $name returned HTML instead of a PMTiles binary."
    exit 1
  fi

  if ! head -c 7 "$body_file" | cmp -s - <(printf 'PMTiles'); then
    echo "ERROR: $name does not start with the PMTiles v3 magic bytes."
    exit 1
  fi

  rm -f "$headers_file" "$body_file"
  trap - RETURN
done

echo
echo "Offline map files are now served and range-verified from:"
echo "  https://anirescue-a5fd7.web.app/offline-maps/<zone>.pmtiles"
echo
echo "The browser downloads these files once and stores them locally in IndexedDB."
