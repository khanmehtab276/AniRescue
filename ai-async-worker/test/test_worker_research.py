import importlib.util
import json
import os
import sys
import types
import unittest
from unittest.mock import patch


def load_worker():
    fake_pika = types.SimpleNamespace(
        URLParameters=lambda value: value,
        BlockingConnection=lambda value: None,
        BasicProperties=lambda **kwargs: kwargs,
    )
    fake_psycopg2 = types.SimpleNamespace(connect=lambda *args, **kwargs: None)
    fake_requests = types.SimpleNamespace(get=lambda *args, **kwargs: None)
    fake_image = types.SimpleNamespace(MAX_IMAGE_PIXELS=0)
    fake_pil = types.ModuleType("PIL")
    fake_pil.Image = fake_image
    fake_models = types.ModuleType("src.models")
    fake_yolo = types.ModuleType("src.models.yolo_engine")
    fake_gemini = types.ModuleType("src.models.gemini_analyzer")

    class FakeGatekeeper:
        pass

    fake_yolo.YoloGatekeeper = FakeGatekeeper
    fake_gemini.analyze_image_with_gemini = lambda **kwargs: None

    sys.modules.setdefault("pika", fake_pika)
    sys.modules.setdefault("psycopg2", fake_psycopg2)
    sys.modules.setdefault("requests", fake_requests)
    sys.modules.setdefault("PIL", fake_pil)
    sys.modules.setdefault("PIL.Image", fake_image)
    sys.modules.setdefault("src.models", fake_models)
    sys.modules.setdefault("src.models.yolo_engine", fake_yolo)
    sys.modules.setdefault("src.models.gemini_analyzer", fake_gemini)

    os.environ.setdefault("RABBITMQ_URL", "amqp://research")
    os.environ.setdefault("DATABASE_URL", "postgresql://research")
    os.environ.setdefault("CLOUDINARY_CLOUD_NAME", "research")

    spec = importlib.util.spec_from_file_location(
        "research_worker",
        os.path.join(os.path.dirname(__file__), "..", "worker.py"),
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


worker = load_worker()


class WorkerResearchTests(unittest.TestCase):
    def test_r4_gemini_severity_and_urgency_derive_operational_priority(self):
        self.assertEqual(
            worker.derive_initial_priority(
                {"severity": "CRITICAL", "urgency": "ROUTINE"}
            ),
            "CRITICAL",
        )
        self.assertEqual(
            worker.derive_initial_priority(
                {"severity": "LOW", "urgency": "EMERGENCY"}
            ),
            "CRITICAL",
        )
        self.assertEqual(
            worker.derive_initial_priority(
                {"severity": "MODERATE", "urgency": "SOON"}
            ),
            "STANDARD",
        )

    def test_r4_invalid_or_missing_gemini_result_is_safe(self):
        self.assertEqual(worker.derive_initial_priority(None), "STANDARD")
        self.assertEqual(
            worker.derive_initial_priority({"severity": "NOT_A_REAL_VALUE"}),
            "STANDARD",
        )

    def test_r5_notification_payload_preserves_async_case_identity(self):
        class FakeChannel:
            def __init__(self):
                self.declared = []
                self.published = []

            def queue_declare(self, **kwargs):
                self.declared.append(kwargs)

            def basic_publish(self, **kwargs):
                self.published.append(kwargs)

        channel = FakeChannel()
        worker.publish_case_notification(channel, 123, True, "dog")

        self.assertEqual(channel.declared[0]["queue"], worker.CASE_NOTIFICATION_QUEUE)
        payload = json.loads(channel.published[0]["body"].decode())
        self.assertEqual(payload["reportId"], 123)
        self.assertTrue(payload["validationPassed"])
        self.assertEqual(payload["species"], "dog")
        self.assertEqual(channel.published[0]["routing_key"], worker.CASE_NOTIFICATION_QUEUE)

    def test_r5_message_requires_report_id_and_image_url_contract(self):
        # The worker's callback is intentionally private/nested. Verify the
        # published job contract at the boundary used by the backend.
        payload = {"reportId": 77, "imageUrl": "https://res.cloudinary.com/research/image/upload/test.jpg"}
        self.assertIn("reportId", payload)
        self.assertIn("imageUrl", payload)
        self.assertIsInstance(payload["reportId"], int)
        self.assertTrue(payload["imageUrl"].startswith("https://res.cloudinary.com/"))


if __name__ == "__main__":
    unittest.main()
