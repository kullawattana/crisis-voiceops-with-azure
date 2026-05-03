# Azure Crisis VoiceOps Thailand

This guide translates the Azure proposal into an implementation plan for the `AI-Crisis-Management` repository.

## Goal

Build an Azure-first crisis voice operations system for Thailand:

```text
Phone call
  -> Azure Communication Services or Twilio
  -> FastAPI call gateway on Azure Container Apps
  -> Azure AI Speech + Azure OpenAI
  -> Cosmos DB case store
  -> Service Bus / Event Grid workflows
  -> Azure Functions pulse checks and escalation
  -> Azure Static Web Apps dashboard with Azure Maps
  -> Azure Monitor, Application Insights, Key Vault
```

For the MVP, keep Twilio if it is already working. The higher-value upgrade is to move state, workflow, monitoring, dashboard hosting, and Responsible AI controls to Azure first.

## MVP Architecture

### Real-Time Call Path

1. Caller dials hotline.
2. Twilio or Azure Communication Services accepts the call.
3. FastAPI receives the webhook and starts the media stream.
4. Audio is transcribed with Azure AI Speech, or handled by an Azure OpenAI Realtime deployment.
5. Azure OpenAI extracts structured emergency facts and proposes triage.
6. Safety rules mark high-risk and uncertain cases for human review.
7. The case is stored in Cosmos DB and published to Service Bus.
8. The operator dashboard updates through Azure SignalR Service or dashboard polling.

### Background Workflow Path

1. `case.created` event is published.
2. Azure Functions calculate SLA deadlines and schedule pulse checks.
3. `triage.completed`, `operator.assigned`, `resource.dispatched`, and `case.closed` events are stored in audit logs.
4. Failed callbacks or worsening status trigger escalation.

## Recommended Azure Resources

| Resource | Recommended use |
| --- | --- |
| Azure Container Apps | Host the FastAPI call gateway and API services |
| Azure Communication Services | Native Azure call automation, callbacks, SMS, recording |
| Twilio | Keep as MVP voice provider if ACS phone/streaming constraints slow delivery |
| Azure AI Speech | Speech-to-text and text-to-speech for Thai and English |
| Azure OpenAI | Structured triage, summaries, realtime voice when feasible |
| Cosmos DB for NoSQL | Case, victim, transcript, pulse check, resource, and audit records |
| Azure Service Bus | Durable queues for case and escalation workflows |
| Event Grid | Event routing between services |
| Azure Functions | Pulse checks, notifications, retries, escalation workers |
| Azure Static Web Apps | React dashboard hosting |
| Azure SignalR Service | Live dashboard updates |
| Azure Maps | Geocoding, incident pins, nearest resource search, routing |
| Azure AI Search | RAG over official crisis SOPs and survival guidance |
| Key Vault | Secrets and certificates |
| Managed Identity | Keyless access from Azure services |
| Application Insights | Request tracing, errors, latency, custom telemetry |
| Azure Monitor | Operational dashboards and alerts |
| API Management + Front Door/WAF | Rate limiting, authentication, and edge protection |

## Data Model

### `cases`

Primary operational case record.

```json
{
  "id": "TH-FLOOD-000123",
  "case_id": "TH-FLOOD-000123",
  "status": "pending",
  "incident_type": "flood",
  "triage_level": "RED",
  "triage_confidence": 0.87,
  "human_review_required": true,
  "location_text": "Hat Yai, near hospital",
  "location": {
    "lat": 7.0086,
    "lng": 100.4747,
    "confidence": 0.7
  },
  "people_affected": 3,
  "immediate_needs": ["rescue", "medical"],
  "ai_summary": "Caller is trapped in floodwater with an elderly person having breathing difficulty.",
  "callback_due_at": "2026-05-02T10:10:00Z",
  "next_pulse_at": "2026-05-02T11:00:00Z",
  "created_at": "2026-05-02T10:00:00Z",
  "updated_at": "2026-05-02T10:00:00Z"
}
```

### `triage_events`

Each AI recommendation, safety-rule result, and human override.

```json
{
  "id": "event-001",
  "case_id": "TH-FLOOD-000123",
  "source": "azure_openai",
  "triage_level": "RED",
  "confidence": 0.87,
  "facts": {
    "incident_type": "flood",
    "injuries": "elderly person breathing difficulty",
    "trapped": true
  },
  "reason": "Trapped caller plus breathing difficulty indicates immediate life risk.",
  "human_override": null,
  "created_at": "2026-05-02T10:00:15Z"
}
```

### `audit_logs`

Append-only operational evidence.

