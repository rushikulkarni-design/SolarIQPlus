"""
SunSpec discovery utilities for SolarIQ+.

This module provides generic SunSpec model discovery on top of the
ModbusTransport abstraction.

It does not contain manufacturer-specific register maps.

The goal is to discover what SunSpec models a device exposes before
a higher-level inverter adapter reads and normalizes the data.
"""

from dataclasses import dataclass
from typing import List, Optional

from .errors import InverterProtocolError
from .modbus_transport import ModbusTransport


SUNSPEC_SIGNATURE = 0x5375  # ASCII "Su"


@dataclass(frozen=True)
class SunSpecModel:
    """
    A discovered SunSpec model.
    """

    model_id: int
    start_register: int
    length: int

    @property
    def end_register(self) -> int:
        """
        Last register occupied by this model.
        """
        return self.start_register + self.length + 1


class SunSpecDiscovery:
    """
    Discover SunSpec models exposed by a Modbus device.
    """

    def __init__(
        self,
        transport: ModbusTransport,
        start_register: int = 0,
        max_registers: int = 4096,
    ) -> None:
        if start_register < 0:
            raise ValueError(
                "SunSpec start register cannot be negative."
            )

        if max_registers <= 0:
            raise ValueError(
                "max_registers must be greater than zero."
            )

        self.transport = transport
        self.start_register = start_register
        self.max_registers = max_registers

    async def discover(self) -> List[SunSpecModel]:
        """
        Discover all SunSpec models from the configured starting point.
        """

        signature_registers = await self.transport.read_holding_registers(
            address=self.start_register,
            count=2,
        )

        if len(signature_registers) != 2:
            raise InverterProtocolError(
                "SunSpec signature could not be read."
            )

        signature_registers = (
            self.transport.registers_to_uint16(
                signature_registers
            )
        )

        if signature_registers[0] != SUNSPEC_SIGNATURE:
            raise InverterProtocolError(
                "SunSpec signature was not found at the configured "
                f"register {self.start_register}."
            )

        models: List[SunSpecModel] = []

        current_register = self.start_register + 2
        registers_scanned = 2

        while registers_scanned < self.max_registers:
            header = await self.transport.read_holding_registers(
                address=current_register,
                count=2,
            )

            if len(header) != 2:
                raise InverterProtocolError(
                    "Incomplete SunSpec model header."
                )

            header = self.transport.registers_to_uint16(header)

            model_id = header[0]
            model_length = header[1]

            # SunSpec end marker.
            if model_id == 0xFFFF:
                break

            if model_id == 0:
                raise InverterProtocolError(
                    "Invalid SunSpec model ID 0."
                )

            models.append(
                SunSpecModel(
                    model_id=model_id,
                    start_register=current_register,
                    length=model_length,
                )
            )

            current_register += model_length + 2
            registers_scanned = current_register - self.start_register

        return models

    async def find_model(
        self,
        model_id: int,
    ) -> Optional[SunSpecModel]:
        """
        Find a specific SunSpec model.
        """

        if model_id <= 0:
            raise ValueError(
                "SunSpec model ID must be greater than zero."
            )

        models = await self.discover()

        for model in models:
            if model.model_id == model_id:
                return model

        return None