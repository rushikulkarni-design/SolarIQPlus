"""
SolarIQ+ KSolare Inverter API

Development API for the KSolare 5G Pro inverter integration.

Current mode:
    SIMULATOR

The simulator uses the same normalized KSolareAdapter that will
later be connected to the real inverter transport.

IMPORTANT:
    Simulator data must never be presented as real hardware data.
"""

from dataclasses import asdict, is_dataclass
from datetime import date, datetime
from enum import Enum
from typing import Any, Dict

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .ksolare_adapter import KSolareAdapter
from .ksolare_simulator import SimulatedKSolareTransport


# ============================================================
# CONSTANTS
# ============================================================

PROVIDER_ID = "ksolare"
PROVIDER_NAME = "KSolare"

DATA_MODE = "simulator"
REAL_HARDWARE = False


# ============================================================
# APPLICATION
# ============================================================

app = FastAPI(
    title="SolarIQ+ KSolare Inverter API",
    version="1.1.0",
    description=(
        "SolarIQ+ development API for normalized "
        "KSolare inverter telemetry."
    ),
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# ADAPTER
# ============================================================

transport = SimulatedKSolareTransport()

adapter = KSolareAdapter(
    transport=transport,
)


# ============================================================
# LIFECYCLE
# ============================================================

@app.on_event("startup")
async def startup_event():
    """
    Connect the configured KSolare transport when the API starts.
    """

    await adapter.connect()


@app.on_event("shutdown")
async def shutdown_event():
    """
    Cleanly disconnect the KSolare transport.
    """

    try:
        await adapter.disconnect()

    except Exception:
        pass


# ============================================================
# SERIALIZATION
# ============================================================

def serialize_value(value: Any) -> Any:
    """
    Recursively convert SolarIQ+ inverter models into
    JSON-safe Python structures.
    """

    if value is None:
        return None

    if isinstance(
        value,
        (
            str,
            int,
            float,
            bool,
        ),
    ):
        return value

    if isinstance(
        value,
        (
            datetime,
            date,
        ),
    ):
        return value.isoformat()

    if isinstance(value, Enum):
        return value.value

    if is_dataclass(value):
        return serialize_value(
            asdict(value)
        )

    if isinstance(value, dict):
        return {
            str(key): serialize_value(item)
            for key, item in value.items()
        }

    if isinstance(
        value,
        (
            list,
            tuple,
            set,
        ),
    ):
        return [
            serialize_value(item)
            for item in value
        ]

    if hasattr(value, "__dict__"):
        return {
            str(key): serialize_value(item)
            for key, item in vars(value).items()
            if not key.startswith("_")
        }

    return str(value)


# ============================================================
# COMMON METADATA
# ============================================================

def metadata() -> Dict[str, Any]:
    return {
        "provider": PROVIDER_NAME,
        "provider_id": PROVIDER_ID,
        "data_mode": DATA_MODE,
        "real_hardware": REAL_HARDWARE,
    }


# ============================================================
# ROOT
# ============================================================

@app.get("/")
async def root():
    return {
        "service": (
            "SolarIQ+ KSolare Inverter Integration"
        ),
        "status": "available",
        **metadata(),
        "model": "5G Pro",
        "endpoints": {
            "health": "/api/ksolare/health",
            "device": "/api/ksolare/device",
            "realtime": "/api/ksolare/realtime",
            "alarms": "/api/ksolare/alarms",
            "capabilities": (
                "/api/ksolare/capabilities"
            ),
            "snapshot": "/api/ksolare",
        },
    }


# ============================================================
# HEALTH
# ============================================================

@app.get("/api/ksolare/health")
async def ksolare_health():
    try:
        connected = await adapter.test_connection()

        return {
            "service": (
                "SolarIQ+ KSolare Integration"
            ),
            **metadata(),
            "connected": bool(connected),
            "status": (
                "healthy"
                if connected
                else "unavailable"
            ),
        }

    except Exception as exc:
        return {
            "service": (
                "SolarIQ+ KSolare Integration"
            ),
            **metadata(),
            "connected": False,
            "status": "error",
            "error": str(exc),
        }


# ============================================================
# DEVICE
# ============================================================

@app.get("/api/ksolare/device")
async def get_ksolare_device():
    try:
        device = await adapter.get_device_info()

        return {
            **metadata(),
            "device": serialize_value(
                device
            ),
        }

    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "KSolare device information request "
                f"failed: {exc}"
            ),
        )


# ============================================================
# REALTIME
# ============================================================

@app.get("/api/ksolare/realtime")
async def get_ksolare_realtime():
    try:
        realtime = await adapter.get_realtime()

        return {
            **metadata(),
            "realtime": serialize_value(
                realtime
            ),
        }

    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "KSolare realtime telemetry request "
                f"failed: {exc}"
            ),
        )


# ============================================================
# ALARMS
# ============================================================

@app.get("/api/ksolare/alarms")
async def get_ksolare_alarms():
    try:
        alarms = await adapter.get_alarms()

        return {
            **metadata(),
            "count": len(alarms),
            "alarms": serialize_value(
                alarms
            ),
        }

    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "KSolare alarm request failed: "
                f"{exc}"
            ),
        )


# ============================================================
# CAPABILITIES
# ============================================================

@app.get("/api/ksolare/capabilities")
async def get_ksolare_capabilities():
    try:
        capabilities = (
            await adapter.get_capabilities()
        )

        return {
            **metadata(),
            "capabilities": serialize_value(
                capabilities
            ),
        }

    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "KSolare capability request failed: "
                f"{exc}"
            ),
        )


# ============================================================
# COMPLETE SNAPSHOT
# ============================================================

@app.get("/api/ksolare")
async def get_ksolare_snapshot():
    """
    Complete normalized monitoring snapshot used by SolarIQ+.

    Current data source:
        KSolare simulator.

    Later:
        The API contract remains the same when the simulator
        is replaced with the real KSolare transport.
    """

    try:
        device = await adapter.get_device_info()

        realtime = await adapter.get_realtime()

        alarms = await adapter.get_alarms()

        capabilities = (
            await adapter.get_capabilities()
        )

        connected = await adapter.test_connection()

        return {
            "service": (
                "SolarIQ+ KSolare Monitoring"
            ),

            **metadata(),

            "connected": bool(connected),

            "device": serialize_value(
                device
            ),

            "realtime": serialize_value(
                realtime
            ),

            "alarms": serialize_value(
                alarms
            ),

            "capabilities": serialize_value(
                capabilities
            ),
        }

    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "KSolare monitoring snapshot failed: "
                f"{exc}"
            ),
        )