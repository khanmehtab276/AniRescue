import csv
import json
import os
import statistics
import sys
import time
from pathlib import Path

BENCHMARK_DIR = Path(__file__).resolve().parent
WORKER_ROOT = BENCHMARK_DIR.parent
sys.path.insert(0, str(WORKER_ROOT))

import psutil

from src.models.yolo_engine import YoloGatekeeper


ROOT = BENCHMARK_DIR
DATASET_DIR = ROOT / "dataset"
MANIFEST = DATASET_DIR / "manifest.csv"
DEFAULT_OUTPUT = ROOT / "results" / "yolo-world-openvino-1.5cpu.json"


def read_cgroup_memory_bytes():
    candidates = (
        Path("/sys/fs/cgroup/memory.current"),
        Path("/sys/fs/cgroup/memory/memory.usage_in_bytes"),
    )
    for path in candidates:
        try:
            return int(path.read_text().strip())
        except (FileNotFoundError, ValueError, OSError):
            continue
    return None


def percentile(values, p):
    ordered = sorted(values)
    if not ordered:
        return 0.0
    if len(ordered) == 1:
        return float(ordered[0])
    rank = (len(ordered) - 1) * p
    low = int(rank)
    high = min(low + 1, len(ordered) - 1)
    fraction = rank - low
    return ordered[low] + (ordered[high] - ordered[low]) * fraction


def main():
    output_path = Path(os.getenv("BENCHMARK_OUTPUT", str(DEFAULT_OUTPUT)))
    output_path.parent.mkdir(parents=True, exist_ok=True)

    rows = []
    with MANIFEST.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))

    process = psutil.Process(os.getpid())
    gatekeeper = YoloGatekeeper()

    # Warm the OpenVINO runtime once. Model loading is intentionally excluded
    # from per-image inference timing so the result measures image inference.
    warmup_image = DATASET_DIR / "images" / rows[0]["image"]
    gatekeeper.validate_image(str(warmup_image))

    timings_ms = []
    cpu_percentages = []
    peak_rss = process.memory_info().rss
    peak_cgroup = read_cgroup_memory_bytes()

    correct = 0
    false_positives = 0
    false_negatives = 0
    wrong_class = 0
    results = []

    for row in rows:
        image_path = DATASET_DIR / "images" / row["image"]
        expected = row["expected"].strip().lower()

        process.cpu_percent(None)
        start = time.perf_counter()
        accepted, predicted, confidence = gatekeeper.validate_image(str(image_path))
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        cpu = process.cpu_percent(None)

        timings_ms.append(elapsed_ms)
        cpu_percentages.append(cpu)

        rss = process.memory_info().rss
        cgroup = read_cgroup_memory_bytes()
        peak_rss = max(peak_rss, rss)
        if cgroup is not None:
            peak_cgroup = max(peak_cgroup or 0, cgroup)

        if expected == "none":
            is_correct = not accepted
            if accepted:
                false_positives += 1
        else:
            is_correct = accepted and predicted == expected
            if not is_correct:
                false_negatives += 1
                if accepted and predicted != expected:
                    wrong_class += 1

        if is_correct:
            correct += 1

        results.append({
            "image": row["image"],
            "expected": expected,
            "predicted": predicted,
            "accepted": accepted,
            "confidence": confidence,
            "inference_ms": elapsed_ms,
            "cpu_percent": cpu,
        })

    total = len(rows)
    output = {
        "benchmark_type": "image_level_gatekeeper",
        "dataset": {
            "manifest": str(MANIFEST.relative_to(WORKER_ROOT)),
            "images": total,
        },
        "model": {
            "path": str(gatekeeper.MODEL_PATH),
            "classes": sorted(set(gatekeeper.class_names.values())),
            "class_count": len(gatekeeper.class_names),
            "imgsz": gatekeeper.IMAGE_SIZE,
            "confidence_threshold": gatekeeper.confidence_threshold,
            "max_detections": gatekeeper.MAX_DETECTIONS,
        },
        "metrics": {
            "correct": correct,
            "accuracy_percent": (correct / total * 100.0) if total else 0.0,
            "false_positives": false_positives,
            "false_negatives": false_negatives,
            "wrong_class_on_positive": wrong_class,
            "mean_inference_ms": statistics.mean(timings_ms) if timings_ms else 0.0,
            "median_inference_ms": statistics.median(timings_ms) if timings_ms else 0.0,
            "p95_inference_ms": percentile(timings_ms, 0.95),
            "peak_process_rss_mb": peak_rss / (1024 * 1024),
            "peak_cgroup_memory_mb": (
                peak_cgroup / (1024 * 1024) if peak_cgroup is not None else None
            ),
            "mean_process_cpu_percent": (
                statistics.mean(cpu_percentages) if cpu_percentages else 0.0
            ),
        },
        "notes": [
            "Model loading is excluded from per-image inference timing.",
            "Accuracy is exact image-level gatekeeper correctness: expected animal must be accepted with the expected class; expected none must be rejected.",
            "This is not an mAP, IoU, precision/recall, or formal object-detection benchmark.",
        ],
        "results": results,
    }

    output_path.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(json.dumps(output["metrics"], indent=2))
    print(f"Saved benchmark result to: {output_path}")


if __name__ == "__main__":
    main()
