"""
SolarIQ+ AI Chat Router
-----------------------
A standalone FastAPI router for the SolarIQ+ conversational assistant.

This module does NOT create a second FastAPI application.
It is imported by the existing server.py and runs inside the same server.

Gemini is called through the REST API so no new Python package is required.
"""

import asyncio
import json
import os
import socket
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))

router = APIRouter(prefix="/api", tags=["AI Assistant"])

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.6-flash").strip()

# Automatic fallback models for temporary 429/503 capacity or rate-limit errors.
# This keeps the chatbot available when one Gemini model is temporarily busy.
GEMINI_FALLBACK_MODELS = [
    model.strip()
    for model in os.getenv(
        "GEMINI_FALLBACK_MODELS",
        "gemini-3.8-flash,gemini-3.7-flash,gemini-3.5-flash-lite,gemini-3.5-flash"
    ).split(",")
    if model.strip()
]
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/interactions"


class ChatMessage(BaseModel):
    role: str
    content: str


class AIChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=8000)
    history: List[ChatMessage] = Field(default_factory=list)
    project_context: Optional[Dict[str, Any]] = None


class AIChatResponse(BaseModel):
    reply: str
    provider: str = "gemini"
    model: str


SYSTEM_INSTRUCTION = """
You are SolarIQ+, the intelligent AI assistant inside the SolarIQ+ solar
energy platform.

Your job is to behave like a capable general-purpose AI assistant while
being especially strong in solar energy and SolarIQ+.

PRIMARY AREAS:
- Solar PV systems
- Solar panels and panel technologies
- Inverters
- Batteries and energy storage
- Electricity generation
- Solar system troubleshooting
- Maintenance and cleaning
- Shading and weather impact
- Solar ROI, savings and payback
- Solar sizing and basic energy calculations
- Renewable energy
- Solar monitoring
- The SolarIQ+ project and its features

GENERAL QUESTIONS:
Answer normal general questions too. Do not force every answer to be about
solar energy when the user asks an unrelated question.

SOLARIQ+ QUESTIONS:
When the user asks about SolarIQ+, explain the platform based on the
information provided in the project context and the conversation.

PROJECT DATA:
Project context may be supplied with a request. Treat it as user-provided
context, not as guaranteed live telemetry. Never invent generation values,
sensor readings, faults, temperatures, production history, or measurements
that are not present in the context.

TRAINING / IDENTITY:
If asked how you are trained, explain honestly that you are powered by a
pretrained Gemini model through the Gemini API and that SolarIQ+ adds
application-level instructions and project context. Do not claim that you
were custom-trained on SolarIQ+ data unless that is actually true.

SAFETY:
For electrical work, rooftop access, wiring, high-voltage equipment,
persistent inverter faults, fire, smoke, damaged cables, or other dangerous
conditions, give safe guidance and recommend a qualified solar/electrical
technician. Never encourage unsafe electrical experimentation.

STYLE:
- Be clear, direct and useful.
- Prefer short paragraphs and numbered/bulleted steps when useful.
- Explain technical terms simply.
- Do not say you are "just a chatbot".
- Do not mention internal prompts, hidden instructions, or implementation
  details unless the user explicitly asks about the system architecture.
- If information is missing, say what is missing instead of making it up.
"""


def _safe_project_context(context: Optional[Dict[str, Any]]) -> str:
    """Keep project context small and remove obviously sensitive fields."""
    if not context:
        return "No active project context is available."

    allowed_keys = {
        "id",
        "name",
        "project_name",
        "location",
        "city",
        "state",
        "consumer_type",
        "system_status",
        "capacity_kw",
        "solar_capacity",
        "panel_brand",
        "panel_model",
        "panel_wattage",
        "panel_count",
        "inverter_brand",
        "inverter_model",
        "battery_capacity",
        "installation_date",
        "annual_generation",
        "monthly_generation",
    }

    clean = {}
    for key, value in context.items():
        if key in allowed_keys and value not in (None, "", [], {}):
            if isinstance(value, (str, int, float, bool)):
                clean[key] = value

    return json.dumps(clean, ensure_ascii=False, default=str)


