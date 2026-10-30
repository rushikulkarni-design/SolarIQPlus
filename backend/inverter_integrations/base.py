"""
Provider-agnostic interface for real inverter integrations.

Every manufacturer/cloud connector implements this interface.
The rest of SolarIQ+ never talks directly to a manufacturer's
raw API response.
"""

from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any, Dict, List, Optional

from .models import (
    InverterReading,
    InverterSystem,
    ProviderCapability,
)


class InverterProvider(ABC):
    """
    Universal provider contract for SolarIQ+ inverter integrations.

    Every provider must expose the same normalized interface,
    regardless of whether the underlying connection is:

        - Cloud API
        - OAuth
        - Local gateway
        - Modbus RTU / RS485
        - Modbus TCP
        - Simulator

    data_mode identifies whether the provider is currently
    backed by real data or simulated/demo data.
    """

    provider_id: str
    provider_name: str
    capabilities: ProviderCapability

    # --------------------------------------------------------
    # Provider data mode
    # --------------------------------------------------------
    #
    # Supported values:
    #
    #     real
    #     simulator
    #     demo
    #
    # Providers can override this explicitly.
    # The default is real because a provider implementation
    # should not be considered simulated unless it says so.
    #
    data_mode: str = "real"

    @abstractmethod
    async def get_authorization_url(
        self,
        project_id: str,
        state: str,
    ) -> str:
        """
        Return the provider's official authorization URL.
        """
        raise NotImplementedError

    @abstractmethod
    async def handle_callback(
        self,
        code: str,
        state: str,
    ) -> Dict[str, Any]:
        """
        Exchange the provider callback for server-side credentials.
        """
        raise NotImplementedError

    @abstractmethod
    async def revoke_connection(
        self,
        connection_id: str,
    ) -> None:
        """
        Revoke/de-authorize a provider connection.
        """
        raise NotImplementedError

    @abstractmethod
    async def get_systems(
        self,
        connection_id: str,
    ) -> List[InverterSystem]:
        """
        Return systems/plants available to the authorized user.
        """
        raise NotImplementedError

    @abstractmethod
    async def get_realtime(
        self,
        connection_id: str,
        system_id: str,
    ) -> List[InverterReading]:
        """
        Return current/near-real-time normalized readings.
        """
        raise NotImplementedError

    @abstractmethod
    async def get_historical_energy(
        self,
        connection_id: str,
        system_id: str,
        start_at: datetime,
        end_at: datetime,
    ) -> List[InverterReading]:
        """
        Return normalized historical production readings.
        """
        raise NotImplementedError

    @abstractmethod
    async def get_alarms(
        self,
        connection_id: str,
        system_id: str,
        start_at: Optional[datetime] = None,
        end_at: Optional[datetime] = None,
    ) -> List[Dict[str, Any]]:
        """
        Return normalized or provider-mapped alarms/events.
        """
        raise NotImplementedError

    @abstractmethod
    async def get_system_details(
        self,
        connection_id: str,
        system_id: str,
    ) -> InverterSystem:
        """
        Return normalized system/inverter information.
        """
        raise NotImplementedError