"""
Universal inverter capability definitions for SolarIQ+.

This describes what an inverter adapter can actually provide.
It is intentionally separate from ProviderCapability, which is used
by the existing cloud/provider architecture.
"""

from dataclasses import dataclass, asdict
from typing import Dict


@dataclass(frozen=True)
class InverterCapabilities:
    """
    Capabilities supported by a universal inverter adapter.

    These flags describe functionality available through the adapter,
    regardless of whether the underlying connection is:

    - SunSpec Modbus
    - Modbus RTU
    - Modbus TCP
    - Manufacturer cloud API
    - Manufacturer gateway
    - Other supported protocols
    """

    realtime: bool = False
    historical_energy: bool = False
    alarms: bool = False

    device_info: bool = False
    inverter_details: bool = False
    system_details: bool = False

    control: bool = False
    configuration: bool = False

    local_connection: bool = False
    cloud_connection: bool = False

    oauth: bool = False

    def to_dict(self) -> Dict[str, bool]:
        """Return capabilities as a JSON-safe dictionary."""

        return asdict(self)

    def supports(self, capability: str) -> bool:
        """
        Check whether a specific capability is supported.

        Example:
            capabilities.supports("realtime")
        """

        if not hasattr(self, capability):
            return False

        return bool(getattr(self, capability))

    def supported_features(self) -> list[str]:
        """Return a list of enabled capability names."""

        return [
            name
            for name, enabled in self.to_dict().items()
            if enabled
        ]