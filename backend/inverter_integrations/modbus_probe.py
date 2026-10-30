"""
Generic Modbus protocol probe for SolarIQ+.

Purpose:
    Safely inspect a Modbus device before selecting a higher-level
    inverter adapter.

The probe does not assume:
    - SunSpec
    - KSolare
    - Huawei
    - Sungrow
    - Growatt
    - any other manufacturer

It only tests whether a Modbus device responds at a given address
and whether the beginning of its register space can be read.
"""

from dataclasses import dataclass
from typing import List, Optional

from .modbus_transport import ModbusTransport
from .sunspec import SUNSPEC_SIGNATURE


@dataclass
class ModbusProbeResult:
    """
    Result of a Modbus device probe.
    """

    device_address: int
    reachable: bool
    registers: List[int]
    sunspec_detected: bool
    error: Optional[str] = None

    def to_dict(self) -> dict:
        """
        Return a JSON-safe representation.
        """

        return {
            "device_address": self.device_address,
            "reachable": self.reachable,
            "registers": self.registers,
            "sunspec_detected": self.sunspec_detected,
            "error": self.error,
        }


class ModbusProbe:
    """
    Probe a Modbus device without making manufacturer-specific
    assumptions.
    """

    def __init__(
        self,
        transport: ModbusTransport,
    ) -> None:
        self.transport = transport

    async def probe(
        self,
        register_address: int = 0,
        register_count: int = 16,
    ) -> ModbusProbeResult:
        """
        Probe the configured Modbus device.

        Args:
            register_address:
                Starting register address to inspect.

            register_count:
                Number of registers to read.
        """

        self.transport.validate_register_range(
            address=register_address,
            count=register_count,
        )

        try:
            if not self.transport.connected:
                await self.transport.connect()

            registers = await self.transport.read_holding_registers(
                address=register_address,
                count=register_count,
            )

            registers = self.transport.registers_to_uint16(
                registers
            )

            sunspec_detected = (
                len(registers) >= 1
                and registers[0] == SUNSPEC_SIGNATURE
            )

            return ModbusProbeResult(
                device_address=self.transport.device_address,
                reachable=True,
                registers=registers,
                sunspec_detected=sunspec_detected,
            )

        except Exception as exc:
            return ModbusProbeResult(
                device_address=self.transport.device_address,
                reachable=False,
                registers=[],
                sunspec_detected=False,
                error=str(exc),
            )

    async def scan_addresses(
        self,
        start_address: int = 1,
        end_address: int = 16,
        register_address: int = 0,
        register_count: int = 2,
    ) -> List[ModbusProbeResult]:
        """
        Scan a range of Modbus device addresses.

        This is useful when the inverter/logger address is unknown.
        """

        if not 1 <= start_address <= 247:
            raise ValueError(
                "start_address must be between 1 and 247."
            )

        if not 1 <= end_address <= 247:
            raise ValueError(
                "end_address must be between 1 and 247."
            )

        if start_address > end_address:
            raise ValueError(
                "start_address cannot be greater than end_address."
            )

        results: List[ModbusProbeResult] = []

        original_address = self.transport.device_address

        try:
            for address in range(
                start_address,
                end_address + 1,
            ):
                self.transport.device_address = address

                result = await self.probe(
                    register_address=register_address,
                    register_count=register_count,
                )

                results.append(result)

        finally:
            self.transport.device_address = original_address

        return results

    @staticmethod
    def reachable_devices(
        results: List[ModbusProbeResult],
    ) -> List[ModbusProbeResult]:
        """
        Return only devices that responded successfully.
        """

        return [
            result
            for result in results
            if result.reachable
        ]

    @staticmethod
    def sunspec_devices(
        results: List[ModbusProbeResult],
    ) -> List[ModbusProbeResult]:
        """
        Return only devices where SunSpec was detected.
        """

        return [
            result
            for result in results
            if result.reachable
            and result.sunspec_detected
        ]