import json
import os
import re

from google import genai
from google.genai import types


GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
GEMINI_THINKING_LEVEL = os.getenv("GEMINI_THINKING_LEVEL", "low").lower()

ALLOWED_THINKING_LEVELS = {"low", "medium", "high"}

GEMINI_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "species_observed": {
            "type": "string",
            "description": "Animal species or best visual description."
        },
        "species_consistent_with_yolo": {
            "type": "boolean",
            "description": "Whether the visual assessment is consistent with YOLO's detected species."
        },
        "condition_summary": {
            "type": "string",
            "description": "Short description of visible condition only; do not diagnose disease."
        },
        "severity": {
            "type": "string",
            "enum": ["LOW", "MODERATE", "HIGH", "CRITICAL", "UNKNOWN"]
        },
        "urgency": {
            "type": "string",
            "enum": ["ROUTINE", "SOON", "URGENT", "EMERGENCY", "UNKNOWN"]
        },
        "visible_signs": {
            "type": "array",
            "items": {"type": "string"}
        },
        "first_aid": {
            "type": "array",
            "items": {"type": "string"}
        },
        "cautions": {
            "type": "array",
            "items": {"type": "string"}
        },
        "recommended_action": {
            "type": "string"
        },
        "uncertainty": {
            "type": "string"
        }
    },
    "required": [
        "species_observed",
        "species_consistent_with_yolo",
        "condition_summary",
        "severity",
        "urgency",
        "visible_signs",
        "first_aid",
        "cautions",
        "recommended_action",
        "uncertainty"
    ]
}

_client = None


def _get_client():
    global _client

    if not GEMINI_API_KEY:
        return None

    if _client is None:
        _client = genai.Client(api_key=GEMINI_API_KEY)

    return _client


def _classify_error(error):
    text = str(error).lower()

    if any(
        marker in text
        for marker in (
            "429",
            "resource_exhausted",
            "quota",
            "rate limit",
            "too many requests",
        )
    ):
        return "QUOTA_EXHAUSTED"

    if any(
        marker in text
        for marker in (
            "401",
            "403",
            "api key",
            "permission",
            "unauthenticated",
        )
    ):
        return "AUTH_ERROR"

    if "timeout" in text or "deadline" in text:
        return "TIMEOUT"

    return "API_ERROR"


def analyze_image_with_gemini(
    image_path,
    yolo_species,
    yolo_confidence,
    issue_description,
):
    """
    Run a lightweight multimodal Gemini assessment after YOLO has
    already verified that the image contains an animal.

    Gemini is advisory only:
    - no diagnosis
    - no medication prescriptions
    - no replacement for a trained rescuer/veterinarian
    - failures never invalidate a YOLO-approved rescue case
    """

    if not GEMINI_API_KEY:
        return {
            "status": "NOT_CONFIGURED",
            "analysis": None,
            "error_code": None,
        }

    thinking_level = (
        GEMINI_THINKING_LEVEL
        if GEMINI_THINKING_LEVEL in ALLOWED_THINKING_LEVELS
        else "low"
    )

    prompt = f"""
You are the preliminary animal-rescue assessment component of AniRescue.

YOLO has already detected an animal:
- YOLO species: {yolo_species}
- YOLO confidence: {float(yolo_confidence):.3f}

Reporter description:
{issue_description or "No description provided."}

Analyze the supplied rescue image visually.

Your task is NOT to diagnose a disease or injury. Only describe visible signs
and provide conservative, practical first-aid guidance that a member of the
public or rescue volunteer can follow until a trained animal rescuer or
veterinarian takes over.

Important safety rules:
- Do not prescribe or recommend medicines, doses, injections, or chemicals.
- Do not claim certainty about an internal injury, disease, poisoning, or
  other condition that cannot be established from the image.
- If the image is unclear, say so and use UNKNOWN severity/urgency when needed.
- Keep first-aid steps simple and low-risk.
- Emphasize contacting a trained rescuer/veterinarian for serious or uncertain
  situations.
- Severity is a visual triage estimate, not a medical diagnosis.
- Return ONLY the requested JSON structure.
"""

    try:
        client = _get_client()

        with open(image_path, "rb") as image_file:
            image_bytes = image_file.read()

        image_part = types.Part.from_bytes(
            data=image_bytes,
            mime_type="image/jpeg",
        )

        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=[image_part, prompt],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=GEMINI_RESPONSE_SCHEMA,
                max_output_tokens=700,
                thinking_config=types.ThinkingConfig(
                    thinking_level=thinking_level,
                ),
            ),
        )

        raw_text = (response.text or "").strip()

        if not raw_text:
            raise ValueError("Gemini returned an empty response.")

        analysis = json.loads(raw_text)

        if not isinstance(analysis, dict):
            raise ValueError("Gemini response was not a JSON object.")

        return {
            "status": "COMPLETED",
            "analysis": analysis,
            "error_code": None,
        }

    except Exception as error:
        error_code = _classify_error(error)

        print(
            f"⚠️ Gemini analysis failed ({error_code}): {error}"
        )

        return {
            "status": error_code,
            "analysis": None,
            "error_code": error_code,
        }
