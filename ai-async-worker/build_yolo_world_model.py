import os
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
    exported_path = model.export(
        format="openvino",
        imgsz=IMAGE_SIZE,
        device="cpu",
        nms=True,
    )

    exported_path = Path(exported_path)
    # Keep Ultralytics' required *_openvino_model directory naming convention.
    # Ultralytics uses this suffix to recognize the exported OpenVINO format.
    final_dir = OUTPUT_DIR / "yolo-world-anirescue_openvino_model"
    if exported_path.resolve() != final_dir.resolve():
        if final_dir.exists():
            import shutil
            shutil.rmtree(final_dir)
        exported_path.rename(final_dir)

    print(f"Production YOLO-World model ready: {final_dir}")


if __name__ == "__main__":
    main()
