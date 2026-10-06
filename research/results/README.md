# Research Evidence Results

This directory contains compact, paper-ready evidence summaries.

## Evidence rule

- Raw experiment traces remain under the relevant test directory (for example, `ai-async-worker/benchmark/results/`).
- Files here contain only the measurements needed for the research paper.
- Do not infer PASS from a numerical result unless the test has an explicit pass criterion.
- `MEASURED` means the experiment completed and the values are recorded.
- `PASS` / `FAIL` are reserved for functional tests with defined expected behavior.
- These summaries must match the raw experiment traces or the recorded live test output exactly.

## Current evidence

| Test | Evidence | Status |
|---|---|---|
| R1 | YOLO-World image-level gatekeeper benchmark | MEASURED |
| R2 | Worker resource usage during R1 | MEASURED |
| R3 | Gemini structured-output contract tests (9/9) | PASS |
| R4 | Live end-to-end AI validation | PASS |
| R5 | Live asynchronous submission and AI completion observation | PASS |
| R6 | Case lifecycle and rescue workflow deterministic tests | PASS |
| R7 | Role-based access-control deterministic tests | PASS |
| R8 | Geospatial coordination and NGO jurisdiction deterministic tests | PASS |
| R9 | Live volunteer notification path + visible Chrome FCM delivery | PASS |
| R10 | Live feedback persistence | PASS |

## Important interpretation notes

- R1 is an image-level gatekeeper benchmark, not a formal mAP, IoU, precision/recall, or object-detection benchmark.
- R4/R5 live completion time is an end-to-end polling observation and must not be presented as YOLO-only or Gemini-only latency.
- R6-R8 verify implemented functional rules using deterministic test cases; they are not real-world rescue outcome, security penetration, or location-accuracy measurements.
- R9 used a USER-originated rescue case and an ACTIVE, AVAILABLE volunteer with a recent location inside the configured recipient radius.
- R9 verified both notification persistence for the volunteer and visible browser FCM delivery in Chrome.
- R9 is a single controlled device-delivery observation. It does not establish an FCM delivery percentage, reliability rate, or population-wide notification performance.
- R10 records successful feedback creation for the live research case.
- The latest live R4/R5/R9/R10 evidence was recorded from case ID 12 with the local AI worker running.
- The R4/R5 live observation for case 12 was 113.96 ms HTTP submission and 10,658.39 ms end-to-end AI completion, with final status `VALIDATION_PASSED`, Gemini status `COMPLETED`, and Gemini analysis present.
