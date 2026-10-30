"""
Generic Modbus transport for SolarIQ+ inverter integrations.

This module contains only communication/transport logic.

It does NOT contain:
- manufacturer-specific register maps
- SunSpec model parsing
- SolarIQ+ business logic
- inverter-specific calculations

Those responsibilities belong to higher-level adapters.
"""

from abc import ABC, abstractmethod
from typing import List, Optional


class ModbusTransportError(Exception):
    """Base error for Modbus transport failures."""


class ModbusConnectionError(ModbusTransportError):
    """Raised when a Modbus connection cannot be established."""


class ModbusReadError(ModbusTransportError):
    """Raised when Modbus registers cannot be read."""


class ModbusTransport(ABC):
    """
    Common interface for Modbus RTU/TCP communication.
    """

    def __init__(
        self,
        device_address: int = 1,
        timeout: float = 3.0,
    ) -> None:
        if not 1 <= device_address <= 247:
            raise ValueError(
                "Modbus device address must be between 1 and 247."
            )

        if timeout <= 0:
            raise ValueError(
                "Modbus timeout must be greater than zero."
            )

        self.device_address = device_address
        self.timeout = timeout
        self.connected = False

    @abstractmethod
    async def connect(self) -> None:
        """
        Establish the physical/network Modbus connection.
        """
        raise NotImplementedError

    @abstractmethod
    async def disconnect(self) -> None:
        """
        Close the Modbus connection.
        """
        raise NotImplementedError

    @abstractmethod
    async def read_holding_registers(
        self,
        address: int,
        count: int,
    ) -> List[int]:
        """
        Read holding registers.

        Returns:
            List of unsigned 16-bit register values.
        """
        raise NotImplementedError

    async def read_input_registers(
        self,
        address: int,
        count: int,
    ) -> List[int]:
        """
        Read input registers.

        Subclasses may override this if the transport/device
        supports input-register reads.
        """
        raise NotImplementedError(
            "Input-register reads are not implemented "
            "by this transport."
        )

    async def test_connection(self) -> bool:
        """
        Test whether the Modbus device is reachable.
        """

        try:
            if not self.connected:
                await self.connect()

            await self.read_holding_registers(
                address=0,
                count=1,
            )

            return True

        except Exception:
            return False

    @staticmethod
    def validate_register_range(
        address: int,
        count: int,
    ) -> None:
        """
        Validate a Modbus register request.
        """

        if address < 0:
            raise ValueError(
                "Modbus register address cannot be negative."
            )

        if count <= 0:
            raise ValueError(
                "Modbus register count must be greater than zero."
            )

        if count > 125:
            raise ValueError(
                "A Modbus read cannot request more than 125 registers."
            )

    @staticmethod
    def registers_to_uint16(
        registers: List[int],
    ) -> List[int]:
        """
        Validate and return registers as unsigned 16-bit values.
        """

        result: List[int] = []

        for value in registers:
            if not isinstance(value, int):
                raise ValueError(
                    "Modbus register values must be integers."
                )

            if not 0 <= value <= 65535:
                raise ValueError(
                    "Modbus register value must be between 0 and 65535."
                )

            result.append(value)

        return result

    @staticmethod
    def registers_to_int16(
        registers: List[int],
    ) -> List[int]:
        """
        Convert unsigned 16-bit register values to signed integers.
        """

        values = ModbusTransport.registers_to_uint16(
            registers
        )

        result: List[int] = []

        for value in values:
            if value >= 32768:
                value -= 65536

            result.append(value)

        return result

    @staticmethod
    def registers_to_uint32(
        registers: List[int],
        word_order: str = "big",
    ) -> int:
        """
        Convert two 16-bit registers into an unsigned 32-bit value.

        word_order:
            "big"    -> high word, low word
            "little" -> low word, high word
        """

        values = ModbusTransport.registers_to_uint16(
            registers
        )

        if len(values) != 2:
            raise ValueError(
                "A uint32 value requires exactly two registers."
            )

        if word_order == "big":
            high, low = values

        elif word_order == "little":
            low, high = values

        else:
            raise ValueError(
                "word_order must be 'big' or 'little'."
            )

        return (high << 16) | low