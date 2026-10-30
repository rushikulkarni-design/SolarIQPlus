"""
SolarIQ+ KSolare Provider

Provider-level wrapper around the local KSolare adapter.

Architecture:

    Universal SolarIQ+ Registry
              |
              v
       KSolareProvider
              |
              v
        KSolareAdapter
              |
              v
     Modbus / Local Transport

The provider exposes the common SolarIQ+ InverterProvider
contract while the adapter handles manufacturer/protocol-specific
communication.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

from .adapter import InverterAdapter
from .base import InverterProvider
from .errors import InverterNotSupportedError
from .models import (
    InverterReading,
    InverterSystem,
    ProviderCapability,
)


class KSolareProvider(InverterProvider):
    """
    Universal SolarIQ+ provider wrapper for KSolare inverters.

    The underlying adapter can later use:
        - real Modbus RTU
        - real Modbus TCP
        - another validated local transport

    During development it can use the KSolare simulator.
    """

    provider_id = "ksolare"
    provider_name = "KSolare"

    # --------------------------------------------------------
    # Current provider data mode
    # --------------------------------------------------------
    #
    # The current bootstrap configuration uses the
    # SimulatedKSolareTransport, so the provider explicitly
    # reports simulator mode.
    #
    # When real hardware is enabled, this value should become
    # "real".
    #
    data_mode = "simulator"

    capabilities = ProviderCapability(
        realtime=True,
        historical_energy=False,
        alarms=True,
        inverter_details=True,
        system_details=False,
        oauth=False,
        local_gateway=True,
    )

    def __init__(
        self,
        adapter: InverterAdapter,
    ):
        self.adapter = adapter
        self._connected = False

    # ========================================================
    # INTERNAL CONNECTION
    # ========================================================

    async def _ensure_connected(self) -> None:
        """
        Make sure the underlying local adapter is connected.

        KSolare is a local integration and does not use OAuth.
        """

        if self._connected:
            return

        await self.adapter.connect()

        self._connected = True

    # ========================================================
    # AUTHORIZATION
    # ========================================================

    async def get_authorization_url(
        self,
        project_id: str,
        state: str,
    ) -> str:
        """
        KSolare does not use cloud OAuth authorization.

        Connection is performed through the configured local
        adapter/transport.
        """

        raise InverterNotSupportedError(
            "KSolare local integration does not use OAuth "
            "authorization."
        )

    async def handle_callback(
        self,
        code: str,
        state: str,
    ) -> Dict[str, Any]:
        """
        KSolare has no OAuth callback flow.
        """

        raise InverterNotSupportedError(
            "KSolare local integration does not support "
            "OAuth callbacks."
        )

    async def revoke_connection(
        self,
        connection_id: str,
    ) -> None:
        """
        Disconnect the local KSolare adapter.

        No cloud token revocation is required.
        """

        if self._connected:
            await self.adapter.disconnect()

        self._connected = False

    # ========================================================
    # SYSTEM DISCOVERY
    # ========================================================

    async def get_systems(
        self,
        connection_id: str,
    ) -> List[InverterSystem]:
        """
        Expose the locally connected KSolare inverter as one
        normalized SolarIQ+ system.
        """

        await self._ensure_connected()

        device = await self.adapter.get_device_info()

        realtime = await self.adapter.get_realtime()

        system_id = (
            device.serial_number
            or device.device_id
            or connection_id
            or "ksolare-local-1"
        )

        status = "unknown"

        if realtime.status is not None:
            status = realtime.status.state

        system = InverterSystem(
            provider=self.provider_id,
            external_system_id=str(system_id),
            name=(
                f"{device.manufacturer} "
                f"{device.model}"
            ),
            timezone=None,
            status=status,
            capacity_kw=device.rated_power_kw,
            raw={
                "device": device,
                "realtime": realtime,
                "connection_id": connection_id,
            },
        )

        return [system]

    # ========================================================
    # SYSTEM DETAILS
    # ========================================================

    async def get_system_details(
        self,
        connection_id: str,
        system_id: str,
    ) -> InverterSystem:
        """
        Return normalized information for the local inverter.
        """

        await self._ensure_connected()

        systems = await self.get_systems(
            connection_id=connection_id
        )

        for system in systems:
            if (
                system.external_system_id
                == str(system_id)
            ):
                return system

        raise KeyError(
            f"KSolare system '{system_id}' "
            "was not found."
        )

    # ========================================================
    # REALTIME
    # ========================================================

    async def get_realtime(
        self,
        connection_id: str,
        system_id: str,
    ) -> List[InverterReading]:
        """
        Convert KSolare realtime telemetry into the common
        SolarIQ+ InverterReading model.
        """

        await self._ensure_connected()

        realtime = await self.adapter.get_realtime()

        device = await self.adapter.get_device_info()

        actual_system_id = (
            device.serial_number
            or device.device_id
            or system_id
        )

        reading = InverterReading(
            provider=self.provider_id,
            external_system_id=str(
                actual_system_id
            ),
            timestamp=realtime.timestamp,
            power_kw=realtime.current_power_kw,
            energy_kwh=(
                realtime.energy.today_kwh
                if realtime.energy
                else None
            ),
            inverter_status=(
                realtime.status.state
                if realtime.status
                else None
            ),
            grid_power_kw=None,
            battery_soc_percent=None,
            raw={
                "device": device,
                "realtime": realtime,
            },
        )

        return [reading]

    # ========================================================
    # HISTORICAL ENERGY
    # ========================================================

    async def get_historical_energy(
        self,
        connection_id: str,
        system_id: str,
        start_at: datetime,
        end_at: datetime,
    ) -> List[InverterReading]:
        """
        Historical energy is not currently exposed by the
        KSolare local adapter.

        This is intentionally reported as unsupported rather
        than returning fabricated historical data.
        """

        raise InverterNotSupportedError(
            "KSolare local integration does not currently "
            "provide historical energy through the validated "
            "adapter."
        )

    # ========================================================
    # ALARMS
    # ========================================================

    async def get_alarms(
        self,
        connection_id: str,
        system_id: str,
        start_at: Optional[datetime] = None,
        end_at: Optional[datetime] = None,
    ) -> List[Dict[str, Any]]:
        """
        Return normalized KSolare alarms.

        The current adapter provides current alarm state rather
        than a historical alarm event database.
        """

        await self._ensure_connected()

        alarms = await self.adapter.get_alarms()

        normalized: List[Dict[str, Any]] = []

        for alarm in alarms:
            if hasattr(alarm, "to_dict"):
                normalized.append(
                    alarm.to_dict()
                )

            elif hasattr(
                alarm,
                "__dict__",
            ):
                normalized.append(
                    {
                        key: value
                        for key, value in vars(
                            alarm
                        ).items()
                        if not key.startswith("_")
                    }
                )

            else:
                normalized.append(
                    {
                        "alarm": str(alarm)
                    }
                )

        return normalized