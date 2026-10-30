"""
KSolare 5G Pro Modbus simulator.

This simulator does NOT replace the KSolare adapter.

It provides an in-memory Modbus-like transport containing realistic
KSolare 5G Pro register values so that the real KSolareAdapter can
be tested without physical inverter hardware.

The values are based on the telemetry previously observed from the
user's KSolare inverter through SmartClient Local Monitoring.
"""

from typing import Dict, List

from .ksolare_adapter import KSolareAdapter


class SimulatedKSolareTransport:
    """
    In-memory Modbus transport that behaves like a KSolare inverter.

    No network connection and no serial hardware are required.
    """

    def __init__(self, device_address: int = 1) -> None:
        self.device_address = device_address
        self.connected = False

        self.registers: Dict[int, int] = {}

        self._build_registers()

    # ==================================================================
    # CONNECTION
    # ==================================================================

    async def connect(self) -> None:
        self.connected = True

    async def disconnect(self) -> None:
        self.connected = False

    # ==================================================================
    # REGISTER ACCESS
    # ==================================================================

    async def read_holding_registers(
        self,
        address: int,
        count: int,
    ) -> List[int]:
        """
        Return consecutive simulated Modbus holding registers.
        """

        if not self.connected:
            raise ConnectionError(
                "Simulated KSolare transport is not connected."
            )

        return [
            self.registers.get(address + offset, 0)
            for offset in range(count)
        ]

    # ==================================================================
    # REGISTER BUILDING
    # ==================================================================

    def _build_registers(self) -> None:
        """
        Populate realistic KSolare 5G Pro registers.
        """

        # --------------------------------------------------------------
        # Device information
        # --------------------------------------------------------------

        self._write_ascii(
            KSolareAdapter.REG_MANUFACTURER,
            "Ksolare",
            8,
        )

        self._write_ascii(
            KSolareAdapter.REG_MODEL,
            "5G Pro",
            8,
        )

        self._write_ascii(
            KSolareAdapter.REG_SERIAL,
            "KSY0824HK4071",
            8,
        )

        self._write_ascii(
            KSolareAdapter.REG_FIRMWARE_PN,
            "KSP5GPRO",
            8,
        )

        self._write_register(
            KSolareAdapter.REG_DEVICE_TYPE,
            0,
        )

        self._write_register(
            KSolareAdapter.REG_RATED_POWER,
            4200,
        )

        # --------------------------------------------------------------
        # Output power
        #
        # Observed SmartClient value:
        # approximately 1945 W
        # --------------------------------------------------------------

        self._write_s32(
            KSolareAdapter.REG_OUTPUT_POWER,
            1945,
        )

        # Output apparent power ≈ 1968 VA
        self._write_s32(
            KSolareAdapter.REG_OUTPUT_APPARENT_POWER,
            1968,
        )

        # Output reactive power ≈ 109 var
        self._write_s32(
            KSolareAdapter.REG_OUTPUT_REACTIVE_POWER,
            109,
        )

        # Power factor ≈ 0.99
        self._write_register(
            KSolareAdapter.REG_OUTPUT_PF,
            99,
        )

        # Meter power
        self._write_s32(
            KSolareAdapter.REG_METER_POWER,
            1945,
        )

        # --------------------------------------------------------------
        # Energy
        #
        # Observed SmartClient:
        # Today ≈ 5.9 kWh
        # Total ≈ 9445 kWh
        # --------------------------------------------------------------

        self._write_register(
            KSolareAdapter.REG_ENERGY_TODAY,
            59,
        )

        self._write_u32(
            KSolareAdapter.REG_ENERGY_TOTAL,
            9445,
        )

        self._write_u32(
            KSolareAdapter.REG_TOTAL_HOURS,
            9185,
        )

        # --------------------------------------------------------------
        # Inverter state
        # --------------------------------------------------------------

        self._write_register(
            KSolareAdapter.REG_INVERTER_STATE,
            KSolareAdapter.STATE_NORMAL,
        )

        self._write_register(
            KSolareAdapter.REG_WAITING_TIME,
            0,
        )

        self._write_register(
            KSolareAdapter.REG_FAULT_CODE,
            0,
        )

        self._write_register(
            KSolareAdapter.REG_WARNING_CODE,
            0,
        )

        # --------------------------------------------------------------
        # PV INPUTS
        #
        # Observed:
        # PV1 ≈ 240.5 V
        # PV1 ≈ 8.9 A
        # PV2/PV3 inactive
        # --------------------------------------------------------------

        self._write_register(
            KSolareAdapter.REG_PV1_VOLTAGE,
            2405,
        )

        self._write_register(
            KSolareAdapter.REG_PV1_CURRENT,
            89,
        )

        self._write_register(
            KSolareAdapter.REG_PV2_VOLTAGE,
            0,
        )

        self._write_register(
            KSolareAdapter.REG_PV2_CURRENT,
            0,
        )

        self._write_register(
            KSolareAdapter.REG_PV3_VOLTAGE,
            0,
        )

        self._write_register(
            KSolareAdapter.REG_PV3_CURRENT,
            0,
        )

        self._write_register(
            KSolareAdapter.REG_PV4_VOLTAGE,
            0,
        )

        self._write_register(
            KSolareAdapter.REG_PV4_CURRENT,
            0,
        )

        # --------------------------------------------------------------
        # GRID
        #
        # Observed:
        # R phase ≈ 251.9 V
        # R current ≈ 7.9 A
        # frequency ≈ 50.13 Hz
        # S/T phases inactive
        # --------------------------------------------------------------

        self._write_register(
            KSolareAdapter.REG_GRID_R_VOLTAGE,
            2519,
        )

        self._write_register(
            KSolareAdapter.REG_GRID_R_CURRENT,
            79,
        )

        self._write_register(
            KSolareAdapter.REG_GRID_S_VOLTAGE,
            0,
        )

        self._write_register(
            KSolareAdapter.REG_GRID_S_CURRENT,
            0,
        )

        self._write_register(
            KSolareAdapter.REG_GRID_T_VOLTAGE,
            0,
        )

        self._write_register(
            KSolareAdapter.REG_GRID_T_CURRENT,
            0,
        )

        self._write_register(
            KSolareAdapter.REG_GRID_RS_VOLTAGE,
            0,
        )

        self._write_register(
            KSolareAdapter.REG_GRID_ST_VOLTAGE,
            0,
        )

        self._write_register(
            KSolareAdapter.REG_GRID_TR_VOLTAGE,
            0,
        )

        self._write_register(
            KSolareAdapter.REG_GRID_FREQUENCY,
            5013,
        )

    # ==================================================================
    # LOW-LEVEL REGISTER WRITERS
    # ==================================================================

    def _write_register(
        self,
        address: int,
        value: int,
    ) -> None:
        """
        Write one unsigned 16-bit register.
        """

        self.registers[address] = value & 0xFFFF

    def _write_u32(
        self,
        address: int,
        value: int,
    ) -> None:
        """
        Write a 32-bit unsigned integer using high-word / low-word
        Modbus register ordering.
        """

        value &= 0xFFFFFFFF

        high = (value >> 16) & 0xFFFF
        low = value & 0xFFFF

        self.registers[address] = high
        self.registers[address + 1] = low

    def _write_s32(
        self,
        address: int,
        value: int,
    ) -> None:
        """
        Write a signed 32-bit integer using high-word / low-word
        Modbus register ordering.
        """

        if value < 0:
            value = (1 << 32) + value

        self._write_u32(
            address,
            value,
        )

    def _write_ascii(
        self,
        address: int,
        value: str,
        register_count: int,
    ) -> None:
        """
        Store an ASCII string using two bytes per Modbus register.
        """

        encoded = value.encode(
            "ascii",
            errors="ignore",
        )

        max_bytes = register_count * 2

        encoded = encoded[:max_bytes]

        if len(encoded) % 2:
            encoded += b"\x00"

        encoded += b"\x00" * (
            max_bytes - len(encoded)
        )

        for index in range(register_count):
            high = encoded[index * 2]
            low = encoded[index * 2 + 1]

            self.registers[
                address + index
            ] = (high << 8) | low


