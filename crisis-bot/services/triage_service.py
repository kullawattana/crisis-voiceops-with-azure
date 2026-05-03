from __future__ import annotations

import json
from typing import Any

from config import AI_TRIAGE_PROVIDER


RED_FLAGS = (
    "breathing difficulty",
    "difficulty breathing",
    "cannot breathe",
    "unconscious",
    "severe bleeding",
    "heart attack",
    "chest pain",
    "trapped",
    "drowning",
    "fire exposure",
    "burn",
    "stroke",
)


def normalize_triage_level(level: str | None) -> str:
    """Return a known triage level, defaulting to GREEN for malformed input."""
    normalized = (level or "GREEN").upper()
    if normalized in {"RED", "YELLOW", "GREEN"}:
        return normalized
    return "GREEN"


def apply_safety_rules(triage: dict[str, Any]) -> dict[str, Any]:
    """Apply deterministic crisis safety rules to an AI triage recommendation."""
    result = dict(triage)
    result["triage_level"] = normalize_triage_level(result.get("triage_level"))
    result["human_review_required"] = bool(result.get("human_review_required"))

    searchable_text = " ".join(
        str(result.get(field, ""))
        for field in (
            "incident_type",
            "injuries",
            "immediate_needs",
            "ai_summary",
            "triage_reason",
            "location_text",
        )
    ).lower()

    matched_red_flags = [flag for flag in RED_FLAGS if flag in searchable_text]
    if matched_red_flags:
        result["triage_level"] = "RED"
        result["human_review_required"] = True
        result["safety_rule"] = f"Forced RED due to: {', '.join(matched_red_flags)}"

    confidence = result.get("confidence")
    if isinstance(confidence, (int, float)) and confidence < 0.7:
        result["human_review_required"] = True
        result["low_confidence"] = True

    if not result.get("location_text") or not result.get("callback_number"):
        result["human_review_required"] = True
        result["missing_critical_fields"] = True

    if result["triage_level"] == "GREEN" and (
        result.get("injuries") or result.get("trapped") is True
    ):
        result["human_review_required"] = True
        result["safety_rule"] = "GREEN recommendation requires review because injury or trapped status is present."

    return result


def build_triage_payload(data: dict[str, Any]) -> dict[str, Any]:
    """Convert collected caller data into the shared Azure triage schema."""
    priority = normalize_triage_level(data.get("priority"))
    payload = {
        "case_id": data.get("case_id") or data.get("ticket_number"),
        "language": data.get("primary_language", "unknown"),
        "incident_type": data.get("situation_type", "unknown"),
        "triage_level": priority,
        "confidence": data.get("confidence", 0.75),
        "location_text": data.get("location", ""),
        "injuries": data.get("injuries", ""),
        "people_affected": data.get("victim_count", 1),
        "immediate_needs": _split_needs(data.get("help_needed", "")),
        "callback_number": data.get("phone_number", ""),
        "ai_summary": _build_summary(data),
        "human_review_required": priority == "RED",
        "triage_reason": data.get("priority_reason", ""),
    }
    return apply_safety_rules(payload)


def recommend_triage(data: dict[str, Any]) -> dict[str, Any]:
    """Use Azure OpenAI triage when configured, with deterministic rules as fallback."""
    if AI_TRIAGE_PROVIDER == "azure_openai":
        try:
            from services.azure_openai_service import AzureOpenAITriageService

            transcript = json.dumps(data, ensure_ascii=False, default=str)
            return AzureOpenAITriageService().triage_transcript(transcript, data)
        except Exception as exc:
            print(f"[triage] Azure OpenAI unavailable, using rules: {exc}", flush=True)

    return build_triage_payload(data)


def _split_needs(help_needed: str) -> list[str]:
    if not help_needed:
        return []
    return [part.strip() for part in help_needed.replace("/", ",").split(",") if part.strip()]


def _build_summary(data: dict[str, Any]) -> str:
    return (
        f"{data.get('situation_type', 'Emergency')} involving "
        f"{data.get('victim_count', 1)} people at {data.get('location', 'unknown location')}. "
        f"Injuries: {data.get('injuries', 'unknown')}. "
        f"Needs: {data.get('help_needed', 'unknown')}."
    )
