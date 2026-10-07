#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

FRONTEND_DIR="$ROOT_DIR/Frontend"
BACKEND_DIR="$ROOT_DIR/Backend"
WORKER_DIR="$ROOT_DIR/ai-async-worker"
PROD_BACKEND_URL="${PROD_BACKEND_URL:-https://anirescue-backend.onrender.com}"
PROD_FRONTEND_URL="${PROD_FRONTEND_URL:-https://anirescue-a5fd7.web.app}"
PROD_BRANCH="research/experimental-results"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
FIREBASE_CLI_VERSION="${FIREBASE_CLI_VERSION:-15.30.1}"
PLAYWRIGHT_VERSION="${PLAYWRIGHT_VERSION:-1.56.1}"

log() { printf '\n==> %s\n' "$*"; }
die() { echo "ERROR: $*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

require() {
  have "$1" || die "$1 is required. Run 'make doctor' for the dependency report."
}

docker_compose() {
  require docker
  docker compose -f "$COMPOSE_FILE" "$@"
}

frontend_lint() {
  log "Frontend lint"
  (cd "$FRONTEND_DIR" && npm run lint)
}

frontend_build() {
  log "Frontend production build"
  (cd "$FRONTEND_DIR" && npm run build)
}

frontend_e2e() {
  log "Frontend browser smoke tests"
  (
    cd "$FRONTEND_DIR"
    npx --yes "playwright@$PLAYWRIGHT_VERSION" install --with-deps chromium >/dev/null
    npm install --no-save --no-package-lock --ignore-scripts "playwright@$PLAYWRIGHT_VERSION" >/dev/null
    npm run e2e
  )
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
  log "AI worker source/research tests (host, no ML runtime installation)"
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

setup() {
  log "Checking required development tools"
  doctor

  log "Installing locked Node.js dependencies"
  (cd "$BACKEND_DIR" && npm ci)
  (cd "$FRONTEND_DIR" && npm ci)

  if [[ ! -f "$ROOT_DIR/.env" ]]; then
    cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
    echo "Created .env from .env.example. Edit it before starting Docker Compose."
  fi

  log "Installing browser used by E2E tests"
  frontend_e2e >/dev/null

  cat <<'EOF'

Setup complete.

Normal application dependencies are installed on the host.
The heavy AI/ML runtime is intentionally NOT installed into the host Python
environment. Build it in Docker with:

  make ai-setup

Then run the complete local Docker stack with:

  make stack-up

EOF
}

install_deps() {
  log "Synchronizing project dependencies from lockfiles"
  (cd "$BACKEND_DIR" && npm ci)
  (cd "$FRONTEND_DIR" && npm ci)
  echo "AI/ML runtime dependencies are Docker-managed; use 'make ai-setup'."
}

doctor() {
  log "AniRescue development environment"
  local failed=0

  for cmd in git node npm python3 curl; do
    if have "$cmd"; then
      printf '✓ %-10s %s\n' "$cmd" "$($cmd --version 2>&1 | head -n1)"
    else
      printf '✗ %-10s missing\n' "$cmd"
      failed=1
    fi
  done

  if have docker; then
    printf '✓ %-10s %s\n' docker "$(docker --version)"
    if docker compose version >/dev/null 2>&1; then
      printf '✓ %-10s %s\n' "compose" "$(docker compose version)"
    else
      echo "✗ Docker Compose plugin is missing"
      failed=1
    fi
  else
    echo "✗ docker      missing (required for AI image/Compose stack)"
    failed=1
  fi

  if have npx; then
    echo "✓ npx        available (Firebase CLI is run reproducibly via npx)"
  fi

  echo
  echo "Project dependency policy:"
  echo "  - Backend/Frontend: npm ci from committed lockfiles."
  echo "  - AI/ML: Docker image only; do not install YOLO-World/PyTorch/OpenVINO on the host."
  echo "  - Offline PMTiles tooling: temporary Docker CLI container."
  echo "  - Firebase CLI: npx firebase-tools@$FIREBASE_CLI_VERSION."
  echo

  return "$failed"
}

ai_image() {
  log "Building the production AI worker image"
  require docker
  docker_compose build yolo_worker
}

ai_setup() {
  ai_image
  log "AI worker image ready"
  docker images --format 'table {{.Repository}}\t{{.Tag}}\t{{.Size}}' | grep -E 'anirescue|REPOSITORY' || true
}

ai_test() {
  log "Building AI worker image before containerized tests"
  ai_image
  log "Running AI worker research tests inside the production runtime image"
  docker_compose run --rm --no-deps yolo_worker     python -m unittest discover -s test -p 'test_worker_research.py'
}

stack_up() {
  require docker
  [[ -f "$ROOT_DIR/.env" ]] || die ".env is missing. Run 'make setup' and configure it first."
  log "Starting the complete local Docker stack"
  docker_compose up -d --build
  docker_compose ps
}

stack_down() {
  log "Stopping the local Docker stack"
  docker_compose down
}

stack_status() {
  log "Local Docker stack status"
  docker_compose ps
}

stack_logs() {
  local service="${2:-}"
  if [[ -n "$service" ]]; then
    docker_compose logs --tail=200 -f "$service"
  else
    docker_compose logs --tail=200 -f
  fi
}

docker_clean() {
  log "Removing stopped AniRescue containers"
  docker_compose rm -f
}

offline_build() {
  log "Build offline India PMTiles"
  require docker
  tools/offline-maps/build-india-zones.sh
}

offline_publish() {
  log "Validate, build, publish and smoke-test offline PMTiles"
  require docker
  (
    export FIREBASE_CLI_VERSION
    tools/offline-maps/publish-firebase-hosting.sh
  )
}

production_smoke() {
  require curl
  require python3

  log "Production frontend"
  curl -fsS --retry 3 --retry-delay 2 "$PROD_FRONTEND_URL/" >/dev/null

  log "Production backend liveness"
  curl -fsS --retry 3 --retry-delay 2 "$PROD_BACKEND_URL/health/live" >/dev/null

  log "Production backend readiness"
  curl -fsS --retry 3 --retry-delay 2 "$PROD_BACKEND_URL/health/ready" >/dev/null

  log "Production AI worker heartbeat"
  worker_json="$(curl -fsS --retry 3 --retry-delay 2 "$PROD_BACKEND_URL/health/worker")"
  python3 - "$worker_json" <<'PY'
import json
import sys
payload = json.loads(sys.argv[1])
if payload.get("status") != "online":
    raise SystemExit(f"AI worker is not online: {payload.get('status')}")
print("✓ AI worker heartbeat is online")
PY

  log "Production PMTiles range checks"
  zones="western-india central-india northern-india eastern-india southern-india north-eastern-india"
  for zone in $zones; do
    tmp="$(mktemp)"
    headers="$(mktemp)"
    trap 'rm -f "$tmp" "$headers"' RETURN

    curl -fsS --retry 3 --retry-delay 2 -D "$headers" -o "$tmp"       -H "Range: bytes=0-126"       "$PROD_FRONTEND_URL/offline-maps/$zone.pmtiles"

    status="$(awk 'NR==1 {print $2}' "$headers")"
    range="$(awk 'BEGIN{IGNORECASE=1} /^content-range:/ {sub(/^content-range:[[:space:]]*/, ""); print}' "$headers" | tr -d '\r')"

    [ "$status" = "206" ] || die "$zone.pmtiles returned HTTP $status instead of 206"
    [[ "$range" == bytes\ 0-126/* ]] || die "$zone.pmtiles returned invalid Content-Range: $range"
    [ "$(wc -c < "$tmp")" -eq 127 ] || die "$zone.pmtiles did not return exactly 127 header bytes"
    head -c 7 "$tmp" | cmp -s - <(printf 'PMTiles') || die "$zone.pmtiles does not start with PMTiles magic bytes"

    rm -f "$tmp" "$headers"
    trap - RETURN
    echo "✓ $zone.pmtiles"
  done
}

production_preflight() {
  for cmd in git node npm python3 curl; do require "$cmd"; done

  log "Production branch"
  current_branch="$(git branch --show-current)"
  [ "$current_branch" = "$PROD_BRANCH" ] ||
    die "Production commands require $PROD_BRANCH; currently on $current_branch."

  log "Working tree"
  [ -z "$(git status --porcelain)" ] || die "Working tree is not clean."

  log "Remote synchronization"
  git fetch origin "$PROD_BRANCH" --quiet
  local_sha="$(git rev-parse HEAD)"
  remote_sha="$(git rev-parse "origin/$PROD_BRANCH")"
  [ "$local_sha" = "$remote_sha" ] ||
    die "Local HEAD does not match origin/$PROD_BRANCH."

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
AniRescue production-grade operations

DEVELOPMENT
  make setup             Bootstrap host dependencies + E2E browser; creates .env template
  make doctor            Diagnose required tools without changing the machine
  make install           Re-sync Backend/Frontend lockfile dependencies
  make test              Unit/source tests + frontend production build
  make ci                Full local CI-equivalent checks including E2E

AI / DOCKER
  make ai-setup          Build the heavy production AI worker image
  make ai-test           Run AI worker tests inside that Docker runtime
  make stack-up          Build/start RabbitMQ + Backend + AI worker
  make stack-down        Stop the local Compose stack
  make stack-status      Show Compose service status
  make stack-logs        Follow all logs; use 'make stack-logs SERVICE=yolo_worker'
  make docker-clean      Remove stopped Compose containers

INDIVIDUAL TESTS
  make frontend-lint     ESLint
  make frontend-build    Production frontend build
  make frontend-e2e      Playwright browser tests
  make backend-test      Backend tests
  make worker-test       Worker compile/research tests without ML installation
  make research-test     Research benchmark/harness validation

OFFLINE MAPS
  make offline-build     Generate/validate regional PMTiles with temporary Docker
  make offline-publish   Publish PMTiles to Firebase Hosting and range-smoke-test

PRODUCTION
  make smoke             Frontend + backend + AI worker heartbeat + PMTiles checks
  make preflight         Clean/synchronized production branch + complete checks
  make deploy            Preflight + offline map publish + final production smoke

Important:
  Heavy YOLO-World/PyTorch/OpenVINO dependencies belong in Docker.
  'make setup' intentionally does NOT install those GB-scale dependencies on the host.
  The current Render account has the AniRescue backend service; a dedicated production
  Docker worker must be provisioned before the production smoke gate can pass.
EOF
}

case "${1:-help}" in
  setup) setup ;;
  doctor) doctor ;;
  install) install_deps ;;
  test) unit; frontend_build ;;
  ci) ci ;;
  frontend-lint) frontend_lint ;;
  frontend-build) frontend_build ;;
  frontend-e2e) frontend_e2e ;;
  backend-test) backend_test ;;
  worker-test) worker_test ;;
  research-test) research_validate ;;
  ai-image|ai-setup) ai_setup ;;
  ai-test) ai_test ;;
  stack-up) stack_up ;;
  stack-down) stack_down ;;
  stack-status) stack_status ;;
  stack-logs) stack_logs "$@" ;;
  docker-clean) docker_clean ;;
  offline-build) offline_build ;;
  offline-publish) offline_publish ;;
  smoke) production_smoke ;;
  preflight) production_preflight ;;
  deploy) production_deploy ;;
  help|-h|--help) help ;;
  *) die "Unknown command: $1" ;;
esac
