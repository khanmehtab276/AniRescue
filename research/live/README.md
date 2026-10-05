# Live research harness

The live harness is deliberately separate from the normal test runner because it can create real rescue/feedback/notification records.

It is only enabled with:

```bash
RESEARCH_LIVE=1 bash research/live/run_live_tests.sh
```

Required variables:

- `RESEARCH_API_BASE_URL`
- `RESEARCH_USER_EMAIL`
- `RESEARCH_USER_PASSWORD`
- `RESEARCH_IMAGE_URL`

Optional:

- `RESEARCH_TIMEOUT_MS` (default 180000)
- `RESEARCH_FCM_TOKEN` — a real Firebase Web FCM registration token for R9 push-delivery verification.

The live harness refuses to run unless `RESEARCH_API_BASE_URL` is explicitly set. It never defaults to the deployed Firebase/Render production URLs.

R4/R5 create one research rescue case using the supplied Cloudinary image URL and measure:
- HTTP report submission latency
- time until the case reaches a terminal AI state
- asynchronous processing elapsed time

R9 verifies the persisted notification and, when a real FCM token is supplied, exercises the FCM delivery path.

R10 submits feedback for the authenticated research USER.

For paper reporting, distinguish:
- component/integration evidence
- live end-to-end timing
- FCM send acceptance
- actual device receipt (which requires observing the registered client/device).
