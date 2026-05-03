from __future__ import annotations

import json
from typing import Any

from config import (
    AZURE_SERVICE_BUS_CONNECTION_STRING,
    AZURE_SERVICE_BUS_QUEUE,
    AZURE_SERVICE_BUS_TOPIC,
)


class ServiceBusPublisher:
    """Small wrapper around Azure Service Bus for crisis workflow events."""

    def __init__(self):
        if not AZURE_SERVICE_BUS_CONNECTION_STRING:
            raise RuntimeError("AZURE_SERVICE_BUS_CONNECTION_STRING is required for Service Bus")

        from azure.servicebus import ServiceBusClient

        self.client = ServiceBusClient.from_connection_string(
            AZURE_SERVICE_BUS_CONNECTION_STRING
        )

    def publish(self, event_type: str, payload: dict[str, Any]) -> None:
        from azure.servicebus import ServiceBusMessage

        body = json.dumps({"event_type": event_type, "payload": payload}, default=str)
        message = ServiceBusMessage(
            body,
            application_properties={"event_type": event_type},
            content_type="application/json",
        )

        if AZURE_SERVICE_BUS_QUEUE:
            with self.client.get_queue_sender(AZURE_SERVICE_BUS_QUEUE) as sender:
                sender.send_messages(message)
            return

        with self.client.get_topic_sender(AZURE_SERVICE_BUS_TOPIC) as sender:
            sender.send_messages(message)
