"""
Normalization boundary for SolarIQ+.

Provider adapters should normalize their responses into the shared
models. This module contains small validation helpers so malformed
provider data does not silently enter SolarIQ+ analytics.
"""

from datetime import datetime
from typing import Optional

from .models import InverterReading


def validate_reading(reading: InverterReading) -> InverterReading:
    if not reading.provider:
        raise ValueError("Reading provider is required.")

    if not reading.external_system_id:
        raise ValueError("External system ID is required.")

    if not isinstance(reading.timestamp, datetime):
        raise ValueError("Reading timestamp must be a datetime.")

    if reading.power_kw is not None and reading.power_kw < 0:
        raise ValueError("Power cannot be negative.")

    if reading.energy_kwh is not None and reading.energy_kwh < 0:
        raise ValueError("Energy cannot be negative.")

    if reading.battery_soc_percent is not None:
        if not 0 <= reading.battery_soc_percent <= 100:
            raise ValueError("Battery SOC must be between 0 and 100.")

    return reading
