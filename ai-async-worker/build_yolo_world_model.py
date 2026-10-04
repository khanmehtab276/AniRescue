import os
import shutil
from pathlib import Path

from ultralytics import YOLOWorld


CLASSES = (
    "bear", "bird", "cat", "cow", "deer", "dog", "elephant", "fox",
    "giraffe", "goat", "horse", "lion", "monkey", "sheep", "snake",
    "squirrel", "tiger", "zebra",
)

MODEL_NAME = os.getenv("YOLO_WORLD_MODEL", "yolov8s-worldv2.pt")
IMAGE_SIZE = int(os.getenv("YOLO_WORLD_IMGSZ", "512"))
OUTPUT_DIR = Path(os.getenv("YOLO_WORLD_OUTPUT_DIR", "/opt/yolo-world"))


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    baked_path = OUTPUT_DIR / "yolo-world-anirescue-focused.pt"
    print(f"Loading YOLO-World base model: {MODEL_NAME}")
    model = YOLOWorld(MODEL_NAME)

    print(f"Baking {len(CLASSES)} AniRescue animal classes...")
    model.set_classes(list(CLASSES))
    model.save(str(baked_path))

    print(f"Exporting OpenVINO FP32 model at imgsz={IMAGE_SIZE}...")
    exported_path = Path(
        model.export(
            format="openvino",
            imgsz=IMAGE_SIZE,
            device="cpu",
            nms=True,
        )
    ).resolve()

    if not exported_path.is_dir():
        raise RuntimeError(
            f"Ultralytics OpenVINO export did not return a model directory: "
            f"{exported_path}"
        )

    # Ultralytics 8.4.90 detects OpenVINO from the directory name ending in
    # "_openvino_model". Do not rename it to a generic "openvino" directory.
    if not exported_path.name.endswith("_openvino_model"):
        raise RuntimeError(
            "Unexpected OpenVINO export directory name: "
            f"{exported_path.name}. Expected '*_openvino_model'."
        )

    xml_models = sorted(exported_path.glob("*.xml"))
    bin_models = sorted(exported_path.glob("*.bin"))

    if not xml_models:
        raise RuntimeError(
            f"OpenVINO export is missing its .xml model: {exported_path}"
        )

    if not bin_models:
        raise RuntimeError(
            f"OpenVINO export is missing its .bin weights: {exported_path}"
        )

    final_dir = OUTPUT_DIR / exported_path.name

    if final_dir.resolve() != exported_path.resolve():
        if final_dir.exists():
            shutil.rmtree(final_dir)
        shutil.move(str(exported_path), str(final_dir))

    print(f"Production YOLO-World model ready: {final_dir}")
    print(f"OpenVINO XML: {sorted(final_dir.glob('*.xml'))[0]}")
    print(f"OpenVINO BIN: {sorted(final_dir.glob('*.bin'))[0]}")


if __name__ == "__main__":
    main()