```json
{
  "id": "audit-001",
  "case_id": "TH-FLOOD-000123",
  "actor_type": "ai",
  "actor_id": "azure-openai-triage",
  "action": "triage_recommended",
  "details": {
    "level": "RED",
    "confidence": 0.87
  },
  "created_at": "2026-05-02T10:00:15Z"
}
```

## Event Names

Recommended Service Bus/Event Grid events:

- `call.started`
- `call.transcribed`
- `call.ended`
- `case.created`
- `triage.started`
- `triage.completed`
- `operator.assigned`
- `pulse_check.scheduled`
- `pulse_check.completed`
- `pulse_check.failed`
- `resource.dispatched`
- `case.escalated`
- `case.closed`

## Triage Safety Rules

Azure OpenAI should produce a recommendation, not the final authority. Apply deterministic safety rules after the model output:

- If breathing difficulty, unconsciousness, severe bleeding, heart attack symptoms, trapped person, fire exposure, or immediate drowning risk is present, force `RED`.
- If confidence is below the configured threshold, require human review.
- If location or callback number is missing, mark the case incomplete and ask follow-up questions.
- If the model recommends `GREEN` while any injury or trapped condition is present, require human review.
- Never close or reject a case based only on AI output.

## Operator Dashboard Views

The Azure dashboard should include:

- Case board grouped by RED, YELLOW, GREEN, and status
- SLA timers and overdue alerts
- Azure Maps incident pins
- Caller transcript and AI summary
- Triage explanation and human override control
- Resource assignment panel
- Pulse-check monitor
- Audit log timeline
- Filters by district, incident type, language, priority, and assignment

## Deployment Plan

### Phase 1: Azure Foundation

Deliverables:

- Containerize and deploy FastAPI to Azure Container Apps.
- Create Cosmos DB account, database, and collections.
- Host React dashboard on Azure Static Web Apps.
- Add Application Insights logging and request tracing.
- Move API keys to Key Vault.

### Phase 2: Azure AI

Deliverables:

- Add Azure OpenAI structured triage endpoint.
- Add Azure AI Speech STT/TTS path.
- Store transcripts and triage events.
- Add safety-rule layer and human-review flags.
- Add Azure AI Search for grounded survival guidance.

### Phase 3: Workflow And Maps

Deliverables:

- Publish case events to Service Bus.
- Add Azure Functions pulse-check scheduler and escalation workers.
- Add Azure Maps geocoding and incident pins.
- Add operator SLA alerts.

### Phase 4: Production Readiness

Deliverables:

- Add RBAC and least-privilege Managed Identity.
- Add PDPA-aware retention policy.
- Add disaster recovery plan and backup strategy.
- Add abuse protection and call surge handling.
- Add multilingual evaluation tests.

## Environment Variables

```env
# Voice provider
VOICE_PROVIDER=twilio
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+66xxxxxxxxx

# Azure OpenAI
AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com/
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_DEPLOYMENT=<deployment-name>
AZURE_OPENAI_API_VERSION=2025-01-01-preview

# Azure AI Speech
AZURE_SPEECH_KEY=...
AZURE_SPEECH_REGION=southeastasia

# Cosmos DB
AZURE_COSMOS_ENDPOINT=https://<account>.documents.azure.com:443/
AZURE_COSMOS_KEY=...
AZURE_COSMOS_DATABASE=crisis_voiceops

# Workflow
AZURE_SERVICE_BUS_CONNECTION_STRING=...

# Maps and monitoring
AZURE_MAPS_KEY=...
APPLICATIONINSIGHTS_CONNECTION_STRING=...
KEY_VAULT_URL=https://<vault>.vault.azure.net/
```

In production, replace keys with Managed Identity wherever the Azure SDK supports it.

## Testing Scenarios

- Thai flood, trapped person, breathing difficulty: expect RED and human review.
- Thai medical emergency, unconscious patient: expect RED and immediate callback SLA.
- Fire with caller inside building: expect RED and fire-specific safety guidance.
- Tourist caller in English: expect English response, tourist-support metadata, and location confirmation.
- Missing location: expect follow-up question before final case creation.
- No-answer pulse check: expect retry and escalation event.
- Speech confidence low: expect human review flag.

## Next Engineering Steps

1. Introduce a storage abstraction so `record_victim_info` can write to Firestore or Cosmos DB.
2. Add an Azure OpenAI triage service that returns the structured JSON output in this guide.
3. Add deterministic safety-rule validation around the AI output.
4. Publish `case.created` and `triage.completed` events to Service Bus.
5. Extend the dashboard with map pins, SLA timers, and audit logs.