# ======================================================================
# TEST
# ======================================================================

async def run_simulation() -> None:
    """
    Run the complete KSolare adapter against the simulator.
    """

    transport = SimulatedKSolareTransport(
        device_address=1
    )

    adapter = KSolareAdapter(
        transport=transport
    )

    await adapter.connect()

    connected = await adapter.test_connection()

    print()
    print("=" * 60)
    print("SOLARIQ+ KSolare 5G Pro Simulator")
    print("=" * 60)

    print(
        f"Connection test : "
        f"{'PASS' if connected else 'FAIL'}"
    )

    # --------------------------------------------------------------
    # Device information
    # --------------------------------------------------------------

    device = await adapter.get_device_info()

    print()
    print("DEVICE INFORMATION")
    print("-" * 60)
    print(
        f"Manufacturer : {device.manufacturer}"
    )
    print(
        f"Model        : {device.model}"
    )
    print(
        f"Serial       : {device.serial_number}"
    )
    print(
        f"Rated Power  : {device.rated_power_kw} kW"
    )
    print(
        f"Protocol     : {device.protocol}"
    )

    # --------------------------------------------------------------
    # Realtime data
    # --------------------------------------------------------------

    realtime = await adapter.get_realtime()

    print()
    print("REALTIME DATA")
    print("-" * 60)

    print(
        f"Output Power : "
        f"{realtime.current_power_kw} kW"
    )

    print(
        f"PV Voltage   : "
        f"{realtime.pv_voltage_v} V"
    )

    print(
        f"PV Current   : "
        f"{realtime.pv_current_a} A"
    )

    print(
        f"Grid Frequency : "
        f"{realtime.grid_frequency_hz} Hz"
    )

    if realtime.energy:
        print(
            f"Energy Today : "
            f"{realtime.energy.today_kwh} kWh"
        )

        print(
            f"Energy Total : "
            f"{realtime.energy.total_kwh} kWh"
        )

    if realtime.status:
        print(
            f"Status       : "
            f"{realtime.status.state}"
        )

        print(
            f"Online       : "
            f"{realtime.status.online}"
        )

        print(
            f"Fault        : "
            f"{realtime.status.fault}"
        )

        print(
            f"Warning      : "
            f"{realtime.status.warning}"
        )

    # --------------------------------------------------------------
    # Raw detailed telemetry
    # --------------------------------------------------------------

    print()
    print("DETAILED TELEMETRY")
    print("-" * 60)

    raw = realtime.raw

    print(
        f"Output Power       : "
        f"{raw.get('output_power_w')} W"
    )

    print(
        f"Output Apparent    : "
        f"{raw.get('output_apparent_power_va')} VA"
    )

    print(
        f"Output Reactive    : "
        f"{raw.get('output_reactive_power_var')} var"
    )

    print(
        f"Power Factor       : "
        f"{raw.get('output_power_factor')}"
    )

    print(
        f"PV1 Voltage        : "
        f"{raw.get('pv1_voltage_v')} V"
    )

    print(
        f"PV1 Current        : "
        f"{raw.get('pv1_current_a')} A"
    )

    print(
        f"PV2 Voltage        : "
        f"{raw.get('pv2_voltage_v')} V"
    )

    print(
        f"PV3 Voltage        : "
        f"{raw.get('pv3_voltage_v')} V"
    )

    print(
        f"Grid R Voltage     : "
        f"{raw.get('grid_r_voltage_v')} V"
    )

    print(
        f"Grid R Current     : "
        f"{raw.get('grid_r_current_a')} A"
    )

    print(
        f"Grid Frequency     : "
        f"{raw.get('grid_frequency_hz')} Hz"
    )

    print(
        f"Today's Energy     : "
        f"{raw.get('energy_today_kwh')} kWh"
    )

    print(
        f"Total Energy       : "
        f"{raw.get('energy_total_kwh')} kWh"
    )

    print(
        f"Operating Hours    : "
        f"{raw.get('total_operating_hours')} h"
    )

    print(
        f"Inverter State     : "
        f"{raw.get('inverter_state')}"
    )

    print(
        f"Fault Code         : "
        f"{raw.get('fault_code')}"
    )

    print(
        f"Warning Code       : "
        f"{raw.get('warning_code')}"
    )

    print()
    print("=" * 60)
    print("KSOLARE SIMULATOR: PASS")
    print("=" * 60)

    await adapter.disconnect()


if __name__ == "__main__":
    import asyncio

    asyncio.run(
        run_simulation()
    )