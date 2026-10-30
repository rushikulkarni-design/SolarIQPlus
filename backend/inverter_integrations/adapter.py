"""
Universal inverter adapter contract for SolarIQ+.

This interface is used by local/protocol-based integrations such as:

- SunSpec Modbus
- Modbus RTU
- Modbus TCP
- Manufacturer gateways
- Other supported local inverter protocols

Cloud/provider integrations such as Enphase continue to use
InverterProvider from base.py.

The rest of SolarIQ+ should consume normalized models rather than
manufacturer-specific responses.
"""

from abc import ABC, abstractmethod
from datetime import datetime
from typing import List, Optional

from .capabilities import InverterCapabilities
from .models import (
    HistoricalEnergyPoint,
    InverterAlarm,
    InverterDevice,
    InverterRealtimeData,
)


class InverterAdapter(ABC):
    """
    Common interface for universal/local inverter adapters.
    """

    adapter_id: str = "unknown"
    adapter_name: str = "Unknown"

    capabilities: InverterCapabilities = InverterCapabilities()

    @abstractmethod
    async def connect(self) -> None:
        """
        Establish a connection to the inverter or gateway.
        """
        raise NotImplementedError

    @abstractmethod
    async def disconnect(self) -> None:
        """
        Close the inverter/gateway connection.
        """
        raise NotImplementedError

    @abstractmethod
    async def test_connection(self) -> bool:
        """
        Verify that the inverter can be reached and queried.
        """
        raise NotImplementedError

    @abstractmethod
    async def get_device_info(self) -> InverterDevice:
        """
        Discover normalized inverter/device information.
        """
        raise NotImplementedError

    @abstractmethod
    async def get_realtime(self) -> InverterRealtimeData:
        """
        Return normalized real-time inverter telemetry.
        """
        raise NotImplementedError

    @abstractmethod
    async def get_historical_energy(
        self,
        start: Optional[datetime] = None,
        end: Optional[datetime] = None,
    ) -> List[HistoricalEnergyPoint]:
        """
        Return normalized historical energy data.
        """
        raise NotImplementedError

    @abstractmethod
    async def get_alarms(self) -> List[InverterAlarm]:
        """
        Return normalized inverter alarms/events.
        """
        raise NotImplementedError

    async def get_capabilities(self) -> InverterCapabilities:
        """
        Return capabilities supported by this adapter.
        """
        return self.capabilities

    async def health_check(self) -> bool:
        """
        Generic adapter health check.
        """
        try:
            return await self.test_connection()
        except Exception:
            return False