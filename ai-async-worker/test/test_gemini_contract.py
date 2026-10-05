import unittest

from src.models.gemini_analyzer import (
    ALLOWED_SEVERITIES,
    ALLOWED_URGENCIES,
    _classify_error,
    _validate_analysis,
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
