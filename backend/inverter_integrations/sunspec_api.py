"""
SolarIQ+ Universal SunSpec Gateway API.

Provides a manufacturer-neutral connection layer for
SunSpec-compatible inverters over:

    - Modbus TCP
    - Modbus RTU / RS485

The API intentionally keeps credentials and transport
configuration separate from normalized inverter telemetry.
"""

from __future__ import annotations

import asyncio
import uuid
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .sun_spec_adapter import (
    SunSpecConnectionConfig,
    UniversalSunSpecGateway,
    create_sunspec_gateway,
)


router = APIRouter(
    prefix="/api/monitoring/universal-sunspec",
    tags=["Universal SunSpec Gateway"],
)


# ---------------------------------------------------------------------------
# Active gateway registry
# ---------------------------------------------------------------------------

_ACTIVE_GATEWAYS: Dict[str, UniversalSunSpecGateway] = {}


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class SunSpecConnectionRequest(BaseModel):
    """
    Connection configuration supplied by the frontend.

    mode:
        tcp -> Modbus TCP
        rtu -> Modbus RTU / RS485

    For RTU:
        serial_port is required.

    For TCP:
        host and tcp_port are required.
    """

    mode: str = Field(
        default="tcp",
        description="Connection mode: tcp or rtu",
    )

    host: Optional[str] = Field(
        default=None,
        description="Modbus TCP host/IP address",
    )

    tcp_port: int = Field(
        default=502,
        ge=1,
        le=65535,
        description="Modbus TCP port",
    )

    serial_port: Optional[str] = Field(
        default=None,
        description="Serial port, e.g. COM3",
    )

    baudrate: int = Field(
        default=9600,
        ge=300,
        le=1000000,
        description="RS485 baud rate",
    )

    parity: str = Field(
        default="N",
        description="RS485 parity: N, E or O",
    )

    device_address: int = Field(
        default=1,
        ge=1,
        le=247,
        description="Modbus slave/device address",
    )

    timeout: float = Field(
        default=3.0,
        gt=0,
        le=60,
        description="Communication timeout in seconds",
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _validate_mode(mode: str) -> str:
    mode = str(mode or "").strip().lower()

    if mode not in {"tcp", "rtu"}:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "invalid_connection_mode",
                "message": "mode must be either 'tcp' or 'rtu'.",
            },
        )

    return mode


def _validate_parity(parity: str) -> str:
    parity = str(parity or "N").strip().upper()

    if parity not in {"N", "E", "O"}:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "invalid_parity",
                "message": "parity must be N, E or O.",
            },
        )

    return parity


def _build_gateway(
    request: SunSpecConnectionRequest,
) -> UniversalSunSpecGateway:
    """
    Build a Universal SunSpec Gateway using the factory's
    keyword-only connection parameters.
    """

    mode = _validate_mode(request.mode)
    parity = _validate_parity(request.parity)

    if mode == "tcp":
        if not request.host:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "missing_host",
                    "message": "host is required for Modbus TCP.",
                },
            )

    if mode == "rtu":
        if not request.serial_port:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "missing_serial_port",
                    "message": "serial_port is required for Modbus RTU.",
                },
            )

    return create_sunspec_gateway(
        mode=mode,
        host=request.host,
        tcp_port=request.tcp_port,
        serial_port=request.serial_port,
        baudrate=request.baudrate,
        parity=parity,
        device_address=request.device_address,
        timeout=request.timeout,
    )


async def _connect_gateway(
    gateway: UniversalSunSpecGateway,
) -> None:
    """
    Connect to the physical/network device and perform
    SunSpec model discovery.

    pySunSpec2 performs discovery through scan().
    """

    try:
        await gateway.connect()

        # Discovery is intentionally performed immediately.
        # This verifies that the target is not merely reachable,
        # but actually exposes a SunSpec device/model map.
        await gateway.discover()

    except Exception:
        # Always attempt to close a failed gateway so that
        # sockets/serial resources are not leaked.
        try:
            await gateway.close()
        except Exception:
            pass

        raise


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@router.get("/health")
async def universal_sunspec_health() -> Dict[str, Any]:
    """
    Health information for the Universal SunSpec Gateway service.
    """

    return {
        "service": "SolarIQ+ Universal SunSpec Gateway",
        "status": "available",
        "protocol": "SunSpec Modbus",
        "transports": [
            "Modbus TCP",
            "Modbus RTU / RS485",
        ],
        "active_connections": len(_ACTIVE_GATEWAYS),
    }


# ---------------------------------------------------------------------------
# Connect
# ---------------------------------------------------------------------------

