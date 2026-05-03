from google.cloud import firestore
from datetime import datetime, timedelta, timezone
import random

db = firestore.Client()


def _generate_ticket_number() -> str:
    """Generate ticket number: C + YYYYMMDD + 6 random digits."""
    now = datetime.now(timezone.utc)
    year = now.year
    month = str(now.month).zfill(2)
    day = str(now.day).zfill(2)
    seq = str(random.randint(0, 999999)).zfill(6)
    return f"C{year}{month}{day}{seq}"


def create_victim(data: dict) -> tuple[str, str]:
    """Create victim document, return (ID, ticket_number)."""
    now = datetime.now(timezone.utc)
    priority = data.get('priority', 'GREEN')
    ticket_number = _generate_ticket_number()

    doc = {
        'ticketNumber': ticket_number,
        'phoneNumber': data.get('phone_number', ''),
        'primaryLanguage': data.get('primary_language', 'Thai'),
        'location': {'text': data.get('location', '')},
        'victimCount': data.get('victim_count', 1),
        'condition': data.get('situation_type', ''),
        'injuryDetails': data.get('injuries', ''),
        'helpNeeded': data.get('help_needed', ''),
        'situationType': data.get('situation_type', 'unknown'),
        'priority': priority,
        'priorityReason': data.get('priority_reason', ''),
        'status': 'pending',
        'createdAt': now,
        'updatedAt': now,
        'lastContactAt': now,
        'nextPulseAt': now + timedelta(hours=1),
        'callbackDueAt': _calculate_callback_due(priority),
        'aiTranscript': '',
        'notes': '',
        'callHistory': [],
        'assignedResources': [],
    }

    # Use ticket number as document ID
    db.collection('victims').document(ticket_number).set(doc)
    print(f"Created victim: {ticket_number}")
    return ticket_number, ticket_number


def _calculate_callback_due(priority: str) -> datetime:
    """Calculate callback deadline based on priority."""
    now = datetime.now(timezone.utc)
    if priority == 'RED':
        return now + timedelta(minutes=10)
    elif priority == 'YELLOW':
        return now + timedelta(minutes=30)
    return now + timedelta(hours=24)


def add_call_to_history(victim_id: str, call_data: dict):
    """Append call record to victim's callHistory."""
    ref = db.collection('victims').document(victim_id)
    now = datetime.now(timezone.utc)
    ref.update({
        'callHistory': firestore.ArrayUnion([call_data]),
        'lastContactAt': now,
        'updatedAt': now,
    })


class FirestoreCaseStore:
    """Firestore implementation kept as a fallback during Azure migration."""

    def create_victim(self, data: dict) -> tuple[str, str]:
        return create_victim(data)

    def add_call_to_history(self, victim_id: str, call_data: dict):
        add_call_to_history(victim_id, call_data)
