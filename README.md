# AniRescue

AniRescue is an AI-assisted animal rescue reporting and volunteer coordination platform.

## Production architecture

- Frontend: React + Vite + PWA
- API: Node.js + Express
- Database: PostgreSQL / Neon
- Queue: RabbitMQ
- AI worker: Python + YOLO
- Images: Cloudinary signed uploads
- Notifications: Firebase Cloud Messaging
- Deployment: Docker Compose or equivalent managed services

## Security model

Browser authentication uses an HttpOnly session cookie. The browser also receives a separate CSRF token cookie, which is sent in the X-CSRF-Token header for state-changing requests. Production session cookies use Secure, SameSite=None, and the __Host- prefix because the hosted frontend and API may be on different sites. Keep both frontend and API on HTTPS.

Do not put JWTs, Cloudinary API secrets, Firebase service-account credentials, database credentials, or RabbitMQ credentials into frontend environment variables.

## Required production environment

Backend:
- NODE_ENV=production
- PORT=3000
- DATABASE_URL
- RABBITMQ_URL
- JWT_SECRET — at least 32 random characters
- CORS_ORIGIN — exact frontend origin(s), comma-separated
- CLOUDINARY_CLOUD_NAME
- CLOUDINARY_API_KEY
- CLOUDINARY_API_SECRET
- MIGRATIONS_BASELINE_VERSION=5 for an existing database that already contains the original AniRescue schema
- Firebase Admin credentials through FIREBASE_SERVICE_ACCOUNT_JSON or a protected server-side file path

Frontend:
- VITE_API_URL when the API is not served from the same origin

## Database migration requirement

The repository contains migrations 001–008, but the original pre-migration AniRescue base schema is not represented as a clean, empty-database bootstrap migration.

For an existing AniRescue database:
1. Set MIGRATIONS_BASELINE_VERSION=5.
2. Start the backend.
3. The migration runner verifies the required existing base tables before recording versions 1–5.
4. Migrations 006–008 are then applied automatically.

For a brand-new database, provision the original base schema first. Do not point production at an empty PostgreSQL database and expect the baseline setting to create the application schema.

## Image upload flow

1. Authenticated client asks the API for a short-lived Cloudinary signature.
2. API signs the upload using the Cloudinary API secret.
3. Browser uploads directly to Cloudinary over HTTPS.
4. API accepts only HTTPS Cloudinary URLs belonging to the configured cloud.
5. AI worker downloads the image with strict redirect, size, and pixel limits.

## AI processing reliability

Case creation and AI processing use a database outbox:
rescue_cases -> case_processing_jobs -> RabbitMQ -> YOLO worker

This prevents a successful database transaction from losing its AI job because RabbitMQ was temporarily unavailable.

The worker is idempotent: duplicate RabbitMQ delivery cannot create a second AI validation result.

## Health endpoints

- GET /health/live — process liveness
- GET /health/ready — database + RabbitMQ readiness
- GET /health — compatibility health endpoint

Production load balancers should use /health/ready for readiness and /health/live for liveness.

## Verification

Before release:

    cd Frontend
    npm ci
    npm run lint
    npm run build

    cd ../Backend
    npm ci
    npm test

The repository CI runs frontend lint/build, backend tests/syntax checks, and Python worker compilation.

## Release rule

Deploy the frontend and backend changes together. The authentication contract uses browser cookies, so deploying only one side can leave users unable to authenticate.

Use a staging deployment with production-like HTTPS, CORS, PostgreSQL, RabbitMQ, Cloudinary, and Firebase settings before switching the public production frontend.
