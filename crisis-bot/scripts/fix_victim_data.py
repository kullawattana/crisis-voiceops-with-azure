#!/usr/bin/env python3
"""
Maintenance script for existing crisis case data.

Supports both stores used during the Azure migration:
1. Cosmos DB cases container when CASE_STORE_PROVIDER=cosmos
2. Firestore victims collection when CASE_STORE_PROVIDER=firestore or Cosmos is not configured

Fixes:
- Add assignedResources when missing
- Add ticketNumber/case_id when missing
- Fix timestamps that were incorrectly saved in local Thailand time instead of UTC
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import random
from typing import Any

from config import (
    AZURE_COSMOS_CASES_CONTAINER,
    AZURE_COSMOS_DATABASE,
    AZURE_COSMOS_ENDPOINT,
    AZURE_COSMOS_KEY,
    CASE_STORE_PROVIDER,
)


TIMESTAMP_FIELDS = ["createdAt", "updatedAt", "lastContactAt", "nextPulseAt", "callbackDueAt"]


def generate_ticket_number(created_at: datetime | None = None) -> str:
    """Generate ticket number based on creation date."""
    created_at = created_at or datetime.now(timezone.utc)
    seq = str(random.randint(0, 999999)).zfill(6)
    return f"C{created_at:%Y%m%d}{seq}"


def needs_timezone_fix(ts: Any) -> bool:
    """Check if timestamp is in the future, which suggests a wrong timezone."""
    if ts is None:
        return False
    if isinstance(ts, str):
        ts = parse_iso_datetime(ts)
    if not isinstance(ts, datetime):
        return False
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)
    return (ts - now).total_seconds() > 3600


def parse_iso_datetime(value: str) -> datetime | None:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def shift_timestamp_back(ts: Any) -> Any:
    """Subtract 7 hours while preserving the original timestamp representation."""
    parsed = parse_iso_datetime(ts) if isinstance(ts, str) else ts
    if not isinstance(parsed, datetime):
        return ts
    fixed = parsed - timedelta(hours=7)
    return fixed.isoformat() if isinstance(ts, str) else fixed


def created_at_for_ticket(data: dict[str, Any]) -> datetime:
    created_at = data.get("createdAt") or data.get("created_at")
    if isinstance(created_at, str):
        parsed = parse_iso_datetime(created_at)
        if parsed:
            return parsed
    if isinstance(created_at, datetime):
        return created_at
    return datetime.now(timezone.utc)


def build_updates(data: dict[str, Any]) -> dict[str, Any]:
    updates: dict[str, Any] = {}

    ticket_number = data.get("ticketNumber") or data.get("case_id") or data.get("id")
    if not ticket_number:
        ticket_number = generate_ticket_number(created_at_for_ticket(data))
        updates["ticketNumber"] = ticket_number
        updates["case_id"] = ticket_number

    if "assignedResources" not in data:
        updates["assignedResources"] = []

    if "assigned_resources" not in data:
        updates["assigned_resources"] = data.get("assignedResources", [])

    if "human_review_required" not in data:
        updates["human_review_required"] = data.get("priority") == "RED" or data.get("triage_level") == "RED"

    if "triage_level" not in data and data.get("priority"):
        updates["triage_level"] = data["priority"]

    for field in TIMESTAMP_FIELDS:
        ts = data.get(field)
        if needs_timezone_fix(ts):
            updates[field] = shift_timestamp_back(ts)

    return updates


def fix_cosmos() -> tuple[int, int]:
    if not AZURE_COSMOS_ENDPOINT or not AZURE_COSMOS_KEY:
        raise RuntimeError("Cosmos DB is not configured")

    from azure.cosmos import CosmosClient

    client = CosmosClient(AZURE_COSMOS_ENDPOINT, credential=AZURE_COSMOS_KEY)
    database = client.get_database_client(AZURE_COSMOS_DATABASE)
    container = database.get_container_client(AZURE_COSMOS_CASES_CONTAINER)

    print(f"Fetching Cosmos DB cases from {AZURE_COSMOS_DATABASE}/{AZURE_COSMOS_CASES_CONTAINER}...")
    fixed_count = 0
    tz_fixed = 0

    for item in container.query_items(
        query="SELECT * FROM c",
        enable_cross_partition_query=True,
    ):
        updates = build_updates(item)
        if not updates:
            continue

        if any(field in updates for field in TIMESTAMP_FIELDS):
            tz_fixed += 1

        item.update(updates)
        container.upsert_item(item)
        fixed_count += 1
        print(f"Updated Cosmos case {item.get('id') or item.get('case_id')}: {', '.join(updates.keys())}")

    return fixed_count, tz_fixed


def fix_firestore() -> tuple[int, int]:
    from google.cloud import firestore

    db = firestore.Client()
    victims_ref = db.collection("victims")
    victims = list(victims_ref.stream())

    print("Fetching Firestore victims...")
    fixed_count = 0
    tz_fixed = 0

    for victim in victims:
        data = victim.to_dict()
        updates = build_updates(data)
        if not updates:
            continue

        if any(field in updates for field in TIMESTAMP_FIELDS):
            tz_fixed += 1

        victims_ref.document(victim.id).update(updates)
        fixed_count += 1
        print(f"Updated Firestore victim {victim.id}: {', '.join(updates.keys())}")

    return fixed_count, tz_fixed


def main():
    print(f"Current UTC: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"CASE_STORE_PROVIDER={CASE_STORE_PROVIDER}")
    print()

    if CASE_STORE_PROVIDER == "cosmos":
        try:
            fixed_count, tz_fixed = fix_cosmos()
        except Exception as exc:
            print(f"Cosmos fix failed: {exc}")
            print("Falling back to Firestore...")
            fixed_count, tz_fixed = fix_firestore()
    else:
        fixed_count, tz_fixed = fix_firestore()

    print(f"\nDone. Updated {fixed_count} records, fixed timezone on {tz_fixed} records.")


if __name__ == "__main__":
    main()
