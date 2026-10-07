#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

FRONTEND_DIR="$ROOT_DIR/Frontend"
BACKEND_DIR="$ROOT_DIR/Backend"
WORKER_DIR="$ROOT_DIR/ai-async-worker"
PROD_BACKEND_URL="https://anirescue-backend.onrender.com"
PROD_FRONTEND_URL="https://anirescue-a5fd7.web.app"
PROD_BRANCH="research/experimental-results"

log() { printf '\n==> %s\n' "$*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

frontend_lint() {
  log "Frontend lint"
  (cd "$FRONTEND_DIR" && npm run lint)
}
frontend_build() {
  log "Frontend build"
  (cd "$FRONTEND_DIR" && npm run build)
}
frontend_e2e() {
  log "Frontend browser smoke tests"
  (cd "$FRONTEND_DIR" && npx --yes playwright@1.56.1 install --with-deps chromium >/dev/null && npm install --no-save --no-package-lock --ignore-scripts playwright@1.56.1 >/dev/null && npm run e2e)
}
backend_test() {
  log "Backend tests"
  (cd "$BACKEND_DIR" && npm test)
}
backend_syntax() {
  log "Backend JavaScript syntax"
  find "$BACKEND_DIR" -path '*/node_modules' -prune -o -name '*.js' -print0 |
    xargs -0 -n1 node --check
}
worker_test() {
  log "AI worker compile + research tests"
  python3 -m compileall -q "$WORKER_DIR"
  python3 -m unittest "$WORKER_DIR/test/test_worker_research.py"
}
research_validate() {
  log "Research benchmark validation"
  python3 "$WORKER_DIR/benchmark/validate_research_result.py"     "$WORKER_DIR/benchmark/results/yolo-world-openvino-1cpu-1gb.json"
  node --check research/live/run_live_tests.js
}
unit() {
  frontend_lint
  backend_test
  backend_syntax
  worker_test
  research_validate
}
all_tests() {
  unit
  frontend_build
}
ci() {
  all_tests
  frontend_e2e
}
offline_build() {
  log "Build offline India PMTiles"
  chmod +x tools/offline-maps/build-india-zones.sh
  tools/offline-maps/build-india-zones.sh
}
offline_publish() {
  log "Validate, build, publish and smoke-test offline PMTiles"
  chmod +x tools/offline-maps/publish-firebase-hosting.sh
  tools/offline-maps/publish-firebase-hosting.sh
}
production_smoke() {
  command -v curl >/dev/null 2>&1 || die "curl is required"
  log "Production frontend"
  curl -fsS --retry 3 --retry-delay 2 "$PROD_FRONTEND_URL/" >/dev/null
  log "Production backend liveness"
  curl -fsS --retry 3 --retry-delay 2 "$PROD_BACKEND_URL/health/live" >/dev/null
  log "Production backend readiness"
  curl -fsS --retry 3 --retry-delay 2 "$PROD_BACKEND_URL/health/ready" >/dev/null
  log "Production PMTiles range checks"
  zones="western-india central-india northern-india eastern-india southern-india north-eastern-india"
  for zone in $zones; do
    tmp="$(mktemp)"
    headers="$(mktemp)"
    curl -fsS --retry 3 --retry-delay 2 -D "$headers" -o "$tmp"       -H "Range: bytes=0-126"       "$PROD_FRONTEND_URL/offline-maps/$zone.pmtiles"
    status="$(awk 'NR==1 {print $2}' "$headers")"
    range="$(awk 'BEGIN{IGNORECASE=1} /^content-range:/ {sub(/^content-range:[[:space:]]*/, ""); print}' "$headers" | tr -d '\r')"
    [ "$status" = "206" ] || die "$zone.pmtiles returned HTTP $status instead of 206"
    [[ "$range" == bytes\ 0-126/* ]] || die "$zone.pmtiles returned invalid Content-Range: $range"
    [ "$(wc -c < "$tmp")" -eq 127 ] || die "$zone.pmtiles did not return exactly 127 header bytes"
    head -c 7 "$tmp" | cmp -s - <(printf 'PMTiles') || die "$zone.pmtiles does not start with PMTiles magic bytes"
    rm -f "$tmp" "$headers"
    echo "✓ $zone.pmtiles"
  done
}
production_preflight() {
  command -v git >/dev/null 2>&1 || die "git is required"
  command -v node >/dev/null 2>&1 || die "node is required"
  command -v npm >/dev/null 2>&1 || die "npm is required"
  command -v python3 >/dev/null 2>&1 || die "python3 is required"
  command -v curl >/dev/null 2>&1 || die "curl is required"
  log "Production branch"
  current_branch="$(git branch --show-current)"
  [ "$current_branch" = "$PROD_BRANCH" ] || die "Production commands require $PROD_BRANCH; currently on $current_branch."
  log "Working tree"
  [ -z "$(git status --porcelain)" ] || die "Working tree is not clean."
  log "Remote synchronization"
  git fetch origin "$PROD_BRANCH" --quiet
  local_sha="$(git rev-parse HEAD)"
  remote_sha="$(git rev-parse "origin/$PROD_BRANCH")"
  [ "$local_sha" = "$remote_sha" ] || die "Local HEAD does not match origin/$PROD_BRANCH."
  log "Production preflight tests"
  all_tests
  production_smoke
}
production_deploy() {
  production_preflight
  offline_publish
  production_smoke
}
help() {
  cat <<'EOF'
AniRescue operations

Usage:
  ./tools/ops/anirescue.sh <command>

test              Fast project tests + frontend production build
ci                Full CI-equivalent checks including browser E2E
frontend-lint     Frontend ESLint
frontend-build    Frontend production build
frontend-e2e      Frontend Playwright smoke tests
backend-test      Backend Node tests
worker-test       AI worker compile + research tests
research-test     Research benchmark validation + harness syntax
offline-build     Generate/validate regional PMTiles locally
offline-publish   Validate, build, deploy and smoke-test PMTiles
smoke             Check live frontend, backend and all six PMTiles ranges
preflight         Clean/synchronized production branch + tests + smoke checks
deploy            Preflight, publish offline maps, then verify production
EOF
}
if [ "$#" -eq 0 ]; then
  help
  exit 0
fi

case "$1" in
  test) unit; frontend_build ;;
  ci) ci ;;
  frontend-lint) frontend_lint ;;
  frontend-build) frontend_build ;;
  frontend-e2e) frontend_e2e ;;
  backend-test) backend_test ;;
  worker-test) worker_test ;;
  research-test) research_validate ;;
  offline-build) offline_build ;;
  offline-publish) offline_publish ;;
  smoke) production_smoke ;;
  preflight) production_preflight ;;
  deploy) production_deploy ;;
  help|-h|--help|"") help ;;
  *) die "Unknown command: $1" ;;
esac
