import os
from dotenv import load_dotenv

load_dotenv()

CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    if origin.strip()
]

# Provider toggles. Defaults are Azure-first; individual services fall back to
# local memory/logging if credentials or cloud resources are not ready yet.
CASE_STORE_PROVIDER = os.getenv("CASE_STORE_PROVIDER", "cosmos").lower()
EVENT_PUBLISHER = os.getenv("EVENT_PUBLISHER", "service_bus").lower()
AI_TRIAGE_PROVIDER = os.getenv("AI_TRIAGE_PROVIDER", "azure_openai").lower()

# OpenAI Realtime voice model. This replaces Gemini Live for the Twilio media
# stream path when using GPT speech-to-speech.
VOICE_AI_PROVIDER = os.getenv("VOICE_AI_PROVIDER", "openai").lower()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_REALTIME_MODEL = os.getenv("OPENAI_REALTIME_MODEL", "gpt-4o-realtime-preview")
OPENAI_REALTIME_VOICE = os.getenv("OPENAI_REALTIME_VOICE", "alloy")

# Azure OpenAI
AZURE_OPENAI_ENDPOINT = os.getenv("AZURE_OPENAI_ENDPOINT")
AZURE_OPENAI_API_KEY = os.getenv("AZURE_OPENAI_API_KEY")
AZURE_OPENAI_DEPLOYMENT = os.getenv("AZURE_OPENAI_DEPLOYMENT")
AZURE_OPENAI_API_VERSION = os.getenv("AZURE_OPENAI_API_VERSION", "2024-10-21")

# Azure Cosmos DB for NoSQL
AZURE_COSMOS_ENDPOINT = os.getenv("AZURE_COSMOS_ENDPOINT")
AZURE_COSMOS_KEY = os.getenv("AZURE_COSMOS_KEY")
AZURE_COSMOS_DATABASE = os.getenv("AZURE_COSMOS_DATABASE", "crisis_voiceops")
AZURE_COSMOS_CASES_CONTAINER = os.getenv("AZURE_COSMOS_CASES_CONTAINER", "cases")
AZURE_COSMOS_RESOURCES_CONTAINER = os.getenv("AZURE_COSMOS_RESOURCES_CONTAINER", "resources")
AZURE_COSMOS_AUDIT_CONTAINER = os.getenv("AZURE_COSMOS_AUDIT_CONTAINER", "audit_logs")

# Azure Service Bus
AZURE_SERVICE_BUS_CONNECTION_STRING = os.getenv("AZURE_SERVICE_BUS_CONNECTION_STRING")
AZURE_SERVICE_BUS_TOPIC = os.getenv("AZURE_SERVICE_BUS_TOPIC", "crisis-events")
AZURE_SERVICE_BUS_QUEUE = os.getenv("AZURE_SERVICE_BUS_QUEUE")

# Azure AI Speech
AZURE_SPEECH_KEY = os.getenv("AZURE_SPEECH_KEY")
AZURE_SPEECH_REGION = os.getenv("AZURE_SPEECH_REGION", "southeastasia")
AZURE_SPEECH_RECOGNITION_LANGUAGE = os.getenv("AZURE_SPEECH_RECOGNITION_LANGUAGE", "th-TH")
AZURE_SPEECH_VOICE = os.getenv("AZURE_SPEECH_VOICE", "th-TH-PremwadeeNeural")

SYSTEM_PROMPT = """
You are an AI assistant for emergency calls in Thailand. Your role is to:

1. You will start conversation in English first to identify caller language.
2. Collect critical information:
   - What is your situation? (flood, fire, earthquake, accident, medical)
   - How many people need help?
   - What is your location? (address, landmarks)
   - Is anyone injured? Describe injuries.
   - What immediate help do you need?
   - What phone number can we reach you at?

3. Assess severity:
   - RED: needs urgent medical support NOW or Life threatening in foreseeable future
   - YELLOW: Injured/at risk but not immediately life threatening
   - GREEN: Safe, needs information or non-urgent help

4. After collecting info, call record_victim_info function to save the case
5. Provide survival guidance using get_survival_guide function
6. Confirm information back to caller and tell them help is coming
7. Assure caller that human call center will follow up soon

Respond in the same language the caller uses. Default to English if unclear.
Be concise - this is phone support. System is always available for any emergency.

IMPORTANT:
- Never hang up until all information is collected
- If caller is panicked, speak slowly and calmly
- Always end with survival guidance relevant to their situation
- System is always available - not limited to specific crisis events
- Do not make promises about response times and resources
- Do not tell victims their priority level

Your personality:
- Calm and empathetic
- When speaking Thai, use polite particles like ค่ะ only do not use ครับ
"""
