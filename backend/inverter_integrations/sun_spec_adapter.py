"""
SolarIQ+ Universal SunSpec Inverter Gateway

Supports:
    - SunSpec Modbus TCP
    - SunSpec Modbus RTU / RS485

Uses pySunSpec2 for automatic SunSpec model discovery.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import sunspec2.modbus.client as sunspec_client


# ============================================================================
# CONNECTION CONFIGURATION
# ============================================================================

@dataclass
class SunSpecConnectionConfig:

    mode: str = "tcp"

    # TCP
    host: Optional[str] = None
    tcp_port: int = 502

    # RTU
    serial_port: Optional[str] = None
    baudrate: int = 9600
    parity: str = "N"

    # Modbus unit/slave ID
    device_address: int = 1

    timeout: float = 3.0

    def validate(self) -> None:

        mode = self.mode.lower().strip()

        if mode not in {"tcp", "rtu"}:
            raise ValueError(
                "mode must be 'tcp' or 'rtu'"
            )

        if not 1 <= int(self.device_address) <= 247:
            raise ValueError(
                "device_address must be between 1 and 247"
            )

        if mode == "tcp":

            if not self.host:
                raise ValueError(
                    "TCP connection requires host"
                )

            if not 1 <= int(self.tcp_port) <= 65535:
                raise ValueError(
                    "TCP port must be between 1 and 65535"
                )

        if mode == "rtu":

            if not self.serial_port:
                raise ValueError(
                    "RTU connection requires serial_port"
                )

            if self.parity.upper() not in {
                "N",
                "E",
                "O",
            }:
                raise ValueError(
                    "parity must be N, E, or O"
                )

    def to_dict(self) -> Dict[str, Any]:

        return asdict(self)


# ============================================================================
# BRAND NORMALIZATION
# ============================================================================

SUNSPEC_BRAND_ALIASES = {
    "sma": "SMA",
    "sma solar": "SMA",

    "fronius": "Fronius",

    "sungrow": "Sungrow",
    "sungrow power": "Sungrow",

    "solaredge": "SolarEdge",
    "solar edge": "SolarEdge",

    "goodwe": "GoodWe",
    "good we": "GoodWe",

    "kaco": "KACO",

    "kostal": "Kostal",

    "delta": "Delta",
    "delta electronics": "Delta",

    "abb": "ABB",
    "fimer": "FIMER",

    "apsystems": "APsystems",
    "ap systems": "APsystems",

    "solis": "Solis",
    "ginlong": "Ginlong",

    "chint": "Chint Power",

    "huawei": "Huawei",
}


def normalize_brand(
    manufacturer: Optional[str],
) -> Optional[str]:

    if not manufacturer:
        return None

    cleaned = (
        str(manufacturer)
        .strip()
        .lower()
        .replace("_", " ")
        .replace("-", " ")
    )

    cleaned = " ".join(
        cleaned.split()
    )

    if cleaned in SUNSPEC_BRAND_ALIASES:
        return SUNSPEC_BRAND_ALIASES[
            cleaned
        ]

    for alias, brand in SUNSPEC_BRAND_ALIASES.items():

        if alias in cleaned:
            return brand

    return str(manufacturer).strip()


# ============================================================================
# SAFE PY SUNSPEC HELPERS
# ============================================================================

def safe_value(
    point: Any,
) -> Any:

    if point is None:
        return None

    try:

        value = getattr(
            point,
            "value",
            None,
        )

        if value is not None:
            return value

    except Exception:
        pass

    try:

        value = getattr(
            point,
            "cvalue",
            None,
        )

        if value is not None:
            return value

    except Exception:
        pass

    return None


def point(
    model: Any,
    name: str,
) -> Any:

    if model is None:
        return None

    try:

        return getattr(
            model,
            name,
            None,
        )

    except Exception:
        return None


def point_value(
    model: Any,
    name: str,
) -> Any:

    return safe_value(
        point(
            model,
            name,
        )
    )


def model_id(
    model: Any,
) -> Optional[int]:

    try:

        value = getattr(
            model,
            "model_id",
            None,
        )

        if value is not None:
            return int(value)

    except Exception:
        pass

    try:

        value = getattr(
            model,
            "id",
            None,
        )

        if value is not None:
            return int(value)

    except Exception:
        pass

    return None


def model_length(
    model: Any,
) -> Optional[int]:

    try:

        value = getattr(
            model,
            "model_len",
            None,
        )

        if value is not None:
            return int(value)

    except Exception:
        pass

    return None


# ============================================================================
# UNIVERSAL GATEWAY
# ============================================================================

class UniversalSunSpecGateway:

    gateway_id = "universal-sunspec"

    gateway_name = (
        "SolarIQ+ Universal SunSpec Gateway"
    )

    protocol = "SunSpec Modbus"

    def __init__(
        self,
        config: SunSpecConnectionConfig,
    ) -> None:

        config.validate()

        self.config = config

        self.device = None

        self.connected = False

        self.discovered = False

        self.models = {}

        self.model_list = []

    # ========================================================================
    # CREATE CLIENT
    # ========================================================================

    def _create_device(self):

        mode = self.config.mode.lower()

        if mode == "tcp":

            return (
                sunspec_client
                .SunSpecModbusClientDeviceTCP(
                    slave_id=self.config.device_address,
                    ipaddr=self.config.host,
                    ipport=self.config.tcp_port,
                    timeout=self.config.timeout,
                )
            )

        return (
            sunspec_client
            .SunSpecModbusClientDeviceRTU(
                slave_id=self.config.device_address,
                name=self.config.serial_port,
                baudrate=self.config.baudrate,
                parity=self.config.parity,
                timeout=self.config.timeout,
            )
        )

    # ========================================================================
    # CONNECT
    # ========================================================================

    def connect(self):

        if self.connected:

            return {
                "status": "connected",
                "already_connected": True,
            }

        self.device = (
            self._create_device()
        )

        try:

            connect_method = getattr(
                self.device,
                "connect",
                None,
            )

            if callable(connect_method):
                connect_method()

            self.connected = True

            return {
                "status": "connected",
                "mode": self.config.mode,
                "device_address": (
                    self.config.device_address
                ),
            }

        except Exception:

            self.connected = False

            try:
                self.close()
            except Exception:
                pass

            raise

    # ========================================================================
    # SUNSPEC DISCOVERY
    # ========================================================================

    def discover(self):

        if not self.connected:
            self.connect()

        if self.device is None:

            raise RuntimeError(
                "SunSpec device is not initialized"
            )

        # Official pySunSpec2 discovery mechanism.
        self.device.scan()

        self.discovered = True

        self.models = getattr(
            self.device,
            "models",
            {},
        ) or {}

        self.model_list = list(
            getattr(
                self.device,
                "model_list",
                [],
            ) or []
        )

        # Fallback if model_list is not exposed.
        if not self.model_list:

            seen = set()

            for value in self.models.values():

                values = (
                    value
                    if isinstance(
                        value,
                        list,
                    )
                    else [value]
                )

                for item in values:

                    marker = id(item)

                    if marker not in seen:

                        seen.add(marker)

                        self.model_list.append(
                            item
                        )

        return {
            "status": "discovered",
            "model_count": len(
                self.model_list
            ),
            "models": (
                self.get_model_summary()
            ),
        }

    # ========================================================================
    # MODEL SUMMARY
    # ========================================================================

    def get_model_summary(self):

        result = []

        for model in self.model_list:

            result.append(
                {
                    "model_id": model_id(
                        model
                    ),
                    "model_length": model_length(
                        model
                    ),
                    "model_name": (
                        getattr(
                            model,
                            "name",
                            None,
                        )
                        or getattr(
                            model,
                            "model_name",
                            None,
                        )
                    ),
                }
            )

        return result

    # ========================================================================
    # GET MODEL INSTANCES
    # ========================================================================

    def get_models(
        self,
        requested_model_id: int,
    ) -> List[Any]:

        result = []

        for model in self.model_list:

            if (
                model_id(model)
                == requested_model_id
            ):

                result.append(model)

        return result

    # ========================================================================
    # COMMON MODEL
    # ========================================================================

    def read_common_model(self):

        if not self.discovered:
            self.discover()

        models = self.get_models(1)

        if not models:

            return {
                "available": False,
                "model_id": 1,
            }

        common = models[0]

        try:
            common.read()
        except Exception:
            pass

        manufacturer = point_value(
            common,
            "Mn",
        )

        model_name = point_value(
            common,
            "Md",
        )

        serial = point_value(
            common,
            "SN",
        )

        firmware = point_value(
            common,
            "Vr",
        )

        device_address = point_value(
            common,
            "DA",
        )

        return {
            "available": True,

            "model_id": 1,

            "manufacturer": manufacturer,

            "normalized_manufacturer": (
                normalize_brand(
                    manufacturer
                )
            ),

            "model": model_name,

            "serial_number": serial,

            "firmware": firmware,

            "device_address": device_address,
        }

    # ========================================================================
    # AC MODELS
    # ========================================================================

    def get_ac_models(self):

        if not self.discovered:
            self.discover()

        # Classic SunSpec inverter models
        # plus modern DER measurement model.
        supported = {
            101,
            102,
            103,
            111,
            112,
            113,
            701,
        }

        result = []

        for model in self.model_list:

            if model_id(model) in supported:

                result.append(model)

        return result

    # ========================================================================
    # READ AC MODELS
    # ========================================================================

    def read_ac_models(self):

        models = (
            self.get_ac_models()
        )

        result = []

        for model in models:

            try:
                model.read()
            except Exception:
                continue

            result.append(
                {
                    "model_id": model_id(
                        model
                    ),

                    "active_power_w": (
                        point_value(
                            model,
                            "W",
                        )
                    ),

                    "apparent_power_va": (
                        point_value(
                            model,
                            "VA",
                        )
                    ),

                    "reactive_power_var": (
                        point_value(
                            model,
                            "VAr",
                        )
                    ),

                    "power_factor": (
                        point_value(
                            model,
                            "PF",
                        )
                    ),

                    "frequency_hz": (
                        point_value(
                            model,
                            "Hz",
                        )
                    ),

                    "energy_wh": (
                        point_value(
                            model,
                            "WH",
                        )
                    ),

                    "status": (
                        point_value(
                            model,
                            "St",
                        )
                    ),

                    "alarm": (
                        point_value(
                            model,
                            "Alrm",
                        )
                    ),

                    "battery_soc": (
                        point_value(
                            model,
                            "SoC",
                        )
                    ),
                }
            )

        return result

    # ========================================================================
    # REALTIME
    # ========================================================================

    def read_realtime(self):

        if not self.discovered:
            self.discover()

        common = (
            self.read_common_model()
        )

        measurements = (
            self.read_ac_models()
        )

        normalized = {}

        if measurements:

            primary = measurements[0]

            power_w = primary.get(
                "active_power_w"
            )

            energy_wh = primary.get(
                "energy_wh"
            )

            power_kw = None

            if power_w is not None:

                try:
                    power_kw = (
                        float(power_w)
                        / 1000.0
                    )
                except (
                    TypeError,
                    ValueError,
                ):
                    pass

            energy_kwh = None

            if energy_wh is not None:

                try:
                    energy_kwh = (
                        float(energy_wh)
                        / 1000.0
                    )
                except (
                    TypeError,
                    ValueError,
                ):
                    pass

            normalized = {
                "power_kw": power_kw,

                "energy_kwh": energy_kwh,

                "apparent_power_va": (
                    primary.get(
                        "apparent_power_va"
                    )
                ),

                "reactive_power_var": (
                    primary.get(
                        "reactive_power_var"
                    )
                ),

                "power_factor": (
                    primary.get(
                        "power_factor"
                    )
                ),

                "frequency_hz": (
                    primary.get(
                        "frequency_hz"
                    )
                ),

                "inverter_status": (
                    primary.get(
                        "status"
                    )
                ),

                "alarm": (
                    primary.get(
                        "alarm"
                    )
                ),

                "battery_soc_percent": (
                    primary.get(
                        "battery_soc"
                    )
                ),
            }

        return {
            "status": "connected",

            "data_mode": "real",

            "gateway": self.gateway_id,

            "protocol": self.protocol,

            "transport": (
                "Modbus TCP"
                if self.config.mode.lower()
                == "tcp"
                else "Modbus RTU / RS485"
            ),

            "timestamp": (
                datetime.now(
                    timezone.utc
                ).isoformat()
            ),

            "device": common,

            "measurements": measurements,

            "normalized": normalized,

            "discovered_models": (
                self.get_model_summary()
            ),
        }

    # ========================================================================
    # DEVICE INFO
    # ========================================================================

    def get_device_info(self):

        if not self.discovered:
            self.discover()

        return {
            "gateway": self.gateway_id,

            "gateway_name": (
                self.gateway_name
            ),

            "protocol": self.protocol,

            "transport": (
                "Modbus TCP"
                if self.config.mode.lower()
                == "tcp"
                else "Modbus RTU / RS485"
            ),

            "connection": (
                self.config.to_dict()
            ),

            "common_model": (
                self.read_common_model()
            ),

            "models": (
                self.get_model_summary()
            ),

            "model_count": len(
                self.model_list
            ),
        }

    # ========================================================================
    # HEALTH
    # ========================================================================

    def health_check(self):

        try:

            if not self.connected:
                self.connect()

            if not self.discovered:
                self.discover()

            common = (
                self.read_common_model()
            )

            return {
                "status": "healthy",

                "connected": True,

                "discovered": True,

                "data_mode": "real",

                "protocol": self.protocol,

                "manufacturer": (
                    common.get(
                        "manufacturer"
                    )
                ),

                "normalized_manufacturer": (
                    common.get(
                        "normalized_manufacturer"
                    )
                ),

                "model": (
                    common.get(
                        "model"
                    )
                ),

                "serial_number": (
                    common.get(
                        "serial_number"
                    )
                ),

                "model_count": len(
                    self.model_list
                ),
            }

        except Exception as exc:

            return {
                "status": "error",

                "connected": (
                    self.connected
                ),

                "discovered": (
                    self.discovered
                ),

                "data_mode": "real",

                "protocol": self.protocol,

                "error": str(exc),
            }

    # ========================================================================
    # CLOSE
    # ========================================================================

    def close(self):

        if self.device is not None:

            try:

                close_method = getattr(
                    self.device,
                    "close",
                    None,
                )

                if callable(close_method):
                    close_method()

            except Exception:
                pass

        self.device = None

        self.models = {}

        self.model_list = []

        self.connected = False

        self.discovered = False


# ============================================================================
# FACTORY
# ============================================================================

def create_sunspec_gateway(
    *,
    mode: str,
    host: Optional[str] = None,
    tcp_port: int = 502,
    serial_port: Optional[str] = None,
    baudrate: int = 9600,
    parity: str = "N",
    device_address: int = 1,
    timeout: float = 3.0,
):

    config = SunSpecConnectionConfig(
        mode=mode,
        host=host,
        tcp_port=tcp_port,
        serial_port=serial_port,
        baudrate=baudrate,
        parity=parity,
        device_address=device_address,
        timeout=timeout,
    )

    return UniversalSunSpecGateway(
        config
    )


# ============================================================================
# LOCAL CLI
# ============================================================================

def main():

    import json
    import os

    mode = os.getenv(
        "SUNSPEC_MODE",
        "tcp",
    )

    gateway = create_sunspec_gateway(
        mode=mode,

        host=os.getenv(
            "SUNSPEC_HOST"
        ),

        tcp_port=int(
            os.getenv(
                "SUNSPEC_PORT",
                "502",
            )
        ),

        serial_port=os.getenv(
            "SUNSPEC_SERIAL_PORT"
        ),

        baudrate=int(
            os.getenv(
                "SUNSPEC_BAUDRATE",
                "9600",
            )
        ),

        parity=os.getenv(
            "SUNSPEC_PARITY",
            "N",
        ),

        device_address=int(
            os.getenv(
                "SUNSPEC_DEVICE_ADDRESS",
                "1",
            )
        ),

        timeout=float(
            os.getenv(
                "SUNSPEC_TIMEOUT",
                "3",
            )
        ),
    )

    print()
    print("=" * 70)
    print(
        "SolarIQ+ Universal SunSpec Gateway"
    )
    print("=" * 70)

    try:

        print(
            "\nConnecting..."
        )

        print(
            json.dumps(
                gateway.connect(),
                indent=2,
            )
        )

        print(
            "\nScanning SunSpec models..."
        )

        print(
            json.dumps(
                gateway.discover(),
                indent=2,
                default=str,
            )
        )

        print(
            "\nDevice:"
        )

        print(
            json.dumps(
                gateway.get_device_info(),
                indent=2,
                default=str,
            )
        )

        print(
            "\nRealtime:"
        )

        print(
            json.dumps(
                gateway.read_realtime(),
                indent=2,
                default=str,
            )
        )

        print(
            "\nUNIVERSAL SUNSPEC: PASS"
        )

    except Exception as exc:

        print(
            "\nUNIVERSAL SUNSPEC: FAIL"
        )

        print(
            f"Error: {exc}"
        )

        raise

    finally:

        gateway.close()


if __name__ == "__main__":
    main()