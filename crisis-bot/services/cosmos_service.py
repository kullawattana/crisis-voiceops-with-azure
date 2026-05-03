from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
import random
import uuid

from config import (
    AZURE_COSMOS_AUDIT_CONTAINER,
    AZURE_COSMOS_CASES_CONTAINER,
    AZURE_COSMOS_DATABASE,
    AZURE_COSMOS_ENDPOINT,
    AZURE_COSMOS_KEY,
)
from services.event_service import publish_event
from services.triage_service import recommend_triage


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _generate_ticket_number() -> str:
    now = datetime.now(timezone.utc)
    seq = str(random.randint(0, 999999)).zfill(6)
    return f"C{now:%Y%m%d}{seq}"


def _calculate_callback_due(priority: str) -> str:
    now = datetime.now(timezone.utc)
    if priority == "RED":
        due = now + timedelta(minutes=10)
    elif priority == "YELLOW":
        due = now + timedelta(minutes=30)
    else:
        due = now + timedelta(hours=24)
    return due.isoformat()


class CosmosCaseStore:
    """Cosmos DB implementation of the crisis case store."""

    def __init__(self):
        if not AZURE_COSMOS_ENDPOINT or not AZURE_COSMOS_KEY:
            raise RuntimeError("AZURE_COSMOS_ENDPOINT and AZURE_COSMOS_KEY are required for Cosmos DB")

        from azure.cosmos import CosmosClient, PartitionKey

        self.client = CosmosClient(AZURE_COSMOS_ENDPOINT, credential=AZURE_COSMOS_KEY)
        self.database = self.client.create_database_if_not_exists(AZURE_COSMOS_DATABASE)
        self.cases = self.database.create_container_if_not_exists(
            id=AZURE_COSMOS_CASES_CONTAINER,
            partition_key=PartitionKey(path="/id"),
        )
        self.audit_logs = self.database.create_container_if_not_exists(
            id=AZURE_COSMOS_AUDIT_CONTAINER,
            partition_key=PartitionKey(path="/case_id"),
        )

    def create_victim(self, data: dict[str, Any]) -> tuple[str, str]:
        now = _utc_now_iso()
        ticket_number = data.get("case_id") or _generate_ticket_number()
        triage = recommend_triage({**data, "ticket_number": ticket_number})
        priority = triage["triage_level"]

        doc = {
            "id": ticket_number,
            "case_id": ticket_number,
            "ticketNumber": ticket_number,
            "phoneNumber": data.get("phone_number", ""),
            "primaryLanguage": data.get("primary_language", "Thai"),
            "location": {"text": data.get("location", "")},
            "location_text": data.get("location", ""),
            "victimCount": data.get("victim_count", 1),
            "people_affected": data.get("victim_count", 1),
            "condition": data.get("situation_type", ""),
            "injuryDetails": data.get("injuries", ""),
            "helpNeeded": data.get("help_needed", ""),
            "immediate_needs": triage.get("immediate_needs", []),
            "situationType": data.get("situation_type", "unknown"),
            "incident_type": data.get("situation_type", "unknown"),
            "priority": priority,
            "triage_level": priority,
            "triage_confidence": triage.get("confidence"),
            "human_review_required": triage.get("human_review_required", False),
            "priorityReason": data.get("priority_reason", ""),
            "triage_reason": triage.get("triage_reason", ""),
            "ai_summary": triage.get("ai_summary", ""),
            "status": "pending",
            "createdAt": now,
            "updatedAt": now,
            "lastContactAt": now,
            "nextPulseAt": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
            "callbackDueAt": _calculate_callback_due(priority),
            "aiTranscript": "",
            "notes": "",
            "callHistory": [],
            "assignedResources": [],
            "triage": triage,
        }

        self.cases.upsert_item(doc)
        self._write_audit(ticket_number, "case.created", {"priority": priority, "triage": triage})
        publish_event("case.created", {"case_id": ticket_number, "priority": priority})
        publish_event("triage.completed", {"case_id": ticket_number, "triage": triage})
        print(f"Created Cosmos DB case: {ticket_number}", flush=True)
        return ticket_number, ticket_number

    def add_call_to_history(self, victim_id: str, call_data: dict[str, Any]) -> None:
        doc = self.cases.read_item(item=victim_id, partition_key=victim_id)
        history = doc.get("callHistory", [])
        history.append(call_data)
        doc["callHistory"] = history
        doc["lastContactAt"] = _utc_now_iso()
        doc["updatedAt"] = _utc_now_iso()
        self.cases.upsert_item(doc)
        self._write_audit(victim_id, "call.history_added", call_data)

    def _write_audit(self, case_id: str, action: str, details: dict[str, Any]) -> None:
        self.audit_logs.upsert_item(
            {
                "id": str(uuid.uuid4()),
                "case_id": case_id,
                "actor_type": "system",
                "actor_id": "crisis-bot",
                "action": action,
                "details": details,
                "created_at": _utc_now_iso(),
            }
        )
