from __future__ import annotations

from datetime import datetime, timedelta, timezone
import random
from typing import Any

from config import CASE_STORE_PROVIDER


_store = None


def _generate_ticket_number() -> str:
    now = datetime.now(timezone.utc)
    seq = str(random.randint(0, 999999)).zfill(6)
    return f"C{now.year}{now.month:02d}{now.day:02d}{seq}"


def _calculate_callback_due(priority: str) -> datetime:
    now = datetime.now(timezone.utc)
    if priority == "RED":
        return now + timedelta(minutes=10)
    if priority == "YELLOW":
        return now + timedelta(minutes=30)
    return now + timedelta(hours=24)


class MemoryCaseStore:
    """Local-only case store for development without cloud credentials."""

    def __init__(self):
        self.victims: dict[str, dict[str, Any]] = {}

    def create_victim(self, data: dict[str, Any]) -> tuple[str, str]:
        now = datetime.now(timezone.utc)
        priority = data.get("priority", "GREEN")
        ticket_number = _generate_ticket_number()
        self.victims[ticket_number] = {
            "id": ticket_number,
            "ticketNumber": ticket_number,
            "phoneNumber": data.get("phone_number", ""),
            "primaryLanguage": data.get("primary_language", "Thai"),
            "location": {"text": data.get("location", "")},
            "victimCount": data.get("victim_count", 1),
            "condition": data.get("situation_type", ""),
            "injuryDetails": data.get("injuries", ""),
            "helpNeeded": data.get("help_needed", ""),
            "situationType": data.get("situation_type", "unknown"),
            "priority": priority,
            "priorityReason": data.get("priority_reason", ""),
            "status": "pending",
            "createdAt": now.isoformat(),
            "updatedAt": now.isoformat(),
            "lastContactAt": now.isoformat(),
            "nextPulseAt": (now + timedelta(hours=1)).isoformat(),
            "callbackDueAt": _calculate_callback_due(priority).isoformat(),
            "aiTranscript": "",
            "notes": "",
            "callHistory": [],
            "assignedResources": [],
        }
        print(f"[case-store] Created local victim: {ticket_number}", flush=True)
        return ticket_number, ticket_number

    def add_call_to_history(self, victim_id: str, call_data: dict[str, Any]) -> None:
        victim = self.victims.setdefault(
            victim_id,
            {
                "id": victim_id,
                "ticketNumber": victim_id,
                "createdAt": datetime.now(timezone.utc).isoformat(),
                "callHistory": [],
            },
        )
        victim.setdefault("callHistory", []).append(call_data)
        victim["lastContactAt"] = datetime.now(timezone.utc).isoformat()
        victim["updatedAt"] = datetime.now(timezone.utc).isoformat()


def _get_store():
    global _store
    if _store is not None:
        return _store

    if CASE_STORE_PROVIDER == "memory":
        _store = MemoryCaseStore()
        return _store

    if CASE_STORE_PROVIDER == "cosmos":
        try:
            from services.cosmos_service import CosmosCaseStore

            _store = CosmosCaseStore()
            return _store
        except Exception as exc:
            print(f"[case-store] Cosmos unavailable, using local memory store: {exc}", flush=True)
            _store = MemoryCaseStore()
            return _store

    try:
        from services.firestore_service import FirestoreCaseStore

        _store = FirestoreCaseStore()
    except Exception as exc:
        print(f"[case-store] Firestore unavailable, using local memory store: {exc}", flush=True)
        _store = MemoryCaseStore()
    return _store


def create_victim(data: dict[str, Any]) -> tuple[str, str]:
    return _get_store().create_victim(data)


def add_call_to_history(victim_id: str, call_data: dict[str, Any]) -> None:
    _get_store().add_call_to_history(victim_id, call_data)
