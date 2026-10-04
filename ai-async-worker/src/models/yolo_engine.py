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
            "/opt/yolo-world/openvino",
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

        print(f"Loading YOLO-World OpenVINO model from: {self.MODEL_PATH}")

        # Ultralytics handles OpenVINO model loading, compilation, device
        # selection, and inference configuration internally. Do not call
        # compile_model() on self.model.model: for exported OpenVINO models
        # that attribute is not an OpenVINO Core instance.
        self.model = YOLO(
            str(self.MODEL_PATH),
            task="detect",
            verbose=False,
        )

        self.class_names = {
            index: name
            for index, name in enumerate(self.ANIMAL_CLASSES)
        }

        print(
            "YOLO-World production gatekeeper ready:",
            f"classes={len(self.ANIMAL_CLASSES)}",
            f"imgsz={self.IMAGE_SIZE}",
            f"conf={self.confidence_threshold}",
            f"max_det={self.MAX_DETECTIONS}",
        )

    def validate_image(self, image_path):
        """
        Detect the highest-confidence animal in a local image.

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

                    if class_id not in self.class_names:
                        continue

                    if confidence > best_confidence:
                        best_animal = self.class_names[class_id]
                        best_confidence = confidence

            if best_animal:
                return True, best_animal, best_confidence

            return False, None, 0.0

        except Exception as error:
            print(f"YOLO-World inference error: {error}")
            return False, None, 0.0
