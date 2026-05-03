import json

from fastapi import WebSocket
from tools import execute_tool


async def receive_from_twilio(twilio_ws: WebSocket, ai_session, state: dict):
    """Forward Twilio G.711 μ-law audio to OpenAI Realtime."""
    call_id = state.get("call_id", "?")
    print(f"[{call_id}] Twilio: Starting receive loop", flush=True)
    audio_count = 0

    try:
        async for message in twilio_ws.iter_text():
            data = json.loads(message)
            event = data.get("event")

            if event == "start":
                state["stream_sid"] = data["start"]["streamSid"]
                print(
                    f"[{call_id}] Twilio: Stream started (sid: {state['stream_sid'][-12:]})",
                    flush=True,
                )
                kickoff = "Greet the caller and ask how you can help with their emergency."
                await ai_session.kickoff(kickoff)
                print(f"[{call_id}] OpenAI: Sent kickoff", flush=True)

            elif event == "media":
                audio_payload = data["media"]["payload"]
                await ai_session.send_audio(audio_payload)
                audio_count += 1
                if audio_count == 1:
                    print(f"[{call_id}] Twilio: First audio chunk forwarded", flush=True)
                if audio_count % 100 == 0:
                    print(f"[{call_id}] Twilio: Forwarded {audio_count} chunks", flush=True)

            elif event == "stop":
                print(f"[{call_id}] Twilio: Stream stopped", flush=True)
                break

    except Exception as e:
        print(f"[{call_id}] Twilio: Receive error: {e}", flush=True)

    print(f"[{call_id}] Twilio: Loop ended, forwarded {audio_count} chunks", flush=True)


async def receive_from_openai(ai_session, twilio_ws: WebSocket, state: dict):
    """Forward OpenAI Realtime audio to Twilio and handle tool calls."""
    call_id = state.get("call_id", "?")
    print(f"[{call_id}] OpenAI: Starting receive loop", flush=True)
    response_count = 0
    audio_chunks_sent = 0
    processed_tool_calls = set()

    try:
        async for event in ai_session.receive():
            response_count += 1
            event_type = event.get("type")

            if event_type in {"response.audio.delta", "response.output_audio.delta"}:
                audio_b64 = event.get("delta") or event.get("audio")
                if audio_b64 and state.get("stream_sid"):
                    await twilio_ws.send_json(
                        {
                            "event": "media",
                            "streamSid": state.get("stream_sid"),
                            "media": {"payload": audio_b64},
                        }
                    )
                    audio_chunks_sent += 1
                    if audio_chunks_sent == 1:
                        print(f"[{call_id}] OpenAI: First audio chunk sent", flush=True)
                    if audio_chunks_sent % 100 == 0:
                        print(f"[{call_id}] OpenAI: Sent {audio_chunks_sent} audio chunks", flush=True)

            elif event_type in {
                "conversation.item.input_audio_transcription.completed",
                "input_audio_buffer.transcription.completed",
            }:
                transcript = event.get("transcript")
                if transcript:
                    print(f"[{call_id}] User: {transcript}", flush=True)

            elif event_type in {"response.audio_transcript.done", "response.output_audio_transcript.done"}:
                transcript = event.get("transcript")
                if transcript:
                    print(f"[{call_id}] AI: {transcript}", flush=True)

            elif event_type == "response.function_call_arguments.done":
                await _handle_tool_call_event(ai_session, event, processed_tool_calls, call_id)

            elif event_type == "response.output_item.done":
                item = event.get("item", {})
                if item.get("type") == "function_call":
                    await _handle_tool_call_event(ai_session, item, processed_tool_calls, call_id)

            elif event_type == "error":
                print(f"[{call_id}] OpenAI error: {event}", flush=True)

    except Exception as e:
        from starlette.websockets import WebSocketDisconnect

        if isinstance(e, WebSocketDisconnect):
            print(f"[{call_id}] OpenAI: Twilio disconnected (user hung up)", flush=True)
        else:
            import traceback

            print(f"[{call_id}] OpenAI: Error: {e}", flush=True)
            print(f"[{call_id}] OpenAI: {traceback.format_exc()}", flush=True)

    print(
        f"[{call_id}] OpenAI: Loop ended. Events: {response_count}, audio sent: {audio_chunks_sent}",
        flush=True,
    )


async def _handle_tool_call_event(ai_session, event: dict, processed_tool_calls: set, call_id: str):
    call_id_value = event.get("call_id") or event.get("id")
    name = event.get("name")
    arguments = event.get("arguments") or "{}"

    if not call_id_value or not name or call_id_value in processed_tool_calls:
        return

    processed_tool_calls.add(call_id_value)

    try:
        args = json.loads(arguments) if isinstance(arguments, str) else arguments
    except json.JSONDecodeError:
        args = {}

    print(f"[{call_id}] Tool: {name}({args})", flush=True)
    result = execute_tool(name, args)
    print(f"[{call_id}] Tool result: {result}", flush=True)
    await ai_session.send_tool_result(call_id_value, result)
