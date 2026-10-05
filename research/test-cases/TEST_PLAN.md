# AniRescue Research Evaluation Test Plan

## Purpose

This branch contains the experimental test plan used to produce the measurable results for the AniRescue research paper. The tests are separated from `main` so that experimental tooling and result artifacts can be reviewed before merging.

The results must be generated from actual executions. No accuracy, latency, notification-delivery, or end-to-end numbers should be manually entered.

## Implementation status

All R1-R10 now have executable coverage on this research branch:

- R1/R2: benchmark artifact validation and recorded resource metrics.
- R3: Gemini contract tests plus a guarded live case/Gemini observation path.
- R4/R5: worker pipeline contract tests plus a guarded live API-to-AI timing harness.
- R6/R7/R8: deterministic backend lifecycle, RBAC, and geospatial tests.
- R9: notification recipient/persistence tests plus guarded live notification/FCM-token path.
- R10: feedback validation/persistence tests plus guarded live USER submission.

The guarded live harness requires an explicitly supplied isolated research API and test image. It never defaults to the deployed production URLs.

## Test groups

| ID | Test group | What is measured | Evidence |
|---|---|---|---|
| R1 | YOLO-World/OpenVINO gatekeeper | image-level accuracy, false positives, false negatives, mean/median/P95 inference | JSON benchmark + summary table |
| R2 | AI resource usage | peak RSS, cgroup memory, CPU usage | benchmark JSON |
| R3 | Gemini analysis | successful analyses, failures by category, response time | worker/test log |
| R4 | End-to-end AI case processing | submitted cases reaching final AI state, elapsed processing time | backend DB/log export |
| R5 | Asynchronous processing | HTTP submission time compared with background AI completion time | API timing + worker timestamps |
| R6 | Case lifecycle | valid/invalid state transitions | automated backend tests |
| R7 | RBAC | permitted and rejected role/action combinations | automated backend tests |
| R8 | Geospatial coordination | Haversine distance and jurisdiction/nearby eligibility behaviour | automated backend tests + API tests |
| R9 | FCM notification flow | notification attempts and successful receipt in controlled tests | backend/FCM logs + screenshots |
| R10 | Feedback feature | role permissions and successful submission/retrieval | API tests |

## R1/R2: AI benchmark

The existing 100-image manifest is used as the controlled image-level gatekeeper benchmark. The benchmark is explicitly **not** a formal object-detection mAP/IoU evaluation.

Required reported metrics:

- number of images tested
- image-level accuracy
- false positives
- false negatives
- mean inference time
- median inference time
- P95 inference time
- peak process RSS
- peak cgroup memory, when available
- average CPU, when available

The current repository already contains a YOLO-World/OpenVINO result artifact. It must be treated as an existing baseline and rerun when a fresh experimental result is required.

## R3: Gemini

Run Gemini only after YOLO validation succeeds, using the real worker configuration. Record:

- number of YOLO-passed cases sent to Gemini
- successful structured responses
- `NOT_CONFIGURED`
- `QUOTA_EXHAUSTED`
- `AUTH_ERROR`
- `TIMEOUT`
- `API_ERROR`
- average and median Gemini response time

Do not interpret Gemini severity/urgency as a veterinary diagnostic accuracy score.

## R4/R5: end-to-end and asynchronous behaviour

Use controlled rescue cases with known test images and timestamps. Record:

1. API request start timestamp.
2. API response timestamp.
3. case-processing-job creation timestamp.
4. worker pickup timestamp.
5. YOLO completion timestamp.
6. Gemini completion timestamp, when configured.
7. final database update timestamp.
8. notification publication timestamp.

Calculate API response latency separately from background AI processing latency. This prevents the model's inference time from being incorrectly presented as synchronous API latency.

## R6-R10: functional evaluation

The automated backend suite verifies deterministic rules without production services. Live-service tests are implemented separately and must be run against an isolated test environment. The normal root runner does not enable them automatically.

The paper should report both:

- deterministic automated functional tests, and
- controlled live integration tests, where available.

## Paper reporting rules

- Include the test environment (CPU, RAM, OS, runtime/model settings).
- State dataset size and sources.
- State confidence threshold and input resolution for the AI benchmark.
- Report actual numbers only.
- Explain false negatives and limitations instead of hiding them.
- Do not convert a functional pass rate into ML precision/recall/mAP.
- Screenshots can be added later as implementation evidence, but numerical tables remain the primary experimental results.
