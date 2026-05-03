from __future__ import annotations

from dataclasses import dataclass

from config import (
    AZURE_SPEECH_KEY,
    AZURE_SPEECH_RECOGNITION_LANGUAGE,
    AZURE_SPEECH_REGION,
    AZURE_SPEECH_VOICE,
)


@dataclass(frozen=True)
class AzureSpeechSettings:
    key: str | None
    region: str
    recognition_language: str
    voice: str


def get_speech_settings() -> AzureSpeechSettings:
    """Return Azure AI Speech settings used by ACS/STT/TTS integrations."""
    return AzureSpeechSettings(
        key=AZURE_SPEECH_KEY,
        region=AZURE_SPEECH_REGION,
        recognition_language=AZURE_SPEECH_RECOGNITION_LANGUAGE,
        voice=AZURE_SPEECH_VOICE,
    )
