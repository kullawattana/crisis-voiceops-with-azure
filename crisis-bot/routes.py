from fastapi import APIRouter, WebSocket, Request
from fastapi.responses import HTMLResponse
from twilio.twiml.voice_response import VoiceResponse, Connect
from services.openai_realtime_service import OpenAIRealtimeSession
from services.twilio_service import receive_from_twilio, receive_from_openai
from services.dashboard_store import get_dashboard_store
import asyncio
from urllib.parse import parse_qs

router = APIRouter()


@router.get("/")
async def health():
    return {"status": "ok", "service": "crisis-bot"}


@router.get("/api/cases")
async def list_cases():
    return get_dashboard_store().list_cases()


@router.post("/api/cases")
async def create_case(payload: dict):
    return get_dashboard_store().create_case(payload)


@router.patch("/api/cases/{case_id}")
async def update_case(case_id: str, payload: dict):
    return get_dashboard_store().update_case(case_id, payload)


@router.post("/api/cases/{case_id}/assign-resource")
async def assign_case_resource(case_id: str, payload: dict):
    return get_dashboard_store().assign_resource(case_id, payload)


@router.get("/api/resources")
async def list_resources():
    return get_dashboard_store().list_resources()


@router.post("/api/resources")
async def create_resource(payload: dict):
    return get_dashboard_store().create_resource(payload)


@router.patch("/api/resources/{resource_id}")
async def update_resource(resource_id: str, payload: dict):
    return get_dashboard_store().update_resource(resource_id, payload)


@router.post("/api/resources/{resource_id}/allocate")
async def allocate_resource(resource_id: str, payload: dict):
    return get_dashboard_store().allocate_resource(resource_id, payload)


@router.post("/incoming-call")
async def incoming_call(request: Request):
    """Twilio webhook - return TwiML to connect media stream."""
    body = (await request.body()).decode("utf-8", errors="replace")
    form = {key: values[0] for key, values in parse_qs(body).items()}
    print(
        "[twilio] Incoming call webhook "
        f"CallSid={form.get('CallSid')} From={form.get('From')} To={form.get('To')}",
        flush=True,
    )

    response = VoiceResponse()
    connect = Connect()

    host = request.headers.get("x-forwarded-host") or request.url.hostname
    connect.stream(url=f"wss://{host}/media-stream")

    response.append(connect)
    return HTMLResponse(str(response), media_type="application/xml")


@router.websocket("/media-stream")
async def media_stream(websocket: WebSocket):
    """Bridge Twilio audio <-> OpenAI Realtime."""
    await websocket.accept()

    # Generate a short call ID for logging (will be replaced by stream_sid when available)
    import uuid
    call_id = uuid.uuid4().hex[:8]
    state = {'stream_sid': None, 'call_id': call_id}

    print(f"[{call_id}] WebSocket connected", flush=True)
    realtime = OpenAIRealtimeSession()

    try:
        print(f"[{call_id}] Connecting to OpenAI Realtime...", flush=True)
        async with realtime.connect() as session:
            print(f"[{call_id}] OpenAI Realtime connected, starting tasks", flush=True)
            await asyncio.gather(
                receive_from_twilio(websocket, session, state),
                receive_from_openai(session, websocket, state),
            )
    except Exception as e:
        print(f"[{call_id}] Error: {e}", flush=True)
    finally:
        print(f"[{call_id}] WebSocket disconnected", flush=True)
