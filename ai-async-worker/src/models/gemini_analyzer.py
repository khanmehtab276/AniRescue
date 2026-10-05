import json
import os
from google import genai
from google.genai import types


GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
GEMINI_FALLBACK_MODEL = os.getenv("GEMINI_FALLBACK_MODEL", "gemini-3.5-flash-lite")
GEMINI_THINKING_LEVEL = os.getenv("GEMINI_THINKING_LEVEL", "low").lower()
GEMINI_TIMEOUT_MS = int(os.getenv("GEMINI_TIMEOUT_MS", "120000"))

ALLOWED_THINKING_LEVELS = {"low", "medium", "high"}
ALLOWED_SEVERITIES = {"LOW", "MODERATE", "HIGH", "CRITICAL", "UNKNOWN"}
ALLOWED_URGENCIES = {"ROUTINE", "SOON", "URGENT", "EMERGENCY", "UNKNOWN"}

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
        _client = genai.Client(
            api_key=GEMINI_API_KEY,
            http_options=types.HttpOptions(timeout=GEMINI_TIMEOUT_MS),
        )

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


def _is_fallback_worthy_error(error_code, error):
    """Return True for transient/model-capacity failures where a stable
    fallback model can reasonably handle the same multimodal request.
    """
    text = str(error).lower()
    return error_code in {"QUOTA_EXHAUSTED", "TIMEOUT", "API_ERROR"} and any(
        marker in text
        for marker in (
            "503", "unavailable", "service unavailable", "high demand",
            "overloaded", "500", "internal", "timeout", "deadline",
            "429", "resource_exhausted", "quota", "rate limit",
            "too many requests", "model_not_found", "not found",
        )
    )


def _validate_analysis(analysis):
    """Validate structured Gemini output before it reaches PostgreSQL/UI."""
    if not isinstance(analysis, dict):
        raise ValueError("Gemini response was not a JSON object.")

    required_strings = (
        "species_observed",
        "condition_summary",
        "recommended_action",
        "uncertainty",
    )

    for field in required_strings:
        if not isinstance(analysis.get(field), str):
            raise ValueError(f"Gemini field {field!r} must be a string.")

    if not isinstance(analysis.get("species_consistent_with_yolo"), bool):
        raise ValueError("Gemini field 'species_consistent_with_yolo' must be boolean.")

    severity = analysis.get("severity")
    urgency = analysis.get("urgency")

    if severity not in ALLOWED_SEVERITIES:
        raise ValueError(f"Invalid Gemini severity: {severity!r}")

    if urgency not in ALLOWED_URGENCIES:
        raise ValueError(f"Invalid Gemini urgency: {urgency!r}")

    for field in ("visible_signs", "first_aid", "cautions"):
        value = analysis.get(field)
        if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
            raise ValueError(f"Gemini field {field!r} must be an array of strings.")

    return analysis


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

Workflow context:
This case has already been reported through AniRescue. The rescue team will
review, assign, and handle the case. Do not instruct the reporter to contact
another rescue organization.

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
- Emphasize that the rescue workflow is already active: the report has been
  submitted to AniRescue and will be handled by the rescue team.
- Do NOT tell the reporter to contact an animal rescue organization or submit
  another report, because the current report is already inside the rescue
  workflow.
- For recommended_action, describe what the AniRescue rescue team should
  prioritize next. Examples include prioritizing rescue assessment, arranging
  veterinary evaluation, safely transporting the animal, or monitoring until
  handover. Keep the wording operational and concise.
- If the case is serious or uncertain, recommend prompt assessment by a trained
  rescuer or veterinarian as part of the existing rescue workflow.
- Severity is a visual triage estimate, not a medical diagnosis.
- Return ONLY the requested JSON structure.
"""

    def _run_model(client, model_name, image_part):
        response = client.models.generate_content(
            model=model_name,
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
        return _validate_analysis(json.loads(raw_text))

    try:
        client = _get_client()
        with open(image_path, "rb") as image_file:
            image_bytes = image_file.read()
        image_part = types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg")

        try:
            analysis = _run_model(client, GEMINI_MODEL, image_part)
            analysis["_model_used"] = GEMINI_MODEL
            return {
                "status": "COMPLETED",
                "analysis": analysis,
                "error_code": None,
                "model_used": GEMINI_MODEL,
                "fallback_used": False,
            }
        except Exception as primary_error:
            primary_error_code = _classify_error(primary_error)
            if (
                GEMINI_FALLBACK_MODEL
                and GEMINI_FALLBACK_MODEL != GEMINI_MODEL
                and _is_fallback_worthy_error(primary_error_code, primary_error)
            ):
                print(
                    f"🔁 Gemini primary model {GEMINI_MODEL} unavailable "
                    f"({primary_error_code}); trying fallback "
                    f"{GEMINI_FALLBACK_MODEL}..."
                )
                try:
                    analysis = _run_model(client, GEMINI_FALLBACK_MODEL, image_part)
                    analysis["_model_used"] = GEMINI_FALLBACK_MODEL
                    analysis["_fallback_from"] = GEMINI_MODEL
                    print(f"✅ Gemini fallback succeeded with {GEMINI_FALLBACK_MODEL}")
                    return {
                        "status": "COMPLETED",
                        "analysis": analysis,
                        "error_code": None,
                        "model_used": GEMINI_FALLBACK_MODEL,
                        "fallback_used": True,
                    }
                except Exception as fallback_error:
                    fallback_error_code = _classify_error(fallback_error)
                    print(
                        f"⚠️ Gemini fallback failed "
                        f"({fallback_error_code}): {fallback_error}"
                    )
                    return {
                        "status": fallback_error_code,
                        "analysis": None,
                        "error_code": fallback_error_code,
                        "model_used": GEMINI_FALLBACK_MODEL,
                        "fallback_used": True,
                    }

            print(
                f"⚠️ Gemini analysis failed ({primary_error_code}): "
                f"{primary_error}"
            )
            return {
                "status": primary_error_code,
                "analysis": None,
                "error_code": primary_error_code,
                "model_used": GEMINI_MODEL,
                "fallback_used": False,
            }

