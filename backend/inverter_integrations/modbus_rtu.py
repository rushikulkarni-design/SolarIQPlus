"""
Real Modbus RTU / RS485 transport for SolarIQ+.

This transport is manufacturer-independent.

Typical connection:

    SolarIQ+
        ↓
    ModbusRtuTransport
        ↓
    USB-to-RS485 adapter
        ↓
    RS485
        ↓
    Inverter / datalogger
"""

from typing import List

from .modbus_transport import (
    ModbusConnectionError,
    ModbusReadError,
    ModbusTransport,
)


class ModbusRtuTransport(ModbusTransport):
    """
    Modbus RTU transport over a serial RS485 connection.
    """

    def __init__(
        self,
        port: str,
        baudrate: int = 9600,
        bytesize: int = 8,
        parity: str = "N",
        stopbits: int = 1,
        device_address: int = 1,
        timeout: float = 3.0,
    ) -> None:
        super().__init__(
            device_address=device_address,
            timeout=timeout,
        )

        if not port or not port.strip():
            raise ValueError(
                "Serial port cannot be empty."
            )

        if baudrate <= 0:
            raise ValueError(
                "Baudrate must be greater than zero."
            )

        if bytesize not in (5, 6, 7, 8):
            raise ValueError(
                "Bytesize must be between 5 and 8."
            )

        parity = parity.upper()

        if parity not in ("N", "E", "O"):
            raise ValueError(
                "Parity must be N, E, or O."
            )

        if stopbits not in (1, 2):
            raise ValueError(
                "Stopbits must be 1 or 2."
            )

        self.port = port.strip()
        self.baudrate = baudrate
        self.bytesize = bytesize
        self.parity = parity
        self.stopbits = stopbits

        self._client = None

    async def connect(self) -> None:
        """
        Establish the Modbus RTU/RS485 connection.
        """

        try:
            from pymodbus.client import AsyncModbusSerialClient

        except ImportError as exc:
            raise ModbusConnectionError(
                "pymodbus is not installed. "
                "Install it with: pip install pymodbus"
            ) from exc

        try:
            self._client = AsyncModbusSerialClient(
                port=self.port,
                baudrate=self.baudrate,
                bytesize=self.bytesize,
                parity=self.parity,
                stopbits=self.stopbits,
                timeout=self.timeout,
            )

            await self._client.connect()

            if not self._client.connected:
                raise ModbusConnectionError(
                    f"Could not open Modbus RTU port '{self.port}'."
                )

            self.connected = True

        except ModbusConnectionError:
            self.connected = False
            raise

        except Exception as exc:
            self.connected = False

            raise ModbusConnectionError(
                f"Modbus RTU connection failed on "
                f"port '{self.port}'."
            ) from exc

    async def disconnect(self) -> None:
        """
        Close the serial Modbus connection.
        """

        if self._client is not None:
            try:
                self._client.close()
            finally:
                self._client = None

        self.connected = False

    async def read_holding_registers(
        self,
        address: int,
        count: int,
    ) -> List[int]:
        """
        Read holding registers using Modbus function code 03.
        """

        self.validate_register_range(
            address=address,
            count=count,
        )

        if not self.connected or self._client is None:
            raise ModbusConnectionError(
                "Modbus RTU transport is not connected."
            )

        try:
            result = await self._client.read_holding_registers(
                address=address,
                count=count,
                device_id=self.device_address,
            )

        except TypeError:
            try:
                result = await self._client.read_holding_registers(
                    address=address,
                    count=count,
                    slave=self.device_address,
                )

            except Exception as exc:
                raise ModbusReadError(
                    f"Failed to read holding registers "
                    f"{address}-{address + count - 1}."
                ) from exc

        except Exception as exc:
            raise ModbusReadError(
                f"Failed to read holding registers "
                f"{address}-{address + count - 1}."
            ) from exc

        if result.isError():
            raise ModbusReadError(
                f"Modbus device returned an error while reading "
                f"registers {address}-{address + count - 1}."
            )

        registers = getattr(
            result,
            "registers",
            None,
        )

        if registers is None:
            raise ModbusReadError(
                "Modbus response did not contain register data."
            )

        return self.registers_to_uint16(
            list(registers)
        )

    async def read_input_registers(
        self,
        address: int,
        count: int,
    ) -> List[int]:
        """
        Read input registers using Modbus function code 04.
        """

        self.validate_register_range(
            address=address,
            count=count,
        )

        if not self.connected or self._client is None:
            raise ModbusConnectionError(
                "Modbus RTU transport is not connected."
            )

        try:
            result = await self._client.read_input_registers(
                address=address,
                count=count,
                device_id=self.device_address,
            )

        except TypeError:
            try:
                result = await self._client.read_input_registers(
                    address=address,
                    count=count,
                    slave=self.device_address,
                )

            except Exception as exc:
                raise ModbusReadError(
                    f"Failed to read input registers "
                    f"{address}-{address + count - 1}."
                ) from exc

        except Exception as exc:
            raise ModbusReadError(
                f"Failed to read input registers "
                f"{address}-{address + count - 1}."
            ) from exc

        if result.isError():
            raise ModbusReadError(
                f"Modbus device returned an error while reading "
                f"input registers {address}-{address + count - 1}."
            )

        registers = getattr(
            result,
            "registers",
            None,
        )

        if registers is None:
            raise ModbusReadError(
                "Modbus response did not contain register data."
            )

        return self.registers_to_uint16(
            list(registers)
        )