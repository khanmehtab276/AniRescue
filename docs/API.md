# AniRescue API Reference

Base URL: `https://anirescue-backend.onrender.com`

All protected routes use the browser session cookie. State-changing requests also require the CSRF token in `X-CSRF-Token`.

## Health

| Method | Route | Purpose |
|---|---|---|
| GET | `/health/live` | Process liveness |
| GET | `/health/ready` | PostgreSQL + RabbitMQ readiness |
| GET | `/health/worker` | Informational AI worker heartbeat |
| GET | `/health/metrics` | In-memory HTTP request metrics |
| GET | `/health` | Compatibility health endpoint |

## Authentication

| Method | Route | Access |
|---|---|---|
| POST | `/api/auth/register` | Public |
| POST | `/api/auth/login` | Public |
| GET | `/api/auth/me` | Authenticated |
| GET | `/api/auth/csrf` | Authenticated |
| POST | `/api/auth/logout` | Session cookie |
| PUT | `/api/auth/jurisdiction` | NGO |
| PUT | `/api/auth/availability` | VOLUNTEER |
| PUT | `/api/auth/location` | VOLUNTEER |
| POST | `/api/auth/device-token` | Authenticated |

## Rescue cases

| Method | Route | Access |
|---|---|---|
| POST | `/api/cases/upload-signature` | USER/VOLUNTEER/NGO/ADMIN |
| POST | `/api/cases/report` | USER/VOLUNTEER/NGO/ADMIN |
| GET | `/api/cases/admin/junk` | NGO/ADMIN |
| PUT | `/api/cases/:id/retry-ai` | ADMIN |
| PUT | `/api/cases/:id/verify-junk` | NGO/ADMIN |
| GET | `/api/cases/:id/nearby-volunteers` | NGO/ADMIN |
| GET | `/api/cases/volunteer/available` | VOLUNTEER/ADMIN |
| GET | `/api/cases/mine` | All authenticated roles |
| PUT | `/api/cases/:id/claim` | VOLUNTEER/NGO/ADMIN |
| PUT | `/api/cases/:id/assign` | NGO/ADMIN |
| PUT | `/api/cases/:id/release` | VOLUNTEER |
| PUT | `/api/cases/:id/cancel` | ADMIN |
| PUT | `/api/cases/:id/complete` | VOLUNTEER/NGO/ADMIN |
| PUT | `/api/cases/:id/verify-completion` | NGO/ADMIN |
| PUT | `/api/cases/:id/priority` | NGO/ADMIN |
| GET | `/api/cases/verification-queue` | NGO/ADMIN |
| GET | `/api/cases/map` | All authenticated roles |
| GET | `/api/cases/` | VOLUNTEER/NGO/ADMIN |
| GET | `/api/cases/:id` | All authenticated roles |

## Notifications

| Method | Route | Access |
|---|---|---|
| GET | `/api/notifications/` | Authenticated |
| PATCH | `/api/notifications/read-all` | Authenticated |
| PATCH | `/api/notifications/:id/read` | Authenticated |

## Feedback

| Method | Route | Access |
|---|---|---|
| POST | `/api/feedback/` | USER/VOLUNTEER/NGO/ADMIN |
| GET | `/api/feedback/mine` | USER/VOLUNTEER/NGO/ADMIN |
| GET | `/api/feedback/` | ADMIN |

## Administration

| Method | Route | Access |
|---|---|---|
| GET | `/api/admin/users` | ADMIN |
| PUT | `/api/admin/users/:id/status` | ADMIN |

## Important contracts

### Report submission

The report endpoint expects:

```json
{
  "clientRequestId": "uuid",
  "location": {
    "lat": 19.1,
    "lng": 73.0,
    "address": "Optional landmark/address",
    "isCustom": false
  },
  "description": "Optional rescue context",
  "imageUrl": "https://res.cloudinary.com/..."
}
```

The server validates the UUID, coordinates, description length, HTTPS Cloudinary host/cloud/folder, and uses `(reporter_id, client_request_id)` for idempotency.

### AI status semantics

- `VALID_ANIMAL` → rescue case can continue to Gemini preliminary assessment.
- `NO_ANIMAL` → `REJECTED_JUNK`.
- Model/infrastructure failure → bounded retry → `AI_PROCESSING_FAILED`.
- `AI_PROCESSING_FAILED` can be retried by an administrator.

### Authentication lifecycle

The access JWT is short-lived. A long-lived, hashed, server-side session token is stored in the database and rotated when the access token expires. Logout revokes the server-side session and clears browser cookies.

## Security notes

- Do not put JWTs or backend secrets in frontend storage.
- Do not accept arbitrary image URLs; rescue images must come from the approved Cloudinary upload flow.
- Exact rescue coordinates are only exposed through authenticated, role-aware endpoints.
- CORS is allow-list based in production.
- Rate limiting is applied to authentication and report/upload entry points.
