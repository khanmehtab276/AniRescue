# Research Evidence Results

This directory contains compact, paper-ready evidence summaries.

## Evidence rule

- Raw experiment traces remain under the relevant test directory (for example, `ai-async-worker/benchmark/results/`).
- Files here contain only the measurements needed for the research paper.
- Do not infer PASS from a numerical result unless the test has an explicit pass criterion.
- `MEASURED` means the experiment completed and the values are recorded.
- `PASS` / `FAIL` are reserved for functional tests with defined expected behavior.
- These summaries must match the raw experiment traces exactly.

## Current evidence

| Test | Evidence | Status |
|---|---|---|
| R1 | YOLO-World image-level gatekeeper benchmark | MEASURED |
| R2 | Worker resource usage during R1 | MEASURED |

Additional R3-R10 files will be added only after their corresponding experiments are actually executed.
