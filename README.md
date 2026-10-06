# AniRescue

AniRescue is an AI-assisted animal rescue reporting and volunteer coordination platform for emergency animal reports, AI-assisted validation, volunteer/NGO coordination, rescue evidence, and notifications.

## Architecture

The project intentionally uses **two application services**:

- **Frontend:** React + Vite + PWA
- **Backend:** Node.js + Express
- **AI worker:** Python async worker consuming RabbitMQ jobs
- **Database:** PostgreSQL on Neon
- **Queue:** RabbitMQ
- **Images:** Cloudinary signed browser uploads
- **Push notifications:** Firebase Cloud Messaging
- **AI:** YOLO-World/OpenVINO gatekeeper + Gemini preliminary assessment

The AI worker is an asynchronous processing worker, not a third application-facing microservice.

## Authentication

Authentication uses secure browser cookies. The long-lived session uses a server-side hashed session token with rotation and revocation; JWT access credentials are not stored in browser localStorage.

State-changing requests use a CSRF token. Production cookies require HTTPS.

Never expose database, RabbitMQ, Firebase service-account, JWT signing, Cloudinary API-secret, or Gemini credentials through frontend environment variables.

## Case processing

A rescue report follows the durable path:

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

## Health and observability

- `/health/live` — process liveness
- `/health/ready` — database + RabbitMQ readiness
- `/health/worker` — informational AI-worker heartbeat
- `/health/metrics` — in-memory HTTP request metrics

HTTP requests receive correlation IDs and structured request logs.

## Research evidence

The research benchmark is an **image-level gatekeeper benchmark**, not a formal mAP/IoU or clinical-accuracy study.

The controlled 1 CPU / 1 GB result is stored at:

`ai-async-worker/benchmark/results/yolo-world-openvino-1cpu-1gb.json`

The benchmark validator checks that the recorded measurements are internally consistent.

## Verification

Before release:

```bash
cd Frontend
npm ci
npm run lint
npm run build
npm run e2e

cd ../Backend
npm ci
npm test
```

CI also compiles the Python worker and validates the controlled research benchmark.

## Deployment

The backend is deployed from the `research/experimental-results` branch to Render. The hosted frontend is deployed separately through Firebase Hosting.

Deploy frontend and backend authentication changes together because the browser/API cookie contract spans both sides.
