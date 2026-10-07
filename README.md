# AniRescue

AniRescue is an AI-assisted animal rescue reporting and volunteer coordination platform for emergency animal reports, AI-assisted validation, volunteer/NGO coordination, rescue evidence, realtime rescue maps, offline reporting, and notifications.

## Architecture

The project intentionally uses **two application services**:

- **Frontend:** React + Vite + PWA
- **Backend:** Node.js + Express + REST + Socket.IO
- **AI worker:** Python async worker consuming RabbitMQ jobs
- **Database:** PostgreSQL on Neon
- **Queue:** RabbitMQ
- **Images:** Cloudinary signed browser uploads
- **Push notifications:** Firebase Cloud Messaging
- **AI:** YOLO-World/OpenVINO gatekeeper + Gemini preliminary assessment
- **Offline maps:** MapLibre + PMTiles + IndexedDB

The AI worker is an asynchronous processing worker, not a third application-facing microservice.

## Development and operations

Use one command surface for development, testing, Docker, offline maps, and production gates:

`bash
make help
`

### First-time setup

`bash
make setup
`

Check the machine without changing it:

`bash
make doctor
`

### AI/ML dependencies

**Do not install YOLO-World, PyTorch, or OpenVINO directly into the host Python environment.**

The authoritative AI runtime is the production Docker image:

`bash
make ai-setup
`

Run AI tests inside that same image:

`bash
make ai-test
`

This keeps the multi-GB ML dependency stack isolated and reproducible.

### Local full stack

`bash
make stack-up
make stack-status
make stack-logs
`

Stop it with:

`bash
make stack-down
`

### Testing

`bash
make test
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

### Offline maps

`bash
make offline-build
make offline-publish
`

PMTiles are generated/validated with temporary Docker tooling and are intentionally **not committed to GitHub**.

### Production

`bash
make smoke
make preflight
make deploy
`

Production smoke checks cover the frontend, backend liveness/readiness, AI worker heartbeat, and hosted PMTiles HTTP Range support.

The production AI worker is defined in:

`
render.ai-worker.yaml
`

It uses the same `ai-async-worker/Dockerfile.worker` used for local containerized AI testing.

> **Important:** the current Render account has the AniRescue backend web service. The dedicated AI Docker worker must be provisioned from `render.ai-worker.yaml` before the production smoke gate can pass. The automation intentionally fails closed instead of declaring production healthy while the asynchronous AI worker is offline.

## Authentication

Authentication uses secure browser cookies. The long-lived session uses a server-side hashed session token with rotation and revocation; JWT access credentials are not stored in browser localStorage.

State-changing requests use a CSRF token. Production cookies require HTTPS.

Never expose database, RabbitMQ, Firebase service-account, JWT signing, Cloudinary API-secret, or Gemini credentials through frontend environment variables.

## Case processing

A rescue report follows:

`rescue_cases -> case_processing_jobs -> RabbitMQ -> AI worker -> rescue_cases`

The database outbox prevents a successful report transaction from losing its AI job when RabbitMQ is temporarily unavailable.

AI outcomes distinguish:

- `VALID_ANIMAL` — continue to Gemini/preliminary assessment
- `NO_ANIMAL` — `REJECTED_JUNK`
- `MODEL_ERROR` / infrastructure failure — retry, then `AI_PROCESSING_FAILED`

A watchdog detects stale AI jobs and makes terminal failures recoverable by an administrator.

## Database migrations

The repository contains migrations **001–016**.

Migrations **001–005** represent the historical base schema boundary. For an existing database whose original AniRescue schema already exists, set:

`MIGRATIONS_BASELINE_VERSION=5`

The runner verifies the required base tables before recording that baseline, then applies migrations 006 onward.

For a genuinely empty database, do not use the baseline shortcut: provision the complete schema through the repository's migration/bootstrap process first.

The migration runner uses a PostgreSQL advisory lock so two backend instances do not apply migrations concurrently.

## Offline reporting

The PWA stores failed/offline reports in IndexedDB and retries while the application is running. Images remain as local Blobs until upload succeeds.

This is **not** claimed as guaranteed background synchronization after the PWA is completely closed; foreground retry is the current supported fallback.

## Realtime rescue map

The rescue map uses a unified MapLibre renderer.

- REST `/api/cases/map` provides the initial RBAC-filtered snapshot.
- Socket.IO provides lightweight invalidation events.
- After an invalidation, the client re-fetches the REST snapshot.
- PostgreSQL remains the source of truth.
- Socket events intentionally do not contain case coordinates or other case data.

Role visibility remains enforced by the backend:

- USER — own active rescue cases
- VOLUNTEER — eligible unassigned cases plus assigned cases
- NGO — cases within its configured jurisdiction plus assigned cases
- ADMIN — global active case visibility

Offline reporting uses downloaded PMTiles when network connectivity is unavailable. Online reporting uses the online cached basemap.

## Health and observability

- `/health/live` — process liveness
- `/health/ready` — database + RabbitMQ readiness
- `/health/worker` — AI-worker heartbeat
- `/health/metrics` — in-memory HTTP request metrics

HTTP requests receive correlation IDs and structured request logs.

## Research evidence

The research benchmark is an **image-level gatekeeper benchmark**, not a formal mAP/IoU or clinical-accuracy study.

The controlled 1 CPU / 1 GB result is stored at:

`ai-async-worker/benchmark/results/yolo-world-openvino-1cpu-1gb.json`

The benchmark validator checks that the recorded measurements are internally consistent.

## Detailed operations guide

See:

`
docs/OPERATIONS.md
`

for the complete development, Docker, AI worker, offline map, release, production, and incident runbook.