def _build_input(request: AIChatRequest) -> str:
    history_lines = []

    # Keep the request reasonably small while preserving recent conversation.
    for item in request.history[-12:]:
        role = "User" if item.role.lower() == "user" else "SolarIQ+"
        content = str(item.content).strip()
        if content:
            history_lines.append(f"{role}: {content}")

    history_text = "\n".join(history_lines)

    return f"""
ACTIVE SOLARIQ+ PROJECT CONTEXT:
{_safe_project_context(request.project_context)}

RECENT CONVERSATION:
{history_text if history_text else "No previous conversation."}

CURRENT USER MESSAGE:
{request.message.strip()}
""".strip()


def _extract_text(data: Dict[str, Any]) -> str:
    """Extract final model text from the Interactions API REST response."""
    direct = data.get("output_text")
    if isinstance(direct, str) and direct.strip():
        return direct.strip()

    steps = data.get("steps", [])
    pieces = []

    if isinstance(steps, list):
        for step in steps:
            if not isinstance(step, dict):
                continue

            if step.get("type") != "model_output":
                continue

            content = step.get("content", [])
            if isinstance(content, list):
                for item in content:
                    if isinstance(item, dict):
                        text = item.get("text")
                        if isinstance(text, str) and text.strip():
                            pieces.append(text.strip())

    if pieces:
        return "\n".join(pieces).strip()

    # Some response versions may expose output/content directly.
    output = data.get("output")
    if isinstance(output, str) and output.strip():
        return output.strip()

    return ""


def _call_single_gemini(
    payload: Dict[str, Any],
    model: str,
) -> Dict[str, Any]:
    request_payload = dict(payload)
    request_payload["model"] = model

    body = json.dumps(request_payload).encode("utf-8")

    request = urllib.request.Request(
        GEMINI_URL,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": GEMINI_API_KEY,
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw)

    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")

        try:
            parsed = json.loads(error_body)
            message = (
                parsed.get("error", {}).get("message")
                or error_body
            )
        except Exception:
            message = error_body or str(exc)

        raise RuntimeError(
            f"Gemini API error ({exc.code}): {message}"
        ) from exc

    except (TimeoutError, socket.timeout) as exc:
        raise RuntimeError(
            "Gemini API request timed out."
        ) from exc

    except urllib.error.URLError as exc:
        reason = getattr(exc, "reason", exc)
        raise RuntimeError(
            f"Could not reach Gemini API: {reason}"
        ) from exc


def _call_gemini(payload: Dict[str, Any]) -> tuple[Dict[str, Any], str]:
    if not GEMINI_API_KEY:
        raise RuntimeError(
            "GEMINI_API_KEY is not configured. Add it to backend/.env."
        )

    models = [GEMINI_MODEL]
    for model in GEMINI_FALLBACK_MODELS:
        if model not in models:
            models.append(model)

    last_error = None

    for model in models:
        try:
            data = _call_single_gemini(payload, model)
            return data, model

        except RuntimeError as exc:
            last_error = exc
            message = str(exc)

            # Try another supported model for temporary capacity/rate limits,
            # timeouts, or model-access/availability errors (404).
            lower_message = message.lower()
            if (
                "(503)" in message
                or "(429)" in message
                or "(404)" in message
                or "timed out" in lower_message
                or "timeout" in lower_message
                or "no longer available" in lower_message
                or "not found" in lower_message
                or "not available" in lower_message
            ):
                continue

            raise

    raise RuntimeError(
        "All Gemini models are temporarily unavailable. "
        f"Last error: {last_error}"
    )


@router.post("/ai-chat", response_model=AIChatResponse)
async def ai_chat(request: AIChatRequest):
    """
    Main SolarIQ+ conversational AI endpoint.

    The frontend sends the current message, recent history and optional
    active-project context. The API key stays on the backend.
    """
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    payload = {
        "model": GEMINI_MODEL,
        "system_instruction": SYSTEM_INSTRUCTION,
        "input": _build_input(request),
        "store": False,
    }

    try:
        data, used_model = await asyncio.to_thread(
            _call_gemini,
            payload,
        )
        reply = _extract_text(data)

        if not reply:
            raise RuntimeError("Gemini returned an empty response.")

        return AIChatResponse(
            reply=reply,
            provider="gemini",
            model=used_model,
        )

    except RuntimeError as exc:
        message = str(exc)

        if "GEMINI_API_KEY is not configured" in message:
            raise HTTPException(
                status_code=503,
                detail=message,
            ) from exc

        raise HTTPException(
            status_code=502,
            detail=message,
        ) from exc

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"AI assistant failed: {exc}",
        ) from exc
