"""
Real Modbus TCP transport for SolarIQ+.

This implements the generic ModbusTransport contract using TCP.

It is intentionally manufacturer-independent.

Typical use:

    SolarIQ+
        ↓
    ModbusTcpTransport
        ↓
    Ethernet / Wi-Fi gateway
        ↓
    Inverter
"""

from typing import List

from .modbus_transport import (
    ModbusConnectionError,
    ModbusReadError,
    ModbusTransport,
)


class ModbusTcpTransport(ModbusTransport):
    """
    Modbus TCP transport.

    The pymodbus package is imported lazily so the rest of the
    SolarIQ+ backend can still start when Modbus support is not
    installed/configured yet.
    """

    def __init__(
        self,
        host: str,
        port: int = 502,
        device_address: int = 1,
        timeout: float = 3.0,
    ) -> None:
        super().__init__(
            device_address=device_address,
            timeout=timeout,
        )

        if not host or not host.strip():
            raise ValueError(
                "Modbus TCP host cannot be empty."
            )

        if not 1 <= port <= 65535:
            raise ValueError(
                "Modbus TCP port must be between 1 and 65535."
            )

        self.host = host.strip()
        self.port = port
        self._client = None

    async def connect(self) -> None:
        """
        Establish a Modbus TCP connection.
        """

        try:
            from pymodbus.client import AsyncModbusTcpClient

        except ImportError as exc:
            raise ModbusConnectionError(
                "pymodbus is not installed. "
                "Install it with: pip install pymodbus"
            ) from exc

        try:
            self._client = AsyncModbusTcpClient(
                host=self.host,
                port=self.port,
                timeout=self.timeout,
            )

            await self._client.connect()

            if not self._client.connected:
                raise ModbusConnectionError(
                    f"Could not connect to Modbus TCP device "
                    f"{self.host}:{self.port}"
                )

            self.connected = True

        except ModbusConnectionError:
            self.connected = False
            raise

        except Exception as exc:
            self.connected = False

            raise ModbusConnectionError(
                f"Modbus TCP connection failed: "
                f"{self.host}:{self.port}"
            ) from exc

    async def disconnect(self) -> None:
        """
        Close the Modbus TCP connection.
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
                "Modbus TCP transport is not connected."
            )

        try:
            result = await self._client.read_holding_registers(
                address=address,
                count=count,
                device_id=self.device_address,
            )

        except TypeError:
            # Compatibility with pymodbus versions that use
            # 'slave' instead of 'device_id'.
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
                "Modbus TCP transport is not connected."
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