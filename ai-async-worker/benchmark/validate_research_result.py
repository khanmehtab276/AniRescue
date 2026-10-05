"""Validate a completed AniRescue AI benchmark result before paper use.

Usage:
    python benchmark/validate_research_result.py benchmark/results/yolo-world-openvino.json

This script checks that required measurements exist and are internally
consistent. It does not manufacture or improve results.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path


REQUIRED_NUMERIC_FIELDS = (
    "images_tested",
    "accuracy_percent",
    "false_positives",
    "false_negatives",
    "average_inference_ms",
    "median_inference_ms",
    "p95_inference_ms",
    "peak_process_rss_mb",
    "peak_cgroup_memory_mb",
    "average_cpu_percent",
)


def fail(message: str) -> None:
    raise SystemExit(f"INVALID: {message}")


def main() -> None:
    if len(sys.argv) != 2:
        fail("provide exactly one benchmark JSON path")

    path = Path(sys.argv[1])
    if not path.is_file():
        fail(f"file does not exist: {path}")

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        fail(f"invalid JSON: {exc}")

    for field in REQUIRED_NUMERIC_FIELDS:
        value = data.get(field)
        if not isinstance(value, (int, float)) or isinstance(value, bool):
            fail(f"missing/non-numeric field: {field}")
        if not math.isfinite(float(value)):
            fail(f"non-finite value: {field}")

    images = int(data["images_tested"])
    fp = int(data["false_positives"])
    fn = int(data["false_negatives"])
    accuracy = float(data["accuracy_percent"])

    if images <= 0:
        fail("images_tested must be greater than zero")
    if fp < 0 or fn < 0:
        fail("false positives/negatives cannot be negative")
    if fp + fn > images:
        fail("false positives + false negatives cannot exceed images tested")
    if not 0 <= accuracy <= 100:
        fail("accuracy_percent must be between 0 and 100")

    expected_accuracy = 100.0 * (images - fn) / images
    if abs(expected_accuracy - accuracy) > 1e-6:
        fail(
            "accuracy_percent is inconsistent with images_tested and false_negatives "
            f"(expected {expected_accuracy:.6f}, got {accuracy:.6f})"
        )

    latency_fields = (
        "average_inference_ms",
        "median_inference_ms",
        "p95_inference_ms",
    )
    for field in latency_fields:
        if float(data[field]) < 0:
            fail(f"latency cannot be negative: {field}")

    if float(data["p95_inference_ms"]) < float(data["median_inference_ms"]):
        fail("p95_inference_ms cannot be below median_inference_ms")

    print("VALID: benchmark result is complete and internally consistent")
    print(f"images_tested={images}")
    print(f"accuracy_percent={accuracy:.3f}")
    print(f"false_positives={fp}")
    print(f"false_negatives={fn}")
    print(f"average_inference_ms={float(data['average_inference_ms']):.3f}")
    print(f"median_inference_ms={float(data['median_inference_ms']):.3f}")
    print(f"p95_inference_ms={float(data['p95_inference_ms']):.3f}")


if __name__ == "__main__":
    main()
