from __future__ import annotations

from typing import Any

from config import EVENT_PUBLISHER


_publisher = None


def publish_event(event_type: str, payload: dict[str, Any]) -> None:
    """Publish a crisis event, falling back to logs if Azure is not configured."""
    if EVENT_PUBLISHER != "service_bus":
        print(f"[event:{event_type}] {payload}", flush=True)
        return

    global _publisher
    try:
        if _publisher is None:
            from services.service_bus_service import ServiceBusPublisher

            _publisher = ServiceBusPublisher()
        _publisher.publish(event_type, payload)
    except Exception as exc:
        print(f"[event:{event_type}] Service Bus unavailable: {exc}. Payload: {payload}", flush=True)
