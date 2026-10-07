
# AniRescue Engineering & Operations Runbook

This is the canonical day-to-day guide for developing, testing, running, releasing, and operating AniRescue.

## 1. Architecture

AniRescue has two application services:

1. **Backend** — Node.js/Express API, authentication, case state, REST map snapshot, Socket.IO realtime invalidation, notification consumer/dispatcher/watchdog.
2. **AI worker** — Python RabbitMQ consumer running YOLO-World/OpenVINO and Gemini assessment asynchronously.

Supporting infrastructure:

- Neon PostgreSQL
- CloudAMQP RabbitMQ
- Firebase Hosting
- Firebase Cloud Messaging
- Cloudinary
- Docker for the AI worker and local full-stack development
- PMTiles for large offline map packages

The AI worker is intentionally containerized because its ML runtime is large and CPU/runtime-sensitive.

## 2. Dependency policy

### Host machine

Install only development tooling and normal application dependencies:

- Node.js / npm
- Python 3
- Git
- Docker + Docker Compose
- curl

Node dependencies are installed from committed lockfiles:

`bash
make install
`

### AI/ML runtime

Do **not** install YOLO-World, PyTorch, OpenVINO, or the production ML runtime into the host Python environment.

The authoritative AI runtime is:

`
ai-async-worker/Dockerfile.worker
`

It builds CPU-only PyTorch, Ultralytics, CLIP build tooling, OpenVINO, application Python dependencies, the fixed AniRescue YOLO-World vocabulary, and the exported OpenVINO model.

Build it with:

`bash
make ai-setup
`

This can download multiple GB of dependencies and model data. It is expected to be a one-time Docker image build per machine/cache, not something run on every test.

## 3. First-time developer setup

From the repository root:

`bash
make setup
`

`make setup` checks required tools, installs Backend/Frontend dependencies with `npm ci`, creates a local `.env` template when absent, and prepares the pinned Playwright browser.

Check the environment without changing it:

`bash
make doctor
`

## 4. Normal testing

Fast test:

`bash
make test
`

Full CI-equivalent test:

`bash
make ci
`

Individual checks:

`bash
make frontend-lint
make frontend-build
make frontend-e2e
make backend-test
make worker-test
make research-test
`

## 5. AI worker testing

Lightweight source tests:

`bash
make worker-test
`

These do not install the heavy ML stack.

Containerized AI tests:

`bash
make ai-test
`

This builds `yolo_worker` from `ai-async-worker/Dockerfile.worker`, runs the worker research tests inside that production runtime image, and removes the temporary test container.

This is the correct test when validating the actual Docker ML runtime.

## 6. Local full-stack Docker environment

The repository `docker-compose.yml` defines:

- `rabbitmq`
- `backend`
- `yolo_worker`

Start:

`bash
make stack-up
`

Status:

`bash
make stack-status
`

Logs:

`bash
make stack-logs
make stack-logs yolo_worker
`

Stop:

`bash
make stack-down
`

The root `.env` is used by Compose. The AI worker receives its RabbitMQ, Neon, Cloudinary, Gemini, and YOLO-World/OpenVINO runtime settings through Compose.

The production model is baked into the Docker image during image build. It is not downloaded on every container startup.

## 7. Offline maps

Build:

`bash
make offline-build
`

Publish:

`bash
make offline-publish
`

The publishing pipeline validates PMTiles, verifies archives, enforces size limits, copies them to Hosting assets, builds the frontend, verifies they survived into `dist/`, deploys Firebase Hosting, and performs HTTP Range/magic-byte smoke tests.

Generated multi-GB PMTiles are intentionally ignored by Git.

## 8. Production verification

`bash
make smoke
`

This verifies the Firebase frontend, Render backend liveness/readiness, AI worker heartbeat, and all six hosted PMTiles Range responses.

The AI worker check is intentionally fail-closed: a healthy API is not sufficient if the asynchronous AI consumer is offline.

## 9. Production preflight and deployment

`bash
make preflight
`

The gate requires:

- branch = `research/experimental-results`
- clean working tree
- local HEAD exactly matches the remote production branch
- complete automated tests pass
- production smoke checks pass

Then:

`bash
make deploy
`

This repeats preflight, publishes offline maps, and performs a final production smoke test.

## 10. Production AI worker

The repository includes:

`
render.ai-worker.yaml
`

This defines a dedicated Render background worker using:

`
ai-async-worker/Dockerfile.worker
`

The worker should use a production resource class appropriate for the ML runtime. The Blueprint defaults to a 2 GB / 1 CPU class because the worker's documented envelope is larger than a tiny/free worker.

The Blueprint does not silently modify the Render account. It is an infrastructure-as-code definition that must be applied to the intended Render workspace and supplied with production secrets.

Required secrets include:

- `DATABASE_URL`
- `RABBITMQ_URL`
- `GEMINI_API_KEY`
- `CLOUDINARY_CLOUD_NAME`

The current Render account has the AniRescue backend web service. A dedicated AI Docker worker must be provisioned before the production smoke gate can pass.

## 11. Release checklist

Before release:

`bash
make ci
make preflight
`

Confirm tests, E2E, research validation, backend readiness, AI worker heartbeat, and PMTiles checks all pass.

Only then:

`bash
make deploy
`

## 12. Incident checks

Backend:

`bash
curl -fsS https://anirescue-backend.onrender.com/health/live
curl -fsS https://anirescue-backend.onrender.com/health/ready
`

AI worker:

`bash
curl -fsS https://anirescue-backend.onrender.com/health/worker
`

Expected worker status is `"online"`. If offline, inspect the dedicated worker logs and verify RabbitMQ, Neon, Cloudinary, Gemini, and Docker runtime configuration. Do not repeatedly restart the backend to fix a worker failure.

Offline map header check:

`bash
curl -sS -D - -o /tmp/map-header \
  -H "Range: bytes=0-126" \
  https://anirescue-a5fd7.web.app/offline-maps/western-india.pmtiles
`

Expected response includes HTTP 206 and `Content-Range: bytes 0-126/<size>`; the first seven bytes must be `PMTiles`.

## 13. Never commit

Never commit:

- `.env`
- service-account credentials
- API keys
- JWT secrets
- Cloudinary secrets
- Gemini keys
- local tokens
- multi-GB PMTiles
- generated ML model caches
- Python virtual environments
- `node_modules`

## 14. Golden rule

`
source code
   ↓
reproducible dependencies
   ↓
tests
   ↓
Dockerized AI runtime
   ↓
production preflight
   ↓
deployment
   ↓
health + worker + map smoke tests
`

If a production dependency is required by the AI worker, it belongs in the worker Docker image and should be validated there—not installed manually on the host.
