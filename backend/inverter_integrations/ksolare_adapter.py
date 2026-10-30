"""
KSolare 5G Pro Modbus adapter for SolarIQ+.

This adapter implements the KSolare 5G Pro Modbus RTU register map.

Communication specification:

    Protocol: Modbus RTU
    Physical layer: RS485 2-wire
    Baud rate: 9600
    Data bits: 8
    Parity: None
    Stop bits: 1
    Device address: 1-16

The adapter converts KSolare register data into the common SolarIQ+
inverter models.

Important:
    This adapter does not open the serial port itself.
    ModbusRtuTransport is responsible for communication.
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


class KSolareAdapter(InverterAdapter):
    """
    Adapter for KSolare 5G Pro inverters.
    """

    adapter_id = "ksolare-5g-pro"
    adapter_name = "KSolare 5G Pro"

    capabilities = InverterCapabilities(
        realtime=True,
        historical_energy=False,
        alarms=True,
        device_info=True,
        inverter_details=True,
        system_details=False,
        control=False,
        configuration=False,
        local_connection=True,
        cloud_connection=False,
        oauth=False,
    )

    # ------------------------------------------------------------------
    # KSolare device information registers
    # ------------------------------------------------------------------

    REG_FIRMWARE_PN = 30000
    REG_MANUFACTURER = 30010
    REG_MODEL = 30018
    REG_SERIAL = 30026
    REG_DEVICE_TYPE = 30034
    REG_GRID_TYPE = 30035
    REG_RATED_POWER = 30036
    REG_HARDWARE_VERSION = 30037
    REG_SOFTWARE_VERSION = 30039
    REG_PROTOCOL_VERSION = 30041
    REG_PARAMETER_VERSION = 30043
    REG_SAFETY_TYPE = 30045
    REG_MAX_APPARENT_POWER = 30047
    REG_MPPT_COUNT = 30048

    # ------------------------------------------------------------------
    # KSolare monitoring registers
    # ------------------------------------------------------------------

    REG_OUTPUT_POWER = 30100
    REG_OUTPUT_APPARENT_POWER = 30102
    REG_OUTPUT_REACTIVE_POWER = 30104
    REG_OUTPUT_PF = 30106
    REG_METER_POWER = 30108

    REG_ENERGY_TODAY = 30110
    REG_ENERGY_TOTAL = 30111
    REG_TOTAL_HOURS = 30113

    REG_INVERTER_STATE = 30115
    REG_WAITING_TIME = 30116
    REG_FAULT_CODE = 30117
    REG_WARNING_CODE = 30118

    REG_PV1_VOLTAGE = 30119
    REG_PV1_CURRENT = 30120
    REG_PV2_VOLTAGE = 30121
    REG_PV2_CURRENT = 30122
    REG_PV3_VOLTAGE = 30123
    REG_PV3_CURRENT = 30124
    REG_PV4_VOLTAGE = 30125
    REG_PV4_CURRENT = 30126

    REG_GRID_R_VOLTAGE = 30131
    REG_GRID_R_CURRENT = 30132
    REG_GRID_S_VOLTAGE = 30133
    REG_GRID_S_CURRENT = 30134
    REG_GRID_T_VOLTAGE = 30135
    REG_GRID_T_CURRENT = 30136

    REG_GRID_RS_VOLTAGE = 30137
    REG_GRID_ST_VOLTAGE = 30138
    REG_GRID_TR_VOLTAGE = 30139
    REG_GRID_FREQUENCY = 30140

    # Alternative float energy registers documented by KSolare.
    REG_FLOAT_TOTAL_ENERGY = 30154
    REG_IMPORT_ENERGY = 30156
    REG_EXPORT_ENERGY = 30158

    # ------------------------------------------------------------------
    # Status / fault mappings
    # ------------------------------------------------------------------

    STATE_WAIT = 0
    STATE_NORMAL = 1
    STATE_FAULT = 2

    FAULT_CODES = {
        1: "MCU fault",
        2: "Current sensor fault",
        3: "GFCI device fault",
        4: "Relay fault",
        5: "PV voltage high fault",
        6: "ISO fault",
        7: "GFCI fault",
        8: "Temperature over fault",
        9: "No utility fault",
        10: "Grid voltage over fault",
        11: "Grid frequency over fault",
        12: "DCI over fault",
        13: "EEPROM fault",
        14: "MCU communication fault",
        15: "BUS voltage high fault",
        16: "BUS voltage low fault",
        17: "DRM S9 fault",
        18: "DRM S0 fault",
        19: "PE connection missing",
        20: "BUS voltage consistency warning",
    }

    WARNING_CODES = {
        1: "PV1 over current",
        2: "PV2 over current",
        3: "PV3 over current",
        4: "PV4 over current",
        5: "PV1 under voltage",
        6: "PV2 under voltage",
        7: "PV3 under voltage",
        8: "PV4 under voltage",
        9: "BUS over voltage",
        10: "BUS under voltage",
        11: "INV over current",
        12: "ISO warning",
        13: "Grid peak over voltage",
        14: "Firmware update",
        15: "PE connection missing",
        16: "Grid voltage consistency warning",
        17: "Fan abnormal",
    }

    def __init__(
        self,
        transport: ModbusTransport,
    ) -> None:
        self.transport = transport

    # ==================================================================
    # CONNECTION
    # ==================================================================

    async def connect(self) -> None:
        """
        Connect to the KSolare inverter through the configured
        Modbus transport.
        """

        await self.transport.connect()

    async def disconnect(self) -> None:
        """
        Disconnect from the inverter.
        """

        await self.transport.disconnect()

    async def test_connection(self) -> bool:
        """
        Test whether the KSolare inverter responds to Modbus.
        """

        try:
            if not self.transport.connected:
                await self.connect()

            await self.transport.read_holding_registers(
                address=self.REG_INVERTER_STATE,
                count=2,
            )

            return True

        except Exception:
            return False

    # ==================================================================
    # DEVICE INFORMATION
    # ==================================================================

    async def get_device_info(self) -> InverterDevice:
        """
        Read KSolare device information.
        """

        manufacturer_registers = (
            await self.transport.read_holding_registers(
                address=self.REG_MANUFACTURER,
                count=8,
            )
        )

        model_registers = (
            await self.transport.read_holding_registers(
                address=self.REG_MODEL,
                count=8,
            )
        )

        serial_registers = (
            await self.transport.read_holding_registers(
                address=self.REG_SERIAL,
                count=8,
            )
        )

        manufacturer = self._decode_ascii(
            manufacturer_registers
        )

        model = self._decode_ascii(
            model_registers
        )

        serial_number = self._decode_ascii(
            serial_registers
        )

        rated_power_register = (
            await self.transport.read_holding_registers(
                address=self.REG_RATED_POWER,
                count=1,
            )
        )

        rated_power_kw = None

        if rated_power_register:
            rated_power_kw = (
                float(rated_power_register[0]) / 1000.0
            )

        return InverterDevice(
            manufacturer=manufacturer or "Ksolare",
            model=model or "KSolare 5G Pro",
            serial_number=serial_number or None,
            rated_power_kw=rated_power_kw,
            device_id=str(
                self.transport.device_address
            ),
            connection_type="rs485",
            protocol="ksolare-modbus-rtu",
        )

    # ==================================================================
    # REALTIME DATA
    # ==================================================================

    async def get_realtime(self) -> InverterRealtimeData:
        """
        Read the KSolare real-time monitoring block.
        """

        registers = (
            await self.transport.read_holding_registers(
                address=self.REG_OUTPUT_POWER,
                count=41,
            )
        )

        if len(registers) < 41:
            raise InverterProtocolError(
                "KSolare monitoring register block is incomplete."
            )

        now = datetime.now(timezone.utc)

        output_power_w = self._s32(
            registers,
            self.REG_OUTPUT_POWER,
        )

        output_s_va = self._s32(
            registers,
            self.REG_OUTPUT_APPARENT_POWER,
        )

        output_q_var = self._s32(
            registers,
            self.REG_OUTPUT_REACTIVE_POWER,
        )

        output_pf = self._u16_scaled(
            registers,
            self.REG_OUTPUT_PF,
            0.01,
        )

        energy_today = self._u16_scaled(
            registers,
            self.REG_ENERGY_TODAY,
            0.1,
        )

        energy_total = self._u32(
            registers,
            self.REG_ENERGY_TOTAL,
        )

        total_hours = self._u32(
            registers,
            self.REG_TOTAL_HOURS,
        )

        inverter_state = self._u16(
            registers,
            self.REG_INVERTER_STATE,
        )

        waiting_time = self._u16(
            registers,
            self.REG_WAITING_TIME,
        )

        fault_code = self._u16(
            registers,
            self.REG_FAULT_CODE,
        )

        warning_code = self._u16(
            registers,
            self.REG_WARNING_CODE,
        )

        pv1_voltage = self._u16_scaled(
            registers,
            self.REG_PV1_VOLTAGE,
            0.1,
        )

        pv1_current = self._u16_scaled(
            registers,
            self.REG_PV1_CURRENT,
            0.1,
        )

        pv2_voltage = self._u16_scaled(
            registers,
            self.REG_PV2_VOLTAGE,
            0.1,
        )

        pv2_current = self._u16_scaled(
            registers,
            self.REG_PV2_CURRENT,
            0.1,
        )

        pv3_voltage = self._u16_scaled(
            registers,
            self.REG_PV3_VOLTAGE,
            0.1,
        )

        pv3_current = self._u16_scaled(
            registers,
            self.REG_PV3_CURRENT,
            0.1,
        )

        pv4_voltage = self._u16_scaled(
            registers,
            self.REG_PV4_VOLTAGE,
            0.1,
        )

        pv4_current = self._u16_scaled(
            registers,
            self.REG_PV4_CURRENT,
            0.1,
        )

        grid_r_voltage = self._u16_scaled(
            registers,
            self.REG_GRID_R_VOLTAGE,
            0.1,
        )

        grid_r_current = self._u16_scaled(
            registers,
            self.REG_GRID_R_CURRENT,
            0.1,
        )

        grid_s_voltage = self._u16_scaled(
            registers,
            self.REG_GRID_S_VOLTAGE,
            0.1,
        )

        grid_s_current = self._u16_scaled(
            registers,
            self.REG_GRID_S_CURRENT,
            0.1,
        )

        grid_t_voltage = self._u16_scaled(
            registers,
            self.REG_GRID_T_VOLTAGE,
            0.1,
        )

        grid_t_current = self._u16_scaled(
            registers,
            self.REG_GRID_T_CURRENT,
            0.1,
        )

        grid_rs_voltage = self._u16_scaled(
            registers,
            self.REG_GRID_RS_VOLTAGE,
            0.1,
        )

        grid_st_voltage = self._u16_scaled(
            registers,
            self.REG_GRID_ST_VOLTAGE,
            0.1,
        )

        grid_tr_voltage = self._u16_scaled(
            registers,
            self.REG_GRID_TR_VOLTAGE,
            0.1,
        )

        grid_frequency = self._u16_scaled(
            registers,
            self.REG_GRID_FREQUENCY,
            0.01,
        )

        status = self._build_status(
            state=inverter_state,
            fault_code=fault_code,
            warning_code=warning_code,
            timestamp=now,
        )

        energy = InverterEnergy(
            today_kwh=energy_today,
            total_kwh=float(energy_total),
            timestamp=now,
        )

        return InverterRealtimeData(
            timestamp=now,
            current_power_kw=(
                float(output_power_w) / 1000.0
                if output_power_w is not None
                else None
            ),
            pv_voltage_v=pv1_voltage,
            pv_current_a=pv1_current,
            ac_power_kw=(
                float(output_power_w) / 1000.0
                if output_power_w is not None
                else None
            ),
            grid_frequency_hz=grid_frequency,
            status=status,
            energy=energy,
            raw={
                "output_power_w": output_power_w,
                "output_apparent_power_va": output_s_va,
                "output_reactive_power_var": output_q_var,
                "output_power_factor": output_pf,
                "pv1_voltage_v": pv1_voltage,
                "pv1_current_a": pv1_current,
                "pv2_voltage_v": pv2_voltage,
                "pv2_current_a": pv2_current,
                "pv3_voltage_v": pv3_voltage,
                "pv3_current_a": pv3_current,
                "pv4_voltage_v": pv4_voltage,
                "pv4_current_a": pv4_current,
                "grid_r_voltage_v": grid_r_voltage,
                "grid_r_current_a": grid_r_current,
                "grid_s_voltage_v": grid_s_voltage,
                "grid_s_current_a": grid_s_current,
                "grid_t_voltage_v": grid_t_voltage,
                "grid_t_current_a": grid_t_current,
                "grid_rs_voltage_v": grid_rs_voltage,
                "grid_st_voltage_v": grid_st_voltage,
                "grid_tr_voltage_v": grid_tr_voltage,
                "grid_frequency_hz": grid_frequency,
                "energy_today_kwh": energy_today,
                "energy_total_kwh": energy_total,
                "total_operating_hours": total_hours,
                "inverter_state": inverter_state,
                "waiting_time_s": waiting_time,
                "fault_code": fault_code,
                "fault_message": self.FAULT_CODES.get(
                    fault_code
                ),
                "warning_code": warning_code,
                "warning_message": self.WARNING_CODES.get(
                    warning_code
                ),
                "raw_registers": registers,
            },
        )

    # ==================================================================
    # HISTORICAL ENERGY
    # ==================================================================

    async def get_historical_energy(
        self,
        start: Optional[datetime] = None,
        end: Optional[datetime] = None,
    ) -> List[HistoricalEnergyPoint]:
        """
        Return the currently available cumulative energy counter.

        The KSolare register map provides today's energy and total
        energy, but does not by itself provide a universal timestamped
        historical time series.

        Historical time-series data should later be built from
        SolarIQ+ stored readings or the monitoring platform.
        """

        realtime = await self.get_realtime()

        if realtime.energy is None:
            return []

        timestamp = (
            realtime.energy.timestamp
            or datetime.now(timezone.utc)
        )

        if realtime.energy.today_kwh is None:
            return []

        return [
            HistoricalEnergyPoint(
                timestamp=timestamp,
                energy_kwh=realtime.energy.today_kwh,
                power_kw=realtime.current_power_kw,
                raw={
                    "source": "ksolare_modbus",
                    "type": "daily_counter",
                },
            )
        ]

    # ==================================================================
    # ALARMS
    # ==================================================================

    async def get_alarms(self) -> List[InverterAlarm]:
        """
        Read current KSolare fault and warning codes.
        """

        registers = (
            await self.transport.read_holding_registers(
                address=self.REG_FAULT_CODE,
                count=2,
            )
        )

        if len(registers) < 2:
            raise InverterProtocolError(
                "KSolare fault/warning registers are incomplete."
            )

        fault_code = registers[0]
        warning_code = registers[1]

        alarms: List[InverterAlarm] = []

        if fault_code:
            alarms.append(
                InverterAlarm(
                    code=f"FAULT_{fault_code}",
                    severity="critical",
                    message=self.FAULT_CODES.get(
                        fault_code,
                        f"Unknown fault code {fault_code}",
                    ),
                    active=True,
                    timestamp=datetime.now(
                        timezone.utc
                    ),
                )
            )

        if warning_code:
            alarms.append(
                InverterAlarm(
                    code=f"WARNING_{warning_code}",
                    severity="warning",
                    message=self.WARNING_CODES.get(
                        warning_code,
                        f"Unknown warning code {warning_code}",
                    ),
                    active=True,
                    timestamp=datetime.now(
                        timezone.utc
                    ),
                )
            )

        return alarms

    # ==================================================================
    # STATUS
    # ==================================================================

    def _build_status(
        self,
        state: int,
        fault_code: int,
        warning_code: int,
        timestamp: datetime,
    ) -> InverterStatus:
        """
        Convert KSolare state/fault/warning registers into the
        normalized SolarIQ+ status model.
        """

        if state == self.STATE_FAULT or fault_code:
            return InverterStatus(
                state="fault",
                online=True,
                fault=True,
                warning=bool(warning_code),
                message=self.FAULT_CODES.get(
                    fault_code,
                    "KSolare inverter fault",
                ),
                timestamp=timestamp,
            )

        if warning_code:
            return InverterStatus(
                state="warning",
                online=True,
                fault=False,
                warning=True,
                message=self.WARNING_CODES.get(
                    warning_code,
                    "KSolare inverter warning",
                ),
                timestamp=timestamp,
            )

        if state == self.STATE_NORMAL:
            return InverterStatus(
                state="running",
                online=True,
                fault=False,
                warning=False,
                timestamp=timestamp,
            )

        return InverterStatus(
            state="waiting",
            online=True,
            fault=False,
            warning=False,
            timestamp=timestamp,
        )

    # ==================================================================
    # REGISTER HELPERS
    # ==================================================================

    @staticmethod
    def _relative_index(
        registers: List[int],
        register_address: int,
        block_start: int,
    ) -> int:
        """
        Convert an absolute KSolare register address into an index
        inside a previously-read register block.
        """

        index = register_address - block_start

        if index < 0 or index >= len(registers):
            raise InverterProtocolError(
                f"Register {register_address} is outside "
                f"the requested block."
            )

        return index

    @classmethod
    def _u16(
        cls,
        registers: List[int],
        register_address: int,
        block_start: int = REG_OUTPUT_POWER,
    ) -> int:
        index = cls._relative_index(
            registers,
            register_address,
            block_start,
        )

        return int(registers[index])

    @classmethod
    def _u16_scaled(
        cls,
        registers: List[int],
        register_address: int,
        scale: float,
        block_start: int = REG_OUTPUT_POWER,
    ) -> float:
        return (
            cls._u16(
                registers,
                register_address,
                block_start,
            )
            * scale
        )

    @classmethod
    def _s32(
        cls,
        registers: List[int],
        register_address: int,
        block_start: int = REG_OUTPUT_POWER,
    ) -> int:
        first = cls._relative_index(
            registers,
            register_address,
            block_start,
        )

        second = first + 1

        if second >= len(registers):
            raise InverterProtocolError(
                f"32-bit register {register_address} "
                "is incomplete."
            )

        high = registers[first]
        low = registers[second]

        value = (high << 16) | low

        if value >= 0x80000000:
            value -= 0x100000000

        return value

    @classmethod
    def _u32(
        cls,
        registers: List[int],
        register_address: int,
        block_start: int = REG_OUTPUT_POWER,
    ) -> int:
        first = cls._relative_index(
            registers,
            register_address,
            block_start,
        )

        second = first + 1

        if second >= len(registers):
            raise InverterProtocolError(
                f"32-bit register {register_address} "
                "is incomplete."
            )

        high = registers[first]
        low = registers[second]

        return (high << 16) | low

    @staticmethod
    def _decode_ascii(
        registers: List[int],
    ) -> str:
        """
        Decode KSolare ASCII data.

        Each Modbus register contains two ASCII bytes.
        """

        raw = bytearray()

        for register in registers:
            raw.append((register >> 8) & 0xFF)
            raw.append(register & 0xFF)

        return raw.rstrip(
            b"\x00 "
        ).decode(
            "ascii",
            errors="ignore",
        ).strip()