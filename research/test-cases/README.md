# AniRescue Research Test Suite

The research evaluation is divided by system component.

## Backend

Located under:

`Backend/test/`

Covers deterministic application behaviour:

- R6 — case lifecycle
- R7 — RBAC
- R8 — geospatial coordination
- rescue evidence authorization
- completion verification
- permanent cancellation rules

Run:

```bash
cd Backend
npm test
```

## AI worker and Gemini

Located under:

`ai-async-worker/test/`

These tests run inside the actual `anirescue-ai-worker:latest` Docker image so host Python packages are not used.

Current automated coverage:

- R1/R2 — benchmark artifact validation and recorded resource metrics
- R3 — Gemini structured-output validation
- R3 — Gemini error classification
- R3 — severity/urgency schema contract

A live Gemini API test is deliberately not included in the default suite because it would require credentials and external API calls.

## Frontend

The frontend uses its existing project checks:

```bash
cd Frontend
npm run lint
npm run build
```

These verify implementation integrity; they are not research accuracy metrics.

## Full project run

From the repository root:

```bash
bash research/run_all_tests.sh
```

This runs all safe automated checks in one command.

## Live integration tests

R4/R5/R9/R10 involve real database, RabbitMQ, FCM, API and case-processing behaviour. They must be executed only against an isolated research/test environment.

The full runner therefore reports these groups as a separate manual/live-testing stage rather than pretending that production execution is safe.

No research result should be manually entered. Record only measurements produced by actual executions.
