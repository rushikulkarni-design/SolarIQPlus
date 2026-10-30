"""
SolarIQ+ Inverter Integration Bootstrap

Builds the provider registry used by the monitoring layer.

Current providers:
    - Enphase
    - KSolare

KSolare supports two transport modes:

    KSOLARE_MODE=simulator
        Uses SimulatedKSolareTransport.

    KSOLARE_MODE=real
        Uses ModbusRtuTransport and connects to a
        physical KSolare inverter / validated RS485 gateway.

The simulator remains the default so the application can start
safely without physical inverter hardware connected.
"""

import os
from typing import Optional

from enphase_connector import EnphaseConnector

from .enphase_provider import EnphaseProvider
from .ksolare_provider import KSolareProvider
from .ksolare_adapter import KSolareAdapter
from .ksolare_simulator import SimulatedKSolareTransport
from .modbus_rtu import ModbusRtuTransport
from .registry import InverterRegistry


# ============================================================
# Environment Helpers
# ============================================================

def _get_env_int(
    name: str,
    default: int,
) -> int:
    """
    Read an integer environment variable safely.
    """

    value = os.getenv(name)

    if value is None:
        return default

    try:
        return int(value)

    except ValueError as exc:
        raise ValueError(
            f"{name} must be an integer. "
            f"Received: {value!r}"
        ) from exc


def _get_env_float(
    name: str,
    default: float,
) -> float:
    """
    Read a floating-point environment variable safely.
    """

    value = os.getenv(name)

    if value is None:
        return default

    try:
        return float(value)

    except ValueError as exc:
        raise ValueError(
            f"{name} must be a number. "
            f"Received: {value!r}"
        ) from exc


def _get_ksolare_transport():
    """
    Build the KSolare transport from environment configuration.

    Supported modes:

        simulator
        real

    Simulator is the default.

    Real mode uses Modbus RTU / RS485.
    """

    mode = os.getenv(
        "KSOLARE_MODE",
        "simulator",
    ).strip().lower()

    if mode == "simulator":

        return SimulatedKSolareTransport()

    if mode != "real":

        raise ValueError(
            "Invalid KSOLARE_MODE. "
            "Use 'simulator' or 'real'."
        )

    # --------------------------------------------------------
    # Real KSolare / RS485 configuration
    # --------------------------------------------------------

    port = os.getenv(
        "KSOLARE_SERIAL_PORT",
        "",
    ).strip()

    if not port:

        raise ValueError(
            "KSOLARE_MODE=real requires "
            "KSOLARE_SERIAL_PORT."
        )

    baudrate = _get_env_int(
        "KSOLARE_BAUDRATE",
        9600,
    )

    bytesize = _get_env_int(
        "KSOLARE_BYTESIZE",
        8,
    )

    parity = os.getenv(
        "KSOLARE_PARITY",
        "N",
    ).strip().upper()

    stopbits = _get_env_int(
        "KSOLARE_STOPBITS",
        1,
    )

    device_address = _get_env_int(
        "KSOLARE_DEVICE_ADDRESS",
        1,
    )

    timeout = _get_env_float(
        "KSOLARE_TIMEOUT",
        3.0,
    )

    return ModbusRtuTransport(
        port=port,
        baudrate=baudrate,
        bytesize=bytesize,
        parity=parity,
        stopbits=stopbits,
        device_address=device_address,
        timeout=timeout,
    )


# ============================================================
# Registry Builder
# ============================================================

def build_inverter_registry(
    enphase_connector: Optional[
        EnphaseConnector
    ] = None,
) -> InverterRegistry:
    """
    Build and return the SolarIQ+ inverter provider registry.
    """

    registry = InverterRegistry()

    # --------------------------------------------------------
    # Enphase
    # --------------------------------------------------------

    connector = (
        enphase_connector
        if enphase_connector is not None
        else EnphaseConnector()
    )

    enphase_provider = EnphaseProvider(
        connector
    )

    registry.register(
        enphase_provider
    )

    # --------------------------------------------------------
    # KSolare
    # --------------------------------------------------------

    ksolare_transport = (
        _get_ksolare_transport()
    )

    ksolare_adapter = KSolareAdapter(
        transport=ksolare_transport,
    )

    ksolare_provider = KSolareProvider(
        adapter=ksolare_adapter,
    )

    registry.register(
        ksolare_provider
    )

    return registry


# ============================================================
# Direct Development Test
# ============================================================

if __name__ == "__main__":

    registry = build_inverter_registry()

    print(
        "Registered inverter providers:"
    )

    for provider in registry.all():

        print(
            f"- {provider.provider_id}: "
            f"{provider.provider_name}"
        )

    mode = os.getenv(
        "KSOLARE_MODE",
        "simulator",
    ).strip().lower()

    print(
        f"KSolare mode: {mode}"
    )