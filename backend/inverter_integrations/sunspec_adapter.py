"""
Generic SunSpec inverter adapter for SolarIQ+.

This adapter combines:

    ModbusTransport
          ↓
    SunSpecDiscovery
          ↓
    Normalized SolarIQ+ inverter models

It intentionally does not contain manufacturer-specific logic.

Manufacturer-specific adapters should only be required when a device
does not expose the required SunSpec information.
"""

from datetime import datetime, timezone
from typing import List, Optional

from .adapter import InverterAdapter
from .capabilities import InverterCapabilities
from .errors import InverterProtocolError
from .models import (
    HistoricalEnergyPoint,
    InverterAlarm,
    InverterDevice,
    InverterEnergy,
    InverterRealtimeData,
    InverterStatus,
)
from .modbus_transport import ModbusTransport
from .sunspec import SunSpecDiscovery, SunSpecModel


class SunSpecAdapter(InverterAdapter):
    """
    Generic adapter for SunSpec-compatible inverters.
    """

    adapter_id = "sunspec"
    adapter_name = "SunSpec Modbus"

    capabilities = InverterCapabilities(
        realtime=True,
        historical_energy=False,
        alarms=False,
        device_info=True,
        inverter_details=True,
        system_details=False,
        control=False,
        configuration=False,
        local_connection=True,
        cloud_connection=False,
        oauth=False,
    )

    def __init__(
        self,
        transport: ModbusTransport,
        discovery_start_register: int = 0,
    ) -> None:
        self.transport = transport

        self.discovery = SunSpecDiscovery(
            transport=transport,
            start_register=discovery_start_register,
        )

        self._models: List[SunSpecModel] = []

    async def connect(self) -> None:
        """
        Connect to the underlying Modbus device.
        """

        await self.transport.connect()

        self._models = await self.discovery.discover()

    async def disconnect(self) -> None:
        """
        Disconnect from the underlying Modbus device.
        """

        await self.transport.disconnect()
        self._models = []

    async def test_connection(self) -> bool:
        """
        Test the Modbus/SunSpec connection.
        """

        try:
            if not self.transport.connected:
                await self.connect()

            if not self._models:
                self._models = await self.discovery.discover()

            return len(self._models) > 0

        except Exception:
            return False

    async def get_device_info(self) -> InverterDevice:
        """
        Read basic inverter information.

        SunSpec Common Model is normally model 1.
        """

        model = await self._get_model(1)

        registers = await self.transport.read_holding_registers(
            address=model.start_register + 2,
            count=min(model.length, 32),
        )

        registers = self.transport.registers_to_uint16(registers)

        manufacturer = self._decode_string(
            registers,
            0,
            16,
        )

        model_name = self._decode_string(
            registers,
            16,
            16,
        )

        serial_number = self._decode_string(
            registers,
            32,
            16,
        )

        firmware_version = self._decode_string(
            registers,
            48,
            16,
        )

        return InverterDevice(
            manufacturer=manufacturer or "Unknown",
            model=model_name or "Unknown",
            serial_number=serial_number or None,
            firmware_version=firmware_version or None,
            device_id=str(self.transport.device_address),
            connection_type="modbus",
            protocol="sunspec-modbus",
        )

    async def get_realtime(self) -> InverterRealtimeData:
        """
        Read generic real-time inverter telemetry.

        SunSpec inverter model 101 is treated as the primary
        single-phase inverter model when available.
        """

        model = await self._find_first_model(
            [101, 102, 103]
        )

        if model is None:
            raise InverterProtocolError(
                "No supported SunSpec inverter model was discovered."
            )

        registers = await self.transport.read_holding_registers(
            address=model.start_register + 2,
            count=model.length,
        )

        registers = self.transport.registers_to_uint16(registers)

        now = datetime.now(timezone.utc)

        current_power_kw = self._read_scaled(
            registers,
            index=2,
            scale_index=3,
        )

        voltage_v = self._read_scaled(
            registers,
            index=8,
            scale_index=9,
        )

        current_a = self._read_scaled(
            registers,
            index=10,
            scale_index=11,
        )

        frequency_hz = self._read_scaled(
            registers,
            index=16,
            scale_index=17,
        )

        temperature_c = self._read_scaled(
            registers,
            index=22,
            scale_index=23,
        )

        status = InverterStatus(
            state="running",
            online=True,
            fault=False,
            warning=False,
            timestamp=now,
        )

        return InverterRealtimeData(
            timestamp=now,
            current_power_kw=current_power_kw,
            pv_voltage_v=voltage_v,
            pv_current_a=current_a,
            ac_power_kw=current_power_kw,
            grid_frequency_hz=frequency_hz,
            temperature_c=temperature_c,
            status=status,
            raw={
                "model_id": model.model_id,
                "registers": registers,
            },
        )

    async def get_historical_energy(
        self,
        start: Optional[datetime] = None,
        end: Optional[datetime] = None,
    ) -> List[HistoricalEnergyPoint]:
        """
        Historical energy is not assumed to be universally available
        through SunSpec.

        A higher-level adapter can implement this when the device
        exposes an appropriate model or external data source.
        """

        raise NotImplementedError(
            "Historical energy is not universally available through "
            "the generic SunSpec adapter."
        )

    async def get_alarms(self) -> List[InverterAlarm]:
        """
        Return active alarms when supported by a future SunSpec
        alarm/event implementation.
        """

        return []

    async def get_capabilities(self) -> InverterCapabilities:
        """
        Return the adapter capabilities.
        """

        return self.capabilities

    async def _get_model(
        self,
        model_id: int,
    ) -> SunSpecModel:
        """
        Get a discovered SunSpec model or discover models first.
        """

        if not self._models:
            self._models = await self.discovery.discover()

        model = await self._find_model(model_id)

        if model is None:
            raise InverterProtocolError(
                f"SunSpec model {model_id} was not discovered."
            )

        return model

    async def _find_model(
        self,
        model_id: int,
    ) -> Optional[SunSpecModel]:
        """
        Find a model from the current discovery list.
        """

        for model in self._models:
            if model.model_id == model_id:
                return model

        return None

    async def _find_first_model(
        self,
        model_ids: List[int],
    ) -> Optional[SunSpecModel]:
        """
        Find the first available model from a list.
        """

        if not self._models:
            self._models = await self.discovery.discover()

        for model_id in model_ids:
            model = await self._find_model(model_id)

            if model is not None:
                return model

        return None

    @staticmethod
    def _decode_string(
        registers: List[int],
        start: int,
        count: int,
    ) -> str:
        """
        Decode SunSpec string data from 16-bit registers.

        Each register contains two ASCII bytes.
        """

        if start >= len(registers):
            return ""

        end = min(
            start + count,
            len(registers),
        )

        raw = bytearray()

        for register in registers[start:end]:
            raw.append((register >> 8) & 0xFF)
            raw.append(register & 0xFF)

        return raw.rstrip(b"\x00 ").decode(
            "ascii",
            errors="ignore",
        ).strip()

    @staticmethod
    def _read_scaled(
        registers: List[int],
        index: int,
        scale_index: int,
    ) -> Optional[float]:
        """
        Read a signed 16-bit SunSpec value and apply its scale factor.

        Returns None when the requested registers are unavailable.
        """

        if index >= len(registers):
            return None

        if scale_index >= len(registers):
            return None

        value = registers[index]

        if value >= 32768:
            value -= 65536

        scale = registers[scale_index]

        if scale >= 32768:
            scale -= 65536

        try:
            return float(value) * (10 ** scale)

        except (TypeError, ValueError, OverflowError):
            return None