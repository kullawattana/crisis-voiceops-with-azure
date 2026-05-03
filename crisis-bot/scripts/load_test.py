#!/usr/bin/env python3
"""
Load test script - simulates Twilio WebSocket connections to test AI voice performance.
Bypasses actual phone calls to isolate the realtime call gateway as a potential bottleneck.
"""

import asyncio
import websockets
import json
import base64
import time
import argparse
import audioop
import os
from dataclasses import dataclass

# Generate silence in mulaw format (Twilio sends mulaw 8kHz)
def generate_silence_mulaw(duration_ms: int = 20) -> bytes:
    """Generate silence as mulaw audio (20ms chunks like Twilio)."""
    # 8kHz, 1 byte per sample for mulaw = 8 bytes per ms
    num_samples = 8 * duration_ms
    # Silence in PCM is 0, convert to mulaw
    pcm_silence = b'\x00\x00' * num_samples  # 16-bit PCM silence
    mulaw_silence = audioop.lin2ulaw(pcm_silence, 2)
    return mulaw_silence


@dataclass
class CallMetrics:
    call_id: int
    connected_at: float = 0
    first_audio_at: float = 0
    stream_started_at: float = 0
    first_response_at: float = 0
    total_responses: int = 0
    total_audio_chunks_received: int = 0
    disconnected_at: float = 0
    error: str = None


async def simulate_call(url: str, call_id: int, duration_seconds: int = 10) -> CallMetrics:
    """Simulate a single Twilio call."""
    metrics = CallMetrics(call_id=call_id)
    stream_sid = f"SIMULATED_{call_id}_{int(time.time())}"

    try:
        metrics.connected_at = time.time()
        print(f"[Call {call_id}] Connecting to {url}...", flush=True)

        async with websockets.connect(url) as ws:
            print(f"[Call {call_id}] Connected", flush=True)

            # Send Twilio 'start' event
            start_event = {
                "event": "start",
                "start": {
                    "streamSid": stream_sid,
                    "accountSid": "SIMULATED",
                    "callSid": f"CALL_{call_id}"
                }
            }
            await ws.send(json.dumps(start_event))
            metrics.stream_started_at = time.time()
            print(f"[Call {call_id}] Sent start event", flush=True)

            # Tasks for sending and receiving
            async def send_audio():
                """Send silence audio chunks like Twilio does (every 20ms)."""
                chunk_count = 0
                silence = generate_silence_mulaw(20)  # 20ms chunks
                silence_b64 = base64.b64encode(silence).decode('utf-8')

                start_time = time.time()
                while time.time() - start_time < duration_seconds:
                    media_event = {
                        "event": "media",
                        "media": {
                            "payload": silence_b64
                        }
                    }
                    try:
                        await ws.send(json.dumps(media_event))
                        chunk_count += 1
                        if chunk_count == 1:
                            metrics.first_audio_at = time.time()
                        await asyncio.sleep(0.02)  # 20ms intervals like Twilio
                    except:
                        break

                # Send stop event
                try:
                    await ws.send(json.dumps({"event": "stop"}))
                    print(f"[Call {call_id}] Sent {chunk_count} audio chunks, stopping", flush=True)
                except:
                    pass

            async def receive_responses():
                """Receive responses from server."""
                try:
                    async for message in ws:
                        data = json.loads(message)
                        metrics.total_responses += 1

                        if data.get('event') == 'media':
                            metrics.total_audio_chunks_received += 1
                            if metrics.total_audio_chunks_received == 1:
                                metrics.first_response_at = time.time()
                                latency = metrics.first_response_at - metrics.stream_started_at
                                print(f"[Call {call_id}] First audio response! Latency: {latency:.2f}s", flush=True)

                            if metrics.total_audio_chunks_received % 50 == 0:
                                print(f"[Call {call_id}] Received {metrics.total_audio_chunks_received} audio chunks", flush=True)
                except websockets.exceptions.ConnectionClosed:
                    pass

            # Run send and receive concurrently
            await asyncio.gather(
                send_audio(),
                receive_responses(),
                return_exceptions=True
            )

            metrics.disconnected_at = time.time()

    except Exception as e:
        metrics.error = str(e)
        metrics.disconnected_at = time.time()
        print(f"[Call {call_id}] Error: {e}", flush=True)

    return metrics


async def run_load_test(url: str, num_calls: int, duration: int, stagger_ms: int = 0):
    """Run multiple simulated calls concurrently."""
    print(f"\n{'='*60}")
    print(f"Load Test: {num_calls} concurrent calls, {duration}s each")
    print(f"Target: {url}")
    print(f"{'='*60}\n")

    start_time = time.time()

    # Start calls (optionally staggered)
    tasks = []
    for i in range(num_calls):
        task = asyncio.create_task(simulate_call(url, i + 1, duration))
        tasks.append(task)
        if stagger_ms > 0 and i < num_calls - 1:
            await asyncio.sleep(stagger_ms / 1000)

    # Wait for all calls to complete
    results = await asyncio.gather(*tasks)

    total_time = time.time() - start_time

    # Print results
    print(f"\n{'='*60}")
    print("RESULTS")
    print(f"{'='*60}")

    successful = [r for r in results if r.error is None]
    failed = [r for r in results if r.error is not None]

    print(f"Total calls: {num_calls}")
    print(f"Successful: {len(successful)}")
    print(f"Failed: {len(failed)}")
    print(f"Total test time: {total_time:.2f}s")

    if successful:
        latencies = [r.first_response_at - r.stream_started_at for r in successful if r.first_response_at > 0]
        if latencies:
            print(f"\nFirst Response Latency (time to first AI audio):")
            print(f"  Min: {min(latencies):.2f}s")
            print(f"  Max: {max(latencies):.2f}s")
            print(f"  Avg: {sum(latencies)/len(latencies):.2f}s")

        audio_counts = [r.total_audio_chunks_received for r in successful]
        print(f"\nAudio chunks received:")
        print(f"  Min: {min(audio_counts)}")
        print(f"  Max: {max(audio_counts)}")
        print(f"  Avg: {sum(audio_counts)/len(audio_counts):.0f}")

    if failed:
        print(f"\nFailed calls:")
        for r in failed:
            print(f"  Call {r.call_id}: {r.error}")

    print(f"{'='*60}\n")

    return results


def main():
    parser = argparse.ArgumentParser(description='Load test crisis-bot WebSocket')
    parser.add_argument(
        '--url',
        default=os.getenv('LOAD_TEST_WS_URL', 'ws://localhost:9999/media-stream'),
        help='WebSocket URL. Defaults to LOAD_TEST_WS_URL or local FastAPI server.'
    )
    parser.add_argument('--calls', type=int, default=1, help='Number of concurrent calls')
    parser.add_argument('--duration', type=int, default=10, help='Duration per call in seconds')
    parser.add_argument('--stagger', type=int, default=0, help='Stagger start time in ms between calls')
    parser.add_argument('--local', action='store_true', help='Use local server (ws://localhost:9999)')

    args = parser.parse_args()

    url = args.url
    if args.local:
        url = 'ws://localhost:9999/media-stream'

    asyncio.run(run_load_test(url, args.calls, args.duration, args.stagger))


if __name__ == '__main__':
    main()
