import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch


from src.models.gemini_analyzer import (
    ALLOWED_SEVERITIES,
    ALLOWED_URGENCIES,
    GEMINI_FALLBACK_MODEL,
    GEMINI_MODEL,
    _classify_error,
    _is_fallback_worthy_error,
    _validate_analysis,
    analyze_image_with_gemini,
)


def valid_analysis():
    return {
        "species_observed": "dog",
        "species_consistent_with_yolo": True,
        "condition_summary": "Visible superficial injury.",
        "severity": "MODERATE",
        "urgency": "SOON",
        "visible_signs": ["Visible wound"],
        "first_aid": ["Keep the animal calm"],
        "cautions": ["Do not give medication"],
        "recommended_action": "Prioritize rescue assessment.",
        "uncertainty": "Internal injury cannot be assessed from the image.",
    }


class GeminiContractTests(unittest.TestCase):
    def test_valid_structured_response_is_accepted(self):
        result = _validate_analysis(valid_analysis())
        self.assertEqual(result["severity"], "MODERATE")
        self.assertEqual(result["urgency"], "SOON")

    def test_invalid_severity_is_rejected(self):
        payload = valid_analysis()
        payload["severity"] = "SEVERE"
        with self.assertRaises(ValueError):
            _validate_analysis(payload)

    def test_invalid_urgency_is_rejected(self):
        payload = valid_analysis()
        payload["urgency"] = "IMMEDIATE"
        with self.assertRaises(ValueError):
            _validate_analysis(payload)

    def test_invalid_boolean_is_rejected(self):
        payload = valid_analysis()
        payload["species_consistent_with_yolo"] = "true"
        with self.assertRaises(ValueError):
            _validate_analysis(payload)

    def test_array_fields_must_contain_strings(self):
        payload = valid_analysis()
        payload["first_aid"] = ["Keep calm", 123]
        with self.assertRaises(ValueError):
            _validate_analysis(payload)


    def test_transient_primary_failure_uses_stable_fallback(self):
        valid_json = SimpleNamespace(text='''{
            "species_observed": "dog",
            "species_consistent_with_yolo": true,
            "condition_summary": "Visible superficial injury.",
            "severity": "MODERATE",
            "urgency": "SOON",
            "visible_signs": ["Visible wound"],
            "first_aid": ["Keep the animal calm"],
            "cautions": ["Do not give medication"],
            "recommended_action": "Prioritize rescue assessment.",
            "uncertainty": "Internal injury cannot be assessed from the image."
        }''')

        class FakeModels:
            def __init__(self):
                self.models = []

            def generate_content(self, model, **kwargs):
                self.models.append(model)
                if model == GEMINI_MODEL:
                    raise RuntimeError("503 UNAVAILABLE: model high demand")
                return valid_json

        fake_models = FakeModels()
        fake_client = SimpleNamespace(models=fake_models)

        with tempfile.NamedTemporaryFile(suffix=".jpg") as image_file:
            with patch("src.models.gemini_analyzer.GEMINI_API_KEY", "test-key"):
                with patch("src.models.gemini_analyzer._get_client", return_value=fake_client):
                    result = analyze_image_with_gemini(
                        image_path=image_file.name,
                        yolo_species="dog",
                        yolo_confidence=0.72,
                        issue_description="Research test",
                    )

        self.assertEqual(result["status"], "COMPLETED")
        self.assertTrue(result["fallback_used"])
        self.assertEqual(result["model_used"], GEMINI_FALLBACK_MODEL)
        self.assertEqual(fake_models.models, [GEMINI_MODEL, GEMINI_FALLBACK_MODEL])
        self.assertEqual(result["analysis"]["_model_used"], GEMINI_FALLBACK_MODEL)

    def test_auth_error_does_not_trigger_model_fallback(self):
        self.assertFalse(_is_fallback_worthy_error("AUTH_ERROR", "403 permission denied"))

    def test_error_categories_are_deterministic(self):
        self.assertEqual(_classify_error("429 quota exceeded"), "QUOTA_EXHAUSTED")
        self.assertEqual(_classify_error("401 invalid API key"), "AUTH_ERROR")
        self.assertEqual(_classify_error("request timeout"), "TIMEOUT")
        self.assertEqual(_classify_error("unexpected server failure"), "API_ERROR")

    def test_allowed_enums_match_contract(self):
        self.assertEqual(
            ALLOWED_SEVERITIES,
            {"LOW", "MODERATE", "HIGH", "CRITICAL", "UNKNOWN"},
        )
        self.assertEqual(
            ALLOWED_URGENCIES,
            {"ROUTINE", "SOON", "URGENT", "EMERGENCY", "UNKNOWN"},
        )


if __name__ == "__main__":
    unittest.main()
