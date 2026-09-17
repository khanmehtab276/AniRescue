import os
from ultralytics import YOLO
from PIL import Image


class YoloGatekeeper:
    """
    YOLO-based animal image validator for AniRescue.

    Detects common animal categories available in the
    YOLO COCO-trained model.
    """

    # Common animal categories available in COCO
    COMMON_ANIMALS = {
        "bird",
        "cat",
        "dog",
        "horse",
        "sheep",
        "cow",
        "elephant",
        "bear",
        "zebra",
        "giraffe",
    }

    def __init__(self, confidence_threshold=0.35):
        self.confidence_threshold = confidence_threshold

        # Project root
        base_dir = os.path.dirname(
            os.path.dirname(os.path.abspath(__file__))
        )

        weights_path = os.path.join(
            base_dir,
            "weights",
            "yolo11n.pt"
        )

        if not os.path.exists(weights_path):
            raise FileNotFoundError(
                f"YOLO model not found: {weights_path}"
            )

        print(f"Loading YOLO model from: {weights_path}")

        self.model = YOLO(weights_path)

        # Handle both dictionary and list-style model names
        if isinstance(self.model.names, dict):
            self.class_names = self.model.names
        else:
            self.class_names = {
                index: name
                for index, name in enumerate(self.model.names)
            }

        # Find the class IDs corresponding to our animal categories
        self.animal_class_ids = {
            class_id
            for class_id, name in self.class_names.items()
            if name.lower() in self.COMMON_ANIMALS
        }

        print(
            "Animal classes enabled:",
            [
                self.class_names[class_id]
                for class_id in sorted(self.animal_class_ids)
            ]
        )

    def validate_image(self, image_path):
        """
        Detects common animals in a local image.

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
                device="cpu",
                conf=self.confidence_threshold,
                verbose=False
            )

            best_animal = None
            best_confidence = 0.0

            for result in results:

                if result.boxes is None:
                    continue

                for box in result.boxes:

                    class_id = int(box.cls[0])
                    confidence = float(box.conf[0])

                    # Ignore objects that aren't animals
                    if class_id not in self.animal_class_ids:
                        continue

                    animal_name = self.class_names[class_id]

                    # Keep the highest-confidence animal
                    if confidence > best_confidence:
                        best_animal = animal_name
                        best_confidence = confidence

            if best_animal:
                return True, best_animal, best_confidence

            return False, None, 0.0

        except Exception as error:
            print(f"YOLO inference error: {error}")
            return False, None, 0.0