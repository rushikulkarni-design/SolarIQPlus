"""
Shared data contracts for all SolarIQ+ inverter integrations.

This file keeps the original provider-agnostic SolarIQ+ contracts and
adds universal normalized models for local/protocol-based inverter
adapters.

Provider-specific responses must be converted into these normalized
models before the rest of SolarIQ+ consumes the data.
"""

from dataclasses import asdict, dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional


# ============================================================================
# PROVIDER / CLOUD INTEGRATION CONTRACTS
# ============================================================================


class ConnectionStatus(str, Enum):
    """Lifecycle status of a SolarIQ+ inverter connection."""

    DISCONNECTED = "disconnected"
    AUTHORIZING = "authorizing"
    CONNECTED = "connected"
    ERROR = "error"
    REVOKED = "revoked"


@dataclass
class ProviderCapability:
    """Capabilities exposed by a cloud/manufacturer provider adapter."""

    realtime: bool = False
    historical_energy: bool = False
    alarms: bool = False
    inverter_details: bool = False
    system_details: bool = False
    oauth: bool = False
    local_gateway: bool = False

    def to_dict(self) -> Dict[str, bool]:
        return {
            "realtime": self.realtime,
            "historical_energy": self.historical_energy,
            "alarms": self.alarms,
            "inverter_details": self.inverter_details,
            "system_details": self.system_details,
            "oauth": self.oauth,
            "local_gateway": self.local_gateway,
        }


@dataclass
class InverterSystem:
    """Normalized plant/system representation used by provider adapters."""

    provider: str
    external_system_id: str
    name: Optional[str] = None
    timezone: Optional[str] = None
    status: Optional[str] = None
    capacity_kw: Optional[float] = None
    raw: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "provider": self.provider,
            "external_system_id": self.external_system_id,
            "name": self.name,
            "timezone": self.timezone,
            "status": self.status,
            "capacity_kw": self.capacity_kw,
            "raw": self.raw,
        }


@dataclass
class InverterReading:
    """Normalized time-series reading used by provider adapters."""

    provider: str
    external_system_id: str
    timestamp: datetime
    power_kw: Optional[float] = None
    energy_kwh: Optional[float] = None
    inverter_status: Optional[str] = None
    grid_power_kw: Optional[float] = None
    battery_soc_percent: Optional[float] = None
    raw: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "provider": self.provider,
            "external_system_id": self.external_system_id,
            "timestamp": (
                self.timestamp.isoformat()
                if self.timestamp
                else None
            ),
            "power_kw": self.power_kw,
            "energy_kwh": self.energy_kwh,
            "inverter_status": self.inverter_status,
            "grid_power_kw": self.grid_power_kw,
            "battery_soc_percent": self.battery_soc_percent,
            "raw": self.raw,
        }


@dataclass
class InverterConnection:
    """
    Project/provider connection metadata.

    Secrets and OAuth tokens must NOT be stored in this model.
    They belong in the server-side credential store.
    """

    project_id: str
    provider_id: str
    provider_name: str
    external_system_id: Optional[str]
    status: ConnectionStatus
    data_mode: str = "real"
    connected_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "project_id": self.project_id,
            "provider_id": self.provider_id,
            "provider_name": self.provider_name,
            "external_system_id": self.external_system_id,
            "status": self.status.value,
            "data_mode": self.data_mode,
            "connected_at": (
                self.connected_at.isoformat()
                if self.connected_at
                else None
            ),
            "updated_at": (
                self.updated_at.isoformat()
                if self.updated_at
                else None
            ),
            "metadata": self.metadata,
        }


# ============================================================================
# UNIVERSAL INVERTER / PROTOCOL CONTRACTS
# ============================================================================


