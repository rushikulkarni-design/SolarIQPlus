"""
SolarIQ+ provider-agnostic inverter integration package.

This package provides the common contracts, normalized models,
provider registry, and provider adapters used by SolarIQ+.
"""

from .base import InverterProvider

from .capabilities import InverterCapabilities

from .errors import (
    InverterConnectionError,
    InverterError,
    InverterNotSupportedError,
    InverterProtocolError,
    InverterTimeoutError,
)

from .models import (
    ConnectionStatus,
    HistoricalEnergyPoint,
    InverterAlarm,
    InverterConnection,
    InverterDevice,
    InverterEnergy,
    InverterReading,
    InverterRealtimeData,
    InverterStatus,
    InverterSystem,
    ProviderCapability,
    serialize_dataclass_list,
)

from .registry import InverterRegistry


__all__ = [
    "ConnectionStatus",
    "HistoricalEnergyPoint",
    "InverterAlarm",
    "InverterCapabilities",
    "InverterConnection",
    "InverterConnectionError",
    "InverterDevice",
    "InverterEnergy",
    "InverterError",
    "InverterNotSupportedError",
    "InverterProvider",
    "InverterProtocolError",
    "InverterReading",
    "InverterRealtimeData",
    "InverterRegistry",
    "InverterStatus",
    "InverterSystem",
    "InverterTimeoutError",
    "ProviderCapability",
    "serialize_dataclass_list",
]