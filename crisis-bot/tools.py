from typing import Literal
import inspect
from services.case_store import create_victim

# Hardcoded survival guides (Thai)
SURVIVAL_GUIDES = {
    "fire": """
ไฟไหม้:
- หมอบต่ำ ควันลอยขึ้น
- หาทางออกใกล้สุด อย่าใช้ลิฟต์
- ปิดจมูกด้วยผ้าเปียก
- ถ้าประตูร้อน อย่าเปิด หาทางอื่น
- ไฟติดเสื้อผ้า ให้หยุด ล้ม กลิ้ง
""",
    "flood": """
น้ำท่วม:
- อย่าเดินหรือว่ายในน้ำท่วม
- ขึ้นที่สูงทันที
- อย่าขับรถผ่านน้ำท่วม
- เก็บน้ำดื่มสะอาด
- หลีกเลี่ยงอุปกรณ์ไฟฟ้า
""",
    "earthquake": """
แผ่นดินไหว:
- หมอบ หลบ เกาะ
- หลีกเลี่ยงหน้าต่างและผนังด้านนอก
- ในอาคาร อยู่ในอาคารจนหยุดสั่น
- นอกอาคาร ไปที่โล่ง ห่างจากอาคาร
- เตรียมรับอาฟเตอร์ช็อก
""",
    "medical": """
เหตุฉุกเฉินทางการแพทย์:
- ตั้งสติ ประเมินสถานการณ์
- มีเลือดออก กดแผลด้วยผ้าสะอาด
- อย่าเคลื่อนย้ายผู้บาดเจ็บ ยกเว้นอันตราย
- ให้ผู้บาดเจ็บอบอุ่น
- รอคำแนะนำเพิ่มเติม
""",
}


def get_survival_guide(
    situation_type: Literal["fire", "flood", "earthquake", "medical"]
) -> str:
    """Get survival instructions for the emergency situation.

    Call this after identifying the emergency type to provide immediate safety guidance to the caller.

    Args:
        situation_type: Type of emergency - fire, flood, earthquake, or medical
    """
    return SURVIVAL_GUIDES.get(situation_type, "ตั้งสติ ความช่วยเหลือกำลังมา")


def record_victim_info(
    situation_type: str,
    victim_count: int,
    location: str,
    injuries: str,
    help_needed: str,
    phone_number: str,
    priority: Literal["RED", "YELLOW", "GREEN"],
    priority_reason: str,
    primary_language: str,
) -> str:
    """Record victim information to database for rescue coordination.

    Call this after gathering all critical information and assessing the priority level.
    This creates a case record that will be used for dispatching help and human callback.

    IMPORTANT: ALL argument values MUST be written in English, regardless of what language the caller speaks.

    Args:
        situation_type: Type of emergency. MUST be in English. Examples: fire, flood, earthquake, accident, medical, storm, landslide
        victim_count: Number of people needing help at this location
        location: Address, landmark, or description of location. MUST be in English. Transliterate local place names. Example: Siam Paragon, Floor 3, Bangkok or Wangthonglang District, near Big C
        injuries: Description of injuries. MUST be in English. Examples: none, minor cuts, broken leg, unconscious, severe bleeding
        help_needed: What immediate assistance is required. MUST be in English. Examples: rescue, medical evacuation, ambulance, shelter, food, water
        phone_number: Contact phone number for callback. Use digits only with country code if provided. Example: +66812345678
        priority: Triage level - RED (life threatening now or foreseeable future), YELLOW (injured but stable), GREEN (safe, non-urgent)
        priority_reason: Brief explanation of why this priority was assigned. MUST be in English. Example: victim trapped under debris with heavy bleeding
        primary_language: The language the caller is speaking during this call. MUST be full language name in English. Examples: Thai, English, Chinese, Burmese, Hindi, Arabic, Spanish, French, Japanese, Korean
    """
    victim_id, ticket_number = create_victim({
        'situation_type': situation_type,
        'victim_count': victim_count,
        'location': location,
        'injuries': injuries,
        'help_needed': help_needed,
        'phone_number': phone_number,
        'priority': priority,
        'priority_reason': priority_reason,
        'primary_language': primary_language,
    })
    return f"Recorded. Situation {situation_type}, {victim_count} people, Location: {location}, Injuries: {injuries}, Help needed: {help_needed}."

# Tool registry
TOOL_MAP = {
    "get_survival_guide": get_survival_guide,
    "record_victim_info": record_victim_info,
}


def parse_docstring_args(docstring: str) -> dict:
    """Parse Google-style docstring Args section into a dict of param descriptions."""
    if not docstring:
        return {}

    args_desc = {}
    in_args = False
    current_param = None
    current_desc = []

    for line in docstring.split('\n'):
        stripped = line.strip()

        if stripped == 'Args:':
            in_args = True
            continue
        elif in_args and stripped and not stripped.startswith(' ') and ':' not in stripped:
            # End of Args section (new section like Returns:)
            break
        elif in_args and ':' in stripped and not stripped.startswith(' '):
            # Save previous param
            if current_param:
                args_desc[current_param] = ' '.join(current_desc).strip()
            # New param line: "param_name: description"
            parts = stripped.split(':', 1)
            current_param = parts[0].strip()
            current_desc = [parts[1].strip()] if len(parts) > 1 else []
        elif in_args and current_param and stripped:
            # Continuation of description
            current_desc.append(stripped)

    # Save last param
    if current_param:
        args_desc[current_param] = ' '.join(current_desc).strip()

    return args_desc


def get_function_description(docstring: str) -> str:
    """Extract main description from docstring (before Args section)."""
    if not docstring:
        return ""

    lines = []
    for line in docstring.split('\n'):
        stripped = line.strip()
        if stripped == 'Args:':
            break
        lines.append(stripped)

    return ' '.join(lines).strip()


def get_tool_declarations():
    """Compatibility wrapper for older imports."""
    return get_openai_tool_declarations()


def get_openai_tool_declarations() -> list[dict]:
    """Convert Python functions to OpenAI Realtime function tool schemas."""
    from typing import get_origin, get_args

    declarations = []
    for func_name, func in TOOL_MAP.items():
        sig = inspect.signature(func)
        docstring = func.__doc__ or ""
        func_desc = get_function_description(docstring)
        param_descs = parse_docstring_args(docstring)

        parameters = {"type": "object", "properties": {}, "required": []}

        for param_name, param in sig.parameters.items():
            annotation = param.annotation
            param_desc = param_descs.get(param_name, "")

            if get_origin(annotation) is Literal:
                parameters["properties"][param_name] = {
                    "type": "string",
                    "enum": list(get_args(annotation)),
                    "description": param_desc,
                }
            elif annotation == int:
                parameters["properties"][param_name] = {
                    "type": "integer",
                    "description": param_desc,
                }
            else:
                parameters["properties"][param_name] = {
                    "type": "string",
                    "description": param_desc,
                }

            if param.default == inspect.Parameter.empty:
                parameters["required"].append(param_name)

        declarations.append(
            {
                "type": "function",
                "name": func_name,
                "description": func_desc or f"Execute {func_name}",
                "parameters": parameters,
            }
        )

    return declarations


def execute_tool(name: str, args: dict) -> str:
    """Execute a tool by name with given arguments."""
    if name in TOOL_MAP:
        return TOOL_MAP[name](**args)
    return f"Unknown tool: {name}"
