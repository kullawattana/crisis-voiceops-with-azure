from __future__ import annotations

from contextlib import asynccontextmanager
import json

import websockets

from config import (
    OPENAI_API_KEY,
    OPENAI_REALTIME_MODEL,
    OPENAI_REALTIME_VOICE,
    SYSTEM_PROMPT,
)
from tools import get_openai_tool_declarations


class OpenAIRealtimeSession:
    """OpenAI Realtime speech-to-speech session for Twilio Media Streams."""

    def __init__(self):
        if not OPENAI_API_KEY:
            raise RuntimeError("OPENAI_API_KEY is required for OpenAI Realtime voice")
        self.url = f"wss://api.openai.com/v1/realtime?model={OPENAI_REALTIME_MODEL}"
        self.websocket = None

    @asynccontextmanager
    async def connect(self):
        print(f"[OpenAI] Connecting to Realtime model: {OPENAI_REALTIME_MODEL}", flush=True)
        async with websockets.connect(
            self.url,
            additional_headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "OpenAI-Beta": "realtime=v1",
            },
            max_size=None,
        ) as ws:
            self.websocket = ws
            await self.configure()
            print("[OpenAI] Realtime connected", flush=True)
            yield self

    async def configure(self):
        await self.send_event(
            {
                "type": "session.update",
                "session": {
                    "modalities": ["audio", "text"],
                    "instructions": SYSTEM_PROMPT,
                    "voice": OPENAI_REALTIME_VOICE,
                    "input_audio_format": "g711_ulaw",
                    "output_audio_format": "g711_ulaw",
                    "turn_detection": {
                        "type": "server_vad",
                        "threshold": 0.5,
                        "prefix_padding_ms": 300,
                        "silence_duration_ms": 500,
                    },
                    "tools": get_openai_tool_declarations(),
                    "tool_choice": "auto",
                },
            }
        )

    async def send_event(self, event: dict):
        if self.websocket is None:
            raise RuntimeError("OpenAI Realtime websocket is not connected")
        await self.websocket.send(json.dumps(event))

    async def send_audio(self, audio_b64: str):
        """Send base64 G.711 μ-law audio from Twilio directly to Realtime."""
        await self.send_event(
            {
                "type": "input_audio_buffer.append",
                "audio": audio_b64,
            }
        )

    async def kickoff(self, instructions: str):
        await self.send_event(
            {
                "type": "response.create",
                "response": {
                    "modalities": ["audio", "text"],
                    "instructions": instructions,
                },
            }
        )

    async def send_tool_result(self, call_id: str, result: str):
        await self.send_event(
            {
                "type": "conversation.item.create",
                "item": {
                    "type": "function_call_output",
                    "call_id": call_id,
                    "output": result,
                },
            }
        )
        await self.send_event({"type": "response.create"})

    async def receive(self):
        if self.websocket is None:
            raise RuntimeError("OpenAI Realtime websocket is not connected")
        async for message in self.websocket:
            yield json.loads(message)
