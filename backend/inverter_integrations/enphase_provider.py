"""
SolarIQ+ Enphase provider adapter.

This adapter wraps the existing EnphaseConnector and exposes it through
the provider-agnostic inverter integration interface.

It does NOT create a second Enphase API client. Existing OAuth/token
handling remains inside enphase_connector.py.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from .base import InverterProvider
from .models import (
    InverterReading,
    InverterSystem,
    ProviderCapability,
)
from .normalizer import validate_reading


class EnphaseProvider(InverterProvider):
    provider_id = "enphase"
    provider_name = "Enphase"

    capabilities = ProviderCapability(
        realtime=True,
        historical_energy=True,
        alarms=False,
        inverter_details=True,
        system_details=True,
        oauth=True,
        local_gateway=False,
    )

    def __init__(self, connector: Any):
        self.connector = connector

    async def get_authorization_url(
        self,
        project_id: str,
        state: str,
    ) -> str:
        raise NotImplementedError(
            "Use the existing Enphase OAuth service for authorization. "
            "Provider-level multi-user OAuth will be connected in the "
            "connection layer."
        )

    async def handle_callback(
        self,
        code: str,
        state: str,
    ) -> Dict[str, Any]:
        raise NotImplementedError(
            "Use the existing Enphase OAuth callback service. "
            "Per-user credential persistence will be connected in the "
            "connection layer."
        )

    async def revoke_connection(
        self,
        connection_id: str,
    ) -> None:
        raise NotImplementedError(
            "Enphase revoke handling will be connected in the "
            "per-user connection store."
        )

    async def get_systems(
        self,
        connection_id: str,
    ) -> List[InverterSystem]:
        raw = await self.connector.get_systems()
        return self._normalize_systems(raw)

    async def get_realtime(
        self,
        connection_id: str,
        system_id: str,
    ) -> List[InverterReading]:
        end_at = int(datetime.now(timezone.utc).timestamp())
        start_at = end_at - (5 * 60)

        raw = await self.connector.get_production_meter(
            system_id=system_id,
            start_at=start_at,
            end_at=end_at,
        )

        readings = self._normalize_readings(
            raw,
            system_id=system_id,
        )

        return [validate_reading(item) for item in readings]

    async def get_historical_energy(
        self,
        connection_id: str,
        system_id: str,
        start_at: datetime,
        end_at: datetime,
    ) -> List[InverterReading]:
        raw = await self.connector.get_energy_lifetime(
            system_id=system_id,
            start_at=int(start_at.timestamp()),
            end_at=int(end_at.timestamp()),
        )

        readings = self._normalize_readings(
            raw,
            system_id=system_id,
        )

        return [validate_reading(item) for item in readings]

    async def get_alarms(
        self,
        connection_id: str,
        system_id: str,
        start_at: Optional[datetime] = None,
        end_at: Optional[datetime] = None,
    ) -> List[Dict[str, Any]]:
        raise NotImplementedError(
            "Alarm normalization is not implemented in the current "
            "Enphase adapter."
        )

    async def get_system_details(
        self,
        connection_id: str,
        system_id: str,
    ) -> InverterSystem:
        raw = await self.connector.get_system(system_id)

        return self._normalize_system(
            raw,
            fallback_system_id=system_id,
        )

    def _normalize_systems(
        self,
        payload: Any,
    ) -> List[InverterSystem]:
        if isinstance(payload, dict):
            candidates = (
                payload.get("systems")
                or payload.get("items")
                or payload.get("data")
            )
        else:
            candidates = payload

        if not isinstance(candidates, list):
            return []

        normalized: List[InverterSystem] = []

        for item in candidates:
            if not isinstance(item, dict):
                continue

            system = self._normalize_system(item)

            if system.external_system_id:
                normalized.append(system)

        return normalized

    def _normalize_system(
        self,
        item: Dict[str, Any],
        fallback_system_id: Optional[str] = None,
    ) -> InverterSystem:
        external_id = (
            item.get("system_id")
            or item.get("id")
            or item.get("systemId")
            or fallback_system_id
            or ""
        )

        name = (
            item.get("name")
            or item.get("system_name")
            or item.get("systemName")
        )

        capacity = (
            item.get("capacity_kw")
            or item.get("system_capacity_kw")
            or item.get("size_kw")
        )

        try:
            capacity = (
                float(capacity)
                if capacity is not None
                else None
            )
        except (TypeError, ValueError):
            capacity = None

        return InverterSystem(
            provider=self.provider_name,
            external_system_id=str(external_id),
            name=str(name) if name is not None else None,
            timezone=(
                str(item.get("timezone"))
                if item.get("timezone") is not None
                else None
            ),
            status=(
                str(item.get("status"))
                if item.get("status") is not None
                else None
            ),
            capacity_kw=capacity,
            raw=item,
        )

    def _normalize_readings(
        self,
        payload: Any,
        system_id: str,
    ) -> List[InverterReading]:
        if isinstance(payload, dict):
            candidates = (
                payload.get("readings")
                or payload.get("production")
                or payload.get("intervals")
                or payload.get("items")
                or payload.get("data")
            )
        else:
            candidates = payload

        if not isinstance(candidates, list):
            return []

        normalized: List[InverterReading] = []

        for item in candidates:
            if not isinstance(item, dict):
                continue

            timestamp = self._extract_timestamp(item)

            if timestamp is None:
                continue

            energy = self._extract_number(
                item,
                (
                    "energy_kwh",
                    "production_kwh",
                    "actual_generation_kwh",
                    "energy",
                    "value",
                ),
            )

            power = self._extract_number(
                item,
                (
                    "power_kw",
                    "power",
                    "w",
                    "watts",
                ),
            )

            if power is not None and abs(power) > 1000:
                power = power / 1000.0

            normalized.append(
                InverterReading(
                    provider=self.provider_name,
                    external_system_id=system_id,
                    timestamp=timestamp,
                    power_kw=power,
                    energy_kwh=energy,
                    inverter_status=(
                        str(item.get("status"))
                        if item.get("status") is not None
                        else None
                    ),
                    raw=item,
                )
            )

        return normalized

    @staticmethod
    def _extract_number(
        item: Dict[str, Any],
        keys: tuple[str, ...],
    ) -> Optional[float]:
        for key in keys:
            value = item.get(key)

            if value is None:
                continue

            try:
                return float(value)
            except (TypeError, ValueError):
                continue

        return None

    @staticmethod
    def _extract_timestamp(
        item: Dict[str, Any],
    ) -> Optional[datetime]:
        value = (
            item.get("timestamp")
            or item.get("time")
            or item.get("end_at")
            or item.get("reading_date")
            or item.get("date")
        )

        if value is None:
            return None

        try:
            if isinstance(value, (int, float)):
                return datetime.fromtimestamp(
                    value,
                    tz=timezone.utc,
                )

            text = str(value)

            if text.endswith("Z"):
                text = text[:-1] + "+00:00"

            parsed = datetime.fromisoformat(text)

            if parsed.tzinfo is None:
                parsed = parsed.replace(
                    tzinfo=timezone.utc
                )

            return parsed

        except (TypeError, ValueError, OverflowError):
            return None
