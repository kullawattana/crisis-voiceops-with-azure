from __future__ import annotations

import json
from typing import Any

from config import (
    AZURE_OPENAI_API_KEY,
    AZURE_OPENAI_API_VERSION,
    AZURE_OPENAI_DEPLOYMENT,
    AZURE_OPENAI_ENDPOINT,
)
from services.triage_service import apply_safety_rules


TRIAGE_SYSTEM_PROMPT = """
You are an emergency triage assistant for Thailand crisis operations.
Extract structured facts from the caller transcript and recommend RED, YELLOW, or GREEN.
RED means life threatening now or foreseeable future.
YELLOW means injured or at risk but not immediately life threatening.
GREEN means safe and non-urgent.
Never deny help. Mark human_review_required when urgent, uncertain, incomplete, or conflicting.
Return only JSON.
"""


class AzureOpenAITriageService:
    """Azure OpenAI structured triage helper for transcript-based workflows."""

    def __init__(self):
        if not AZURE_OPENAI_ENDPOINT or not AZURE_OPENAI_API_KEY or not AZURE_OPENAI_DEPLOYMENT:
            raise RuntimeError(
                "AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, and AZURE_OPENAI_DEPLOYMENT are required"
            )

        from openai import AzureOpenAI

        self.client = AzureOpenAI(
            azure_endpoint=AZURE_OPENAI_ENDPOINT,
            api_key=AZURE_OPENAI_API_KEY,
            api_version=AZURE_OPENAI_API_VERSION,
        )
        self.deployment = AZURE_OPENAI_DEPLOYMENT

    def triage_transcript(self, transcript: str, call_metadata: dict[str, Any] | None = None) -> dict[str, Any]:
        metadata = call_metadata or {}
        response = self.client.chat.completions.create(
            model=self.deployment,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": TRIAGE_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": json.dumps(
                        {"transcript": transcript, "call_metadata": metadata},
                        ensure_ascii=False,
                    ),
                },
            ],
        )
        content = response.choices[0].message.content or "{}"
        return apply_safety_rules(json.loads(content))
