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
| R9 | Live notification persistence | PASS* |
| R10 | Live feedback persistence | PASS |

* R9 notification persistence was verified, but actual FCM device delivery was not exercised in the recorded run.

## Important interpretation notes

- R1 is an image-level gatekeeper benchmark, not a formal mAP, IoU, precision/recall, or object-detection benchmark.
- R4/R5 live completion time is an end-to-end polling observation and must not be presented as YOLO-only or Gemini-only latency.
- R9 does not establish FCM delivery reliability because no FCM device token was supplied during the recorded live run.
- The live R4/R5/R9/R10 evidence was recorded from case ID 9 with the local AI worker running.