@router.post("/connect")
async def connect_universal_sunspec(
    request: SunSpecConnectionRequest,
    connection_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Connect to a SunSpec-compatible inverter.

    Example TCP:

        POST /connect?connection_id=my-inverter

        {
            "mode": "tcp",
            "host": "192.168.1.100",
            "tcp_port": 502,
            "device_address": 1,
            "timeout": 3
        }

    Example RTU:

        {
            "mode": "rtu",
            "serial_port": "COM3",
            "baudrate": 9600,
            "parity": "N",
            "device_address": 1,
            "timeout": 3
        }
    """

    if not connection_id:
        connection_id = str(uuid.uuid4())

    # Avoid silently replacing an existing active connection.
    if connection_id in _ACTIVE_GATEWAYS:
        try:
            await _ACTIVE_GATEWAYS[connection_id].close()
        except Exception:
            pass

        del _ACTIVE_GATEWAYS[connection_id]

    gateway = _build_gateway(request)

    try:
        await _connect_gateway(gateway)

    except asyncio.CancelledError:
        raise

    except Exception as exc:
        error_text = str(exc).strip()

        if not error_text:
            error_text = exc.__class__.__name__

        raise HTTPException(
            status_code=502,
            detail={
                "error": "sunspec_connection_failed",
                "message": "Unable to connect to or discover a SunSpec device.",
                "reason": error_text,
                "connection_id": connection_id,
                "mode": request.mode,
                "host": request.host if request.mode.lower() == "tcp" else None,
                "serial_port": (
                    request.serial_port
                    if request.mode.lower() == "rtu"
                    else None
                ),
                "device_address": request.device_address,
            },
        ) from exc

    _ACTIVE_GATEWAYS[connection_id] = gateway

    try:
        discovery = await gateway.get_model_summary()
    except Exception:
        discovery = {
            "models": [],
        }

    return {
        "success": True,
        "connection_id": connection_id,
        "status": "connected",
        "data_mode": "real",
        "protocol": "SunSpec Modbus",
        "transport": request.mode,
        "device_address": request.device_address,
        "discovery": discovery,
    }


# ---------------------------------------------------------------------------
# Discovery
# ---------------------------------------------------------------------------

@router.get("/{connection_id}/discovery")
async def sunspec_discovery(
    connection_id: str,
) -> Dict[str, Any]:
    """
    Return discovered SunSpec models.
    """

    gateway = _ACTIVE_GATEWAYS.get(connection_id)

    if gateway is None:
        raise HTTPException(
            status_code=404,
            detail={
                "error": "connection_not_found",
                "message": f"No active SunSpec connection: {connection_id}",
            },
        )

    try:
        discovery = await gateway.get_model_summary()

        return {
            "success": True,
            "connection_id": connection_id,
            "discovery": discovery,
        }

    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail={
                "error": "discovery_failed",
                "message": "Unable to read SunSpec model discovery data.",
                "reason": str(exc),
            },
        ) from exc


# ---------------------------------------------------------------------------
# Device information
# ---------------------------------------------------------------------------

@router.get("/{connection_id}/device")
async def sunspec_device(
    connection_id: str,
) -> Dict[str, Any]:
    """
    Return normalized manufacturer/model/device information.
    """

    gateway = _ACTIVE_GATEWAYS.get(connection_id)

    if gateway is None:
        raise HTTPException(
            status_code=404,
            detail={
                "error": "connection_not_found",
                "message": f"No active SunSpec connection: {connection_id}",
            },
        )

    try:
        device = await gateway.get_device_info()

        return {
            "success": True,
            "connection_id": connection_id,
            "data_mode": "real",
            "device": device,
        }

    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail={
                "error": "device_read_failed",
                "message": "Unable to read SunSpec device information.",
                "reason": str(exc),
            },
        ) from exc


# ---------------------------------------------------------------------------
# Realtime
# ---------------------------------------------------------------------------

@router.get("/{connection_id}/realtime")
async def sunspec_realtime(
    connection_id: str,
) -> Dict[str, Any]:
    """
    Read normalized realtime inverter telemetry.
    """

    gateway = _ACTIVE_GATEWAYS.get(connection_id)

    if gateway is None:
        raise HTTPException(
            status_code=404,
            detail={
                "error": "connection_not_found",
                "message": f"No active SunSpec connection: {connection_id}",
            },
        )

    try:
        realtime = await gateway.read_realtime()

        return {
            "success": True,
            "connection_id": connection_id,
            "data_mode": "real",
            "realtime": realtime,
        }

    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail={
                "error": "realtime_read_failed",
                "message": "Unable to read realtime SunSpec telemetry.",
                "reason": str(exc),
            },
        ) from exc


# ---------------------------------------------------------------------------
# Connection health
# ---------------------------------------------------------------------------

@router.get("/{connection_id}/health")
async def sunspec_connection_health(
    connection_id: str,
) -> Dict[str, Any]:
    """
    Check the health of an active SunSpec connection.
    """

    gateway = _ACTIVE_GATEWAYS.get(connection_id)

    if gateway is None:
        raise HTTPException(
            status_code=404,
            detail={
                "error": "connection_not_found",
                "message": f"No active SunSpec connection: {connection_id}",
            },
        )

    try:
        result = await gateway.health_check()

        return {
            "success": True,
            "connection_id": connection_id,
            "health": result,
        }

    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail={
                "error": "health_check_failed",
                "message": "Unable to check the SunSpec device.",
                "reason": str(exc),
            },
        ) from exc


# ---------------------------------------------------------------------------
# Disconnect
# ---------------------------------------------------------------------------

@router.delete("/{connection_id}")
async def disconnect_universal_sunspec(
    connection_id: str,
) -> Dict[str, Any]:
    """
    Close and remove an active SunSpec connection.
    """

    gateway = _ACTIVE_GATEWAYS.get(connection_id)

    if gateway is None:
        raise HTTPException(
            status_code=404,
            detail={
                "error": "connection_not_found",
                "message": f"No active SunSpec connection: {connection_id}",
            },
        )

    try:
        await gateway.close()

    finally:
        _ACTIVE_GATEWAYS.pop(connection_id, None)

    return {
        "success": True,
        "connection_id": connection_id,
        "status": "disconnected",
    }


# ---------------------------------------------------------------------------
# Debug endpoint
# ---------------------------------------------------------------------------

@router.get("")
async def universal_sunspec_root() -> Dict[str, Any]:
    """
    Basic service information.
    """

    return {
        "service": "SolarIQ+ Universal SunSpec Gateway",
        "version": "1.0.0",
        "protocol": "SunSpec Modbus",
        "transports": {
            "tcp": {
                "supported": True,
                "default_port": 502,
            },
            "rtu": {
                "supported": True,
                "default_baudrate": 9600,
                "default_parity": "N",
            },
        },
        "active_connections": list(_ACTIVE_GATEWAYS.keys()),
    }