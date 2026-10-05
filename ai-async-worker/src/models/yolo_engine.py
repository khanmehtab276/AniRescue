import os
from pathlib import Path

from PIL import Image
from ultralytics import YOLO


class YoloGatekeeper:
    """
    Production YOLO-World animal gatekeeper for AniRescue.

    The production image contains a fixed-vocabulary OpenVINO model.
    The vocabulary is baked at image-build time, so CLIP/text prompting
    is not performed for every rescue case.
    """

    ANIMAL_CLASSES = (
        "bear", "bird", "cat", "cow", "deer", "dog", "elephant", "fox",
        "giraffe", "goat", "horse", "lion", "monkey", "sheep", "snake",
        "squirrel", "tiger", "zebra",
    )

    MODEL_PATH = Path(
        os.getenv(
            "YOLO_WORLD_OPENVINO_MODEL",
            "/opt/yolo-world/yolo-world-anirescue_openvino_model",
        )
    )

    IMAGE_SIZE = int(os.getenv("YOLO_WORLD_IMGSZ", "512"))
    MAX_DETECTIONS = int(os.getenv("YOLO_WORLD_MAX_DET", "1"))

    def __init__(self, confidence_threshold=0.20):
        self.confidence_threshold = float(
            os.getenv("YOLO_WORLD_CONF", str(confidence_threshold))
        )

        if not self.MODEL_PATH.exists():
            raise FileNotFoundError(
                f"YOLO-World OpenVINO model not found: {self.MODEL_PATH}"
            )

        # Ultralytics recognizes exported OpenVINO models by the
        # *_openvino_model directory naming convention.
        if not self.MODEL_PATH.is_dir():
            raise FileNotFoundError(
                f"YOLO-World OpenVINO model directory not found: {self.MODEL_PATH}"
            )

        print(f"Loading YOLO-World OpenVINO model from: {self.MODEL_PATH}")

        # Ultralytics handles OpenVINO loading, compilation, device selection,
        # and inference configuration internally.
        self.model = YOLO(
            str(self.MODEL_PATH),
            task="detect",
            verbose=False,
        )

        # Use the class metadata embedded in the exported model rather than
        # assuming that class IDs will always remain in the build-script order.
        # This prevents a future model export from silently mapping a valid
        # detection to the wrong species.
        model_names = getattr(self.model, "names", None)
        if isinstance(model_names, dict):
            normalized_names = {
                int(index): str(name).strip().lower()
                for index, name in model_names.items()
            }
        elif isinstance(model_names, (list, tuple)):
            normalized_names = {
                index: str(name).strip().lower()
                for index, name in enumerate(model_names)
            }
        else:
            normalized_names = {}

        allowed_names = set(self.ANIMAL_CLASSES)
        self.class_names = {
            index: name
            for index, name in normalized_names.items()
            if name in allowed_names
        }

        if not self.class_names:
            raise RuntimeError(
                "YOLO-World model does not expose usable animal class metadata. "
                "Refusing to run with an implicit class-ID mapping."
            )

        print(
            "YOLO-World production gatekeeper ready:",
            f"classes={len(self.class_names)}",
            f"imgsz={self.IMAGE_SIZE}",
            f"conf={self.confidence_threshold}",
            f"max_det={self.MAX_DETECTIONS}",
        )

    def validate_image(self, image_path):
        """
        Detect the highest-confidence allowed animal in a local image.

        Returns:
            (True, animal_name, confidence)
            or
            (False, None, 0.0)
        """

        if not image_path:
            return False, None, 0.0

        if not os.path.exists(image_path):
            print(f"Image not found: {image_path}")
            return False, None, 0.0

        try:
            image = Image.open(image_path).convert("RGB")

            results = self.model.predict(
                source=image,
                device="intel:cpu",
                imgsz=self.IMAGE_SIZE,
                conf=self.confidence_threshold,
                max_det=self.MAX_DETECTIONS,
                verbose=False,
            )

            best_animal = None
            best_confidence = 0.0

            for result in results:
                if result.boxes is None:
                    continue

                for box in result.boxes:
                    class_id = int(box.cls[0])
                    confidence = float(box.conf[0])

                    animal_name = self.class_names.get(class_id)
                    if animal_name is None:
                        continue

                    if confidence > best_confidence:
                        best_animal = animal_name
                        best_confidence = confidence

            if best_animal:
                return True, best_animal, best_confidence

            return False, None, 0.0

        except Exception as error:
            print(f"YOLO-World inference error: {error}")
            return False, None, 0.0