@dataclass
class InverterDevice:
    """Manufacturer/model information discovered from an inverter or gateway."""

    manufacturer: str
    model: str
    serial_number: Optional[str] = None
    firmware_version: Optional[str] = None
    rated_power_kw: Optional[float] = None
    device_id: Optional[str] = None
    connection_type: Optional[str] = None
    protocol: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "manufacturer": self.manufacturer,
            "model": self.model,
            "serial_number": self.serial_number,
            "firmware_version": self.firmware_version,
            "rated_power_kw": self.rated_power_kw,
            "device_id": self.device_id,
            "connection_type": self.connection_type,
            "protocol": self.protocol,
        }


@dataclass
class InverterStatus:
    """Normalized operational status."""

    state: str
    online: bool = True
    fault: bool = False
    warning: bool = False
    message: Optional[str] = None
    timestamp: Optional[datetime] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "state": self.state,
            "online": self.online,
            "fault": self.fault,
            "warning": self.warning,
            "message": self.message,
            "timestamp": (
                self.timestamp.isoformat()
                if self.timestamp
                else None
            ),
        }


@dataclass
class InverterEnergy:
    """Normalized cumulative energy counters."""

    today_kwh: Optional[float] = None
    month_kwh: Optional[float] = None
    year_kwh: Optional[float] = None
    total_kwh: Optional[float] = None
    timestamp: Optional[datetime] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "today_kwh": self.today_kwh,
            "month_kwh": self.month_kwh,
            "year_kwh": self.year_kwh,
            "total_kwh": self.total_kwh,
            "timestamp": (
                self.timestamp.isoformat()
                if self.timestamp
                else None
            ),
        }


@dataclass
class InverterRealtimeData:
    """Detailed normalized real-time telemetry for universal adapters."""

    timestamp: datetime
    current_power_kw: Optional[float] = None
    pv_voltage_v: Optional[float] = None
    pv_current_a: Optional[float] = None
    dc_power_kw: Optional[float] = None
    ac_voltage_v: Optional[float] = None
    ac_current_a: Optional[float] = None
    ac_power_kw: Optional[float] = None
    grid_frequency_hz: Optional[float] = None
    temperature_c: Optional[float] = None
    status: Optional[InverterStatus] = None
    energy: Optional[InverterEnergy] = None
    raw: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "timestamp": self.timestamp.isoformat(),
            "current_power_kw": self.current_power_kw,
            "pv_voltage_v": self.pv_voltage_v,
            "pv_current_a": self.pv_current_a,
            "dc_power_kw": self.dc_power_kw,
            "ac_voltage_v": self.ac_voltage_v,
            "ac_current_a": self.ac_current_a,
            "ac_power_kw": self.ac_power_kw,
            "grid_frequency_hz": self.grid_frequency_hz,
            "temperature_c": self.temperature_c,
            "status": (
                self.status.to_dict()
                if self.status
                else None
            ),
            "energy": (
                self.energy.to_dict()
                if self.energy
                else None
            ),
            "raw": self.raw,
        }


@dataclass
class InverterAlarm:
    """Normalized inverter alarm/event."""

    code: Optional[str] = None
    severity: str = "info"
    message: str = ""
    active: bool = True
    timestamp: Optional[datetime] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "code": self.code,
            "severity": self.severity,
            "message": self.message,
            "active": self.active,
            "timestamp": (
                self.timestamp.isoformat()
                if self.timestamp
                else None
            ),
        }


@dataclass
class HistoricalEnergyPoint:
    """Normalized historical energy sample."""

    timestamp: datetime
    energy_kwh: float
    power_kw: Optional[float] = None
    raw: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "timestamp": self.timestamp.isoformat(),
            "energy_kwh": self.energy_kwh,
            "power_kw": self.power_kw,
            "raw": self.raw,
        }


# ============================================================================
# SERIALIZATION HELPERS
# ============================================================================


def serialize_dataclass_list(
    items: List[Any],
) -> List[Dict[str, Any]]:
    """Serialize a list of normalized dataclass models."""

    serialized: List[Dict[str, Any]] = []

    for item in items:
        if hasattr(item, "to_dict"):
            serialized.append(item.to_dict())
        else:
            serialized.append(asdict(item))

    return serialized