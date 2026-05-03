from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
import uuid

from config import (
    AZURE_COSMOS_CASES_CONTAINER,
    AZURE_COSMOS_DATABASE,
    AZURE_COSMOS_ENDPOINT,
    AZURE_COSMOS_KEY,
    AZURE_COSMOS_RESOURCES_CONTAINER,
    CASE_STORE_PROVIDER,
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id() -> str:
    return uuid.uuid4().hex


class DashboardStore:
    def list_cases(self) -> list[dict[str, Any]]:
        raise NotImplementedError

    def create_case(self, data: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError

    def update_case(self, case_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError

    def assign_resource(self, case_id: str, assignment: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError

    def list_resources(self) -> list[dict[str, Any]]:
        raise NotImplementedError

    def create_resource(self, data: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError

    def update_resource(self, resource_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError

    def allocate_resource(self, resource_id: str, allocation: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError


class CosmosDashboardStore(DashboardStore):
    def __init__(self):
        if not AZURE_COSMOS_ENDPOINT or not AZURE_COSMOS_KEY:
            raise RuntimeError("Cosmos DB is not configured")

        from azure.cosmos import CosmosClient, PartitionKey

        client = CosmosClient(AZURE_COSMOS_ENDPOINT, credential=AZURE_COSMOS_KEY)
        database = client.create_database_if_not_exists(AZURE_COSMOS_DATABASE)
        self.cases = database.create_container_if_not_exists(
            id=AZURE_COSMOS_CASES_CONTAINER,
            partition_key=PartitionKey(path="/id"),
        )
        self.resources = database.create_container_if_not_exists(
            id=AZURE_COSMOS_RESOURCES_CONTAINER,
            partition_key=PartitionKey(path="/id"),
        )

    def list_cases(self) -> list[dict[str, Any]]:
        return list(
            self.cases.query_items(
                query="SELECT * FROM c ORDER BY c.createdAt DESC",
                enable_cross_partition_query=True,
            )
        )

    def create_case(self, data: dict[str, Any]) -> dict[str, Any]:
        now = _now_iso()
        item = {
            "id": data.get("id") or data.get("ticketNumber") or _new_id(),
            **data,
            "createdAt": data.get("createdAt") or now,
            "updatedAt": now,
        }
        item.setdefault("case_id", item["id"])
        item.setdefault("ticketNumber", item["id"])
        self.cases.upsert_item(item)
        return item

    def update_case(self, case_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        item = self.cases.read_item(item=case_id, partition_key=case_id)
        item.update(updates)
        item["updatedAt"] = _now_iso()
        self.cases.upsert_item(item)
        return item

    def assign_resource(self, case_id: str, assignment: dict[str, Any]) -> dict[str, Any]:
        item = self.cases.read_item(item=case_id, partition_key=case_id)
        assignments = item.get("assignedResources", [])
        assignments.append({**assignment, "assignedAt": assignment.get("assignedAt") or _now_iso()})
        item["assignedResources"] = assignments
        item["updatedAt"] = _now_iso()
        self.cases.upsert_item(item)
        return item

    def list_resources(self) -> list[dict[str, Any]]:
        return list(
            self.resources.query_items(
                query="SELECT * FROM c ORDER BY c.type",
                enable_cross_partition_query=True,
            )
        )

    def create_resource(self, data: dict[str, Any]) -> dict[str, Any]:
        now = _now_iso()
        item = {
            "id": data.get("id") or _new_id(),
            **data,
            "createdAt": data.get("createdAt") or now,
            "updatedAt": now,
        }
        self.resources.upsert_item(item)
        return item

    def update_resource(self, resource_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        item = self.resources.read_item(item=resource_id, partition_key=resource_id)
        item.update(updates)
        item["updatedAt"] = _now_iso()
        self.resources.upsert_item(item)
        return item

    def allocate_resource(self, resource_id: str, allocation: dict[str, Any]) -> dict[str, Any]:
        item = self.resources.read_item(item=resource_id, partition_key=resource_id)
        allocations = item.get("allocations", [])
        allocations.append({**allocation, "allocatedAt": allocation.get("allocatedAt") or _now_iso()})
        item["allocations"] = allocations
        item["available"] = max(0, int(item.get("available", 0)) - 1)
        item["status"] = "deployed"
        item["updatedAt"] = _now_iso()
        self.resources.upsert_item(item)
        return item


class FirestoreDashboardStore(DashboardStore):
    def __init__(self):
        from google.cloud import firestore

        self.firestore = firestore
        self.db = firestore.Client()

    def list_cases(self) -> list[dict[str, Any]]:
        docs = self.db.collection("victims").order_by("createdAt", direction=self.firestore.Query.DESCENDING).stream()
        return [{"id": doc.id, **doc.to_dict()} for doc in docs]

    def create_case(self, data: dict[str, Any]) -> dict[str, Any]:
        now = datetime.now(timezone.utc)
        item = {**data, "createdAt": now, "updatedAt": now}
        ref = self.db.collection("victims").document(data.get("id") or data.get("ticketNumber") or _new_id())
        ref.set(item)
        return {"id": ref.id, **item}

    def update_case(self, case_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        ref = self.db.collection("victims").document(case_id)
        ref.update({**updates, "updatedAt": datetime.now(timezone.utc)})
        return {"id": ref.id, **ref.get().to_dict()}

    def assign_resource(self, case_id: str, assignment: dict[str, Any]) -> dict[str, Any]:
        ref = self.db.collection("victims").document(case_id)
        ref.update(
            {
                "assignedResources": self.firestore.ArrayUnion(
                    [{**assignment, "assignedAt": datetime.now(timezone.utc)}]
                ),
                "updatedAt": datetime.now(timezone.utc),
            }
        )
        return {"id": ref.id, **ref.get().to_dict()}

    def list_resources(self) -> list[dict[str, Any]]:
        docs = self.db.collection("resources").order_by("type").stream()
        return [{"id": doc.id, **doc.to_dict()} for doc in docs]

    def create_resource(self, data: dict[str, Any]) -> dict[str, Any]:
        now = datetime.now(timezone.utc)
        ref = self.db.collection("resources").document(data.get("id") or _new_id())
        item = {**data, "createdAt": now, "updatedAt": now}
        ref.set(item)
        return {"id": ref.id, **item}

    def update_resource(self, resource_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        ref = self.db.collection("resources").document(resource_id)
        ref.update({**updates, "updatedAt": datetime.now(timezone.utc)})
        return {"id": ref.id, **ref.get().to_dict()}

    def allocate_resource(self, resource_id: str, allocation: dict[str, Any]) -> dict[str, Any]:
        ref = self.db.collection("resources").document(resource_id)
        snapshot = ref.get()
        data = snapshot.to_dict()
        ref.update(
            {
                "allocations": self.firestore.ArrayUnion(
                    [{**allocation, "allocatedAt": datetime.now(timezone.utc)}]
                ),
                "available": max(0, int(data.get("available", 0)) - 1),
                "status": "deployed",
                "updatedAt": datetime.now(timezone.utc),
            }
        )
        return {"id": ref.id, **ref.get().to_dict()}


class MemoryDashboardStore(DashboardStore):
    """Local-only fallback so the dashboard can run without cloud credentials."""

    def __init__(self):
        self.cases: dict[str, dict[str, Any]] = {}
        self.resources: dict[str, dict[str, Any]] = {}

    def list_cases(self) -> list[dict[str, Any]]:
        return sorted(
            self.cases.values(),
            key=lambda item: item.get("createdAt", ""),
            reverse=True,
        )

    def create_case(self, data: dict[str, Any]) -> dict[str, Any]:
        now = _now_iso()
        case_id = data.get("id") or data.get("ticketNumber") or _new_id()
        item = {
            "id": case_id,
            "case_id": case_id,
            "ticketNumber": case_id,
            "createdAt": now,
            "updatedAt": now,
            **data,
        }
        self.cases[case_id] = item
        return item

    def update_case(self, case_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        item = self.cases.setdefault(
            case_id,
            {"id": case_id, "case_id": case_id, "ticketNumber": case_id, "createdAt": _now_iso()},
        )
        item.update(updates)
        item["updatedAt"] = _now_iso()
        return item

    def assign_resource(self, case_id: str, assignment: dict[str, Any]) -> dict[str, Any]:
        item = self.update_case(case_id, {})
        assignments = item.setdefault("assignedResources", [])
        assignments.append({**assignment, "assignedAt": assignment.get("assignedAt") or _now_iso()})
        item["updatedAt"] = _now_iso()
        return item

    def list_resources(self) -> list[dict[str, Any]]:
        return sorted(self.resources.values(), key=lambda item: item.get("type", ""))

    def create_resource(self, data: dict[str, Any]) -> dict[str, Any]:
        now = _now_iso()
        resource_id = data.get("id") or _new_id()
        item = {"id": resource_id, "createdAt": now, "updatedAt": now, **data}
        self.resources[resource_id] = item
        return item

    def update_resource(self, resource_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        item = self.resources.setdefault(
            resource_id,
            {"id": resource_id, "createdAt": _now_iso(), "allocations": []},
        )
        item.update(updates)
        item["updatedAt"] = _now_iso()
        return item

    def allocate_resource(self, resource_id: str, allocation: dict[str, Any]) -> dict[str, Any]:
        item = self.update_resource(resource_id, {})
        allocations = item.setdefault("allocations", [])
        allocations.append({**allocation, "allocatedAt": allocation.get("allocatedAt") or _now_iso()})
        item["available"] = max(0, int(item.get("available", 0)) - 1)
        item["status"] = "deployed"
        item["updatedAt"] = _now_iso()
        return item


_dashboard_store: DashboardStore | None = None


def get_dashboard_store() -> DashboardStore:
    global _dashboard_store
    if _dashboard_store is not None:
        return _dashboard_store

    if CASE_STORE_PROVIDER == "cosmos":
        try:
            _dashboard_store = CosmosDashboardStore()
            return _dashboard_store
        except Exception as exc:
            print(f"[dashboard-store] Cosmos unavailable, using local memory store: {exc}", flush=True)
            _dashboard_store = MemoryDashboardStore()
            return _dashboard_store

    if CASE_STORE_PROVIDER == "memory":
        _dashboard_store = MemoryDashboardStore()
        return _dashboard_store

    try:
        _dashboard_store = FirestoreDashboardStore()
    except Exception as exc:
        print(f"[dashboard-store] Firestore unavailable, using local memory store: {exc}", flush=True)
        _dashboard_store = MemoryDashboardStore()
    return _dashboard_store
