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
            "/opt/yolo-world/yolov8s-worldv2_openvino_model",
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

        # Ultralytics 8.4.90 identifies OpenVINO models by the
        # "_openvino_model" directory suffix. Keep the exported directory
        # name intact so AutoBackend selects the OpenVINO backend.
        if not self.MODEL_PATH.is_dir():
            raise FileNotFoundError(
                f"YOLO-World OpenVINO model directory not found: "
                f"{self.MODEL_PATH}"
            )

        if not self.MODEL_PATH.name.endswith("_openvino_model"):
            raise ValueError(
                "Invalid YOLO-World OpenVINO model directory name: "
                f"{self.MODEL_PATH.name}. "
                "Ultralytics requires the '*_openvino_model' suffix."
            )

        xml_models = sorted(self.MODEL_PATH.glob("*.xml"))
        bin_models = sorted(self.MODEL_PATH.glob("*.bin"))

        if not xml_models:
            raise FileNotFoundError(
                f"No OpenVINO .xml model found in: {self.MODEL_PATH}"
            )

        if not bin_models:
            raise FileNotFoundError(
                f"No OpenVINO .bin weights found in: {self.MODEL_PATH}"
            )

        print(
            "Loading YOLO-World OpenVINO model from: "
            f"{self.MODEL_PATH}"
        )
        print(
            f"OpenVINO XML: {xml_models[0].name}"
        )
        print(
            f"OpenVINO BIN: {bin_models[0].name}"
        )

        # Pass the OpenVINO export directory unchanged. Ultralytics 8.4.90
        # detects the backend from the "_openvino_model" suffix and then
        # resolves the XML + BIN pair itself.
        self.model = YOLO(
            str(self.MODEL_PATH),
            task="detect",
            verbose=False,
        )

        # Prefer the class metadata carried by the exported model. The
        # vocabulary was baked with YOLOWorld.set_classes() during the image
        # build, so hard-coding numeric IDs here is unnecessary and can hide
        # a class-order mismatch between the exported model and application.
        self.model_class_names = getattr(self.model, "names", None)

        if isinstance(self.model_class_names, dict):
            self.model_class_names = {
                int(index): str(name)
                for index, name in self.model_class_names.items()
            }
        elif isinstance(self.model_class_names, (list, tuple)):
            self.model_class_names = {
                index: str(name)
                for index, name in enumerate(self.model_class_names)
            }
        else:
            self.model_class_names = {}

        # Keep the fixed AniRescue vocabulary as a safety allow-list.
        self.allowed_classes = {
            name.lower()
            for name in self.ANIMAL_CLASSES
        }

        print(
            "YOLO-World production gatekeeper ready:",
            f"classes={len(self.ANIMAL_CLASSES)}",
            f"imgsz={self.IMAGE_SIZE}",
            f"conf={self.confidence_threshold}",
            f"max_det={self.MAX_DETECTIONS}",
        )
        print(
            "YOLO-World model class metadata:",
            self.model_class_names or "UNAVAILABLE",
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
            detection_count = 0

            for result in results:
                if result.boxes is None:
                    print("YOLO-World inference: no result boxes returned.")
                    continue

                detection_count += len(result.boxes)

                for box in result.boxes:
                    class_id = int(box.cls[0])
                    confidence = float(box.conf[0])

                    # Use the exported model's own class metadata first.
                    # Fall back to the known AniRescue ordering only if the
                    # export does not expose names.
                    class_name = self.model_class_names.get(class_id)
                    if class_name is None and 0 <= class_id < len(self.ANIMAL_CLASSES):
                        class_name = self.ANIMAL_CLASSES[class_id]

                    print(
                        "YOLO-World detection:",
                        f"class_id={class_id}",
                        f"class={class_name or 'UNKNOWN'}",
                        f"confidence={confidence:.4f}",
                    )

                    if not class_name:
                        continue

                    normalized_name = class_name.strip().lower()

                    if normalized_name not in self.allowed_classes:
                        print(
                            "YOLO-World detection ignored:",
                            f"class={class_name!r} is outside the AniRescue vocabulary",
                        )
                        continue

                    if confidence > best_confidence:
                        best_animal = normalized_name
                        best_confidence = confidence

            print(
                "YOLO-World inference summary:",
                f"detections={detection_count}",
                f"best_animal={best_animal or 'NONE'}",
                f"best_confidence={best_confidence:.4f}",
            )

            if best_animal:
                return True, best_animal, best_confidence

            return False, None, 0.0

        except Exception as error:
            print(f"YOLO-World inference error: {error}")
            return False, None, 0.0
