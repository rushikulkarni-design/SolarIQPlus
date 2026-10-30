import math
import os
import random
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import httpx
from dotenv import load_dotenv

load_dotenv()


class EnphaseConnector:
    """
    SolarIQ+ Enphase integration connector.

    Supports two modes:

    1. REAL ENPHASE MODE
       - OAuth authorization
       - system discovery
       - system details
       - devices
       - production telemetry
       - lifetime energy

    2. DEMO / INTEGRATION MODE
       - generates clearly labelled historical generation data
       - uses the same normalized structure as real Enphase data
       - intended for demonstrations before a real Enphase system
         has been authorized

    Credentials remain on the backend.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        client_id: Optional[str] = None,
        client_secret: Optional[str] = None,
        access_token: Optional[str] = None,
        refresh_token: Optional[str] = None,
        base_url: Optional[str] = None,
    ):
        self.api_key = (
            api_key
            or os.getenv("ENPHASE_API_KEY")
            or ""
        ).strip()

        self.client_id = (
            client_id
            or os.getenv("ENPHASE_CLIENT_ID")
            or ""
        ).strip()

        self.client_secret = (
            client_secret
            or os.getenv("ENPHASE_CLIENT_SECRET")
            or ""
        ).strip()

        self.access_token = (
            access_token
            or os.getenv("ENPHASE_ACCESS_TOKEN")
            or ""
        ).strip()

        self.refresh_token = (
            refresh_token
            or os.getenv("ENPHASE_REFRESH_TOKEN")
            or ""
        ).strip()

        self.base_url = (
            base_url
            or os.getenv(
                "ENPHASE_API_BASE_URL",
                "https://api.enphaseenergy.com",
            )
        ).rstrip("/")

        self.oauth_url = (
            os.getenv(
                "ENPHASE_OAUTH_BASE_URL",
                "https://api.enphaseenergy.com/oauth",
            )
        ).rstrip("/")

    # ------------------------------------------------------------------
    # CONFIGURATION / AUTHORIZATION
    # ------------------------------------------------------------------

    @property
    def configured(self) -> bool:
        """
        True when the Enphase developer application credentials
        are configured.
        """
        return bool(
            self.api_key
            and self.client_id
            and self.client_secret
        )

    @property
    def authorized(self) -> bool:
        """
        True when a system-owner OAuth access token is available.
        """
        return bool(self.access_token)

    def _api_headers(self) -> Dict[str, str]:
        if not self.authorized:
            raise RuntimeError(
                "Enphase access token is not configured."
            )

        return {
            "Authorization": f"Bearer {self.access_token}",
            "Accept": "application/json",
        }

    def _api_params(
        self,
        params: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        final_params = dict(params or {})

        if self.api_key:
            final_params["key"] = self.api_key

        return final_params

    # ------------------------------------------------------------------
    # REAL ENPHASE API
    # ------------------------------------------------------------------

    async def _get_api(
        self,
        path: str,
        params: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        if not self.configured:
            raise RuntimeError(
                "Enphase application credentials are not configured."
            )

        if not self.authorized:
            raise RuntimeError(
                "Enphase system authorization is required."
            )

        url = f"{self.base_url}/{path.lstrip('/')}"

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                url,
                headers=self._api_headers(),
                params=self._api_params(params),
            )

        if response.status_code >= 400:
            raise RuntimeError(
                f"Enphase API request failed "
                f"({response.status_code}): "
                f"{response.text[:1000]}"
            )

        return response.json()

    async def exchange_auth_code(
        self,
        code: str,
        redirect_uri: str,
    ) -> Dict[str, Any]:
        """
        Exchange Enphase authorization code for
        access and refresh tokens.
        """
        if not self.configured:
            raise RuntimeError(
                "Enphase application credentials are not configured."
            )

        if not code:
            raise ValueError(
                "Authorization code is required."
            )

        if not redirect_uri:
            raise ValueError(
                "redirect_uri is required."
            )

        url = f"{self.oauth_url}/token"

        params = {
            "grant_type": "authorization_code",
            "redirect_uri": redirect_uri,
            "code": code,
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                url,
                params=params,
                auth=(
                    self.client_id,
                    self.client_secret,
                ),
            )

        if response.status_code >= 400:
            raise RuntimeError(
                f"Enphase token exchange failed "
                f"({response.status_code}): "
                f"{response.text[:1000]}"
            )

        token_data = response.json()

        self.access_token = (
            token_data.get("access_token") or ""
        ).strip()

        self.refresh_token = (
            token_data.get("refresh_token") or ""
        ).strip()

        return token_data

    async def refresh_access_token(self) -> Dict[str, Any]:
        """
        Generate a new access token using the refresh token.
        """
        if not self.configured:
            raise RuntimeError(
                "Enphase application credentials are not configured."
            )

        if not self.refresh_token:
            raise RuntimeError(
                "Enphase refresh token is not configured."
            )

        url = f"{self.oauth_url}/token"

        params = {
            "grant_type": "refresh_token",
            "refresh_token": self.refresh_token,
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                url,
                params=params,
                auth=(
                    self.client_id,
                    self.client_secret,
                ),
            )

        if response.status_code >= 400:
            raise RuntimeError(
                f"Enphase token refresh failed "
                f"({response.status_code}): "
                f"{response.text[:1000]}"
            )

        token_data = response.json()

        self.access_token = (
            token_data.get("access_token") or ""
        ).strip()

        new_refresh = token_data.get("refresh_token")

        if new_refresh:
            self.refresh_token = new_refresh.strip()

        return token_data

    async def get_systems(self) -> Dict[str, Any]:
        """
        Retrieve all systems available to the authorized user.
        """
        return await self._get_api(
            "/api/v4/systems"
        )

    async def get_system(
        self,
        system_id: str,
    ) -> Dict[str, Any]:
        """
        Retrieve one Enphase system summary.
        """
        if not system_id:
            raise ValueError(
                "system_id is required."
            )

        return await self._get_api(
            f"/api/v4/systems/{system_id}/summary"
        )

    async def get_devices(
        self,
        system_id: str,
    ) -> Dict[str, Any]:
        """
        Retrieve devices belonging to a system.
        """
        if not system_id:
            raise ValueError(
                "system_id is required."
            )

        return await self._get_api(
            f"/api/v4/systems/{system_id}/devices"
        )

    async def get_production_meter(
        self,
        system_id: str,
        start_at: int,
        end_at: int,
    ) -> Dict[str, Any]:
        """
        Retrieve site-level production-meter energy.

        Enphase telemetry requests are kept within the
        supported short historical window.
        """
        if not system_id:
            raise ValueError(
                "system_id is required."
            )

        if end_at <= start_at:
            raise ValueError(
                "end_at must be greater than start_at."
            )

        return await self._get_api(
            f"/api/v4/systems/{system_id}/"
            "telemetry/production_meter",
            {
                "start_at": int(start_at),
                "end_at": int(end_at),
            },
        )

    async def get_production_micro(
        self,
        system_id: str,
        start_at: int,
        end_at: int,
    ) -> Dict[str, Any]:
        """
        Retrieve site-level production measured by microinverters.
        """
        if not system_id:
            raise ValueError(
                "system_id is required."
            )

        if end_at <= start_at:
            raise ValueError(
                "end_at must be greater than start_at."
            )

        return await self._get_api(
            f"/api/v4/systems/{system_id}/"
            "production_micro",
            {
                "start_at": int(start_at),
                "end_at": int(end_at),
            },
        )

    async def get_energy_lifetime(
        self,
        system_id: str,
        start_at: Optional[int] = None,
        end_at: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Retrieve daily site-level lifetime production.
        """
        if not system_id:
            raise ValueError(
                "system_id is required."
            )

        params: Dict[str, Any] = {}

        if start_at is not None:
            params["start_at"] = int(start_at)

        if end_at is not None:
            params["end_at"] = int(end_at)

        return await self._get_api(
            f"/api/v4/systems/{system_id}/energy_lifetime",
            params,
        )

    # ------------------------------------------------------------------
    # NORMALIZED REAL DATA
    # ------------------------------------------------------------------

    @staticmethod
    def normalize_generation_reading(
        reading_date: str,
        generation_kwh: float,
        source: str = "enphase",
        project_id: Optional[str] = None,
        provider: str = "Enphase",
    ) -> Dict[str, Any]:
        """
        Convert generation data into the SolarIQ+ normalized format.

        This is the common format used by the monitoring layer,
        regardless of whether the source is real Enphase data,
        another inverter, or a demo adapter.
        """
        if not reading_date:
            raise ValueError(
                "reading_date is required."
            )

        generation = float(generation_kwh)

        if generation < 0:
            raise ValueError(
                "generation_kwh cannot be negative."
            )

        result: Dict[str, Any] = {
            "reading_date": reading_date,
            "actual_generation_kwh": round(
                generation,
                3,
            ),
            "source": source,
            "provider": provider,
            "data_mode": "real",
        }

        if project_id:
            result["project_id"] = project_id

        return result

    # ------------------------------------------------------------------
    # DEMO / REVIEW DATA
    # ------------------------------------------------------------------

    @staticmethod
    def generate_demo_generation_history(
        days: int = 30,
        system_capacity_kw: float = 2.5,
        end_date: Optional[date] = None,
        project_id: Optional[str] = None,
        seed: int = 42,
    ) -> List[Dict[str, Any]]:
        """
        Generate clearly labelled demo generation history.

        IMPORTANT:
        This is NOT presented as real customer/inverter data.

        The values are generated from:
        - system capacity
        - daylight-shaped generation
        - mild weather variability
        - deterministic random noise

        The resulting structure intentionally matches the
        normalized real-data structure used by SolarIQ+.
        """
        if days < 1:
            raise ValueError(
                "days must be at least 1."
            )

        if days > 365:
            raise ValueError(
                "Demo history cannot exceed 365 days."
            )

        if system_capacity_kw <= 0:
            raise ValueError(
                "system_capacity_kw must be greater than zero."
            )

        if end_date is None:
            end_date = datetime.now(
                timezone.utc
            ).date()

        rng = random.Random(seed)

        history: List[Dict[str, Any]] = []

        for offset in range(days - 1, -1, -1):
            current_date = end_date - timedelta(
                days=offset
            )

            day_number = days - offset

            # Smooth seasonal factor.
            seasonal_factor = (
                0.92
                + 0.10
                * math.sin(
                    day_number / 8.0
                )
            )

            # Day-to-day weather factor.
            weather_factor = rng.uniform(
                0.78,
                1.08,
            )

            # Approximate daily specific yield.
            #
            # This is intentionally a demonstration model,
            # not an inverter measurement.
            specific_yield = (
                4.1
                * seasonal_factor
                * weather_factor
            )

            generation = (
                system_capacity_kw
                * specific_yield
            )

            # Keep generated values realistic and positive.
            generation = max(
                0.1,
                generation,
            )

            history.append(
                {
                    "reading_date": current_date.isoformat(),
                    "actual_generation_kwh": round(
                        generation,
                        3,
                    ),
                    "source": "demo_enphase_adapter",
                    "provider": "Enphase",
                    "data_mode": "demo",
                    "demo": True,
                    "project_id": project_id,
                }
            )

        return history

    @classmethod
    def get_demo_import(
        cls,
        days: int = 30,
        system_capacity_kw: float = 2.5,
        project_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Return a complete demo import package.

        This is the interface that the monitoring server can
        use before a real Enphase system is authorized.
        """
        history = cls.generate_demo_generation_history(
            days=days,
            system_capacity_kw=system_capacity_kw,
            project_id=project_id,
        )

        total_generation = round(
            sum(
                item["actual_generation_kwh"]
                for item in history
            ),
            3,
        )

        return {
            "provider": "Enphase",
            "data_mode": "demo",
            "demo": True,
            "project_id": project_id,
            "days_imported": len(history),
            "total_generation_kwh": total_generation,
            "message": (
                "Demo Enphase integration data. "
                "Not real inverter/customer data."
            ),
            "readings": history,
        }

    # ------------------------------------------------------------------
    # IMPORT INTERFACE
    # ------------------------------------------------------------------

    async def import_generation_history(
        self,
        system_id: Optional[str] = None,
        days: int = 30,
        system_capacity_kw: float = 2.5,
        project_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Common generation-history import interface.

        REAL MODE:
            If an OAuth access token and system_id are available,
            the method retrieves real Enphase lifetime data.

        DEMO MODE:
            If no authorized system is available, it returns
            clearly labelled demo integration data.

        This allows the rest of SolarIQ+ to remain independent
        from the specific data source.
        """
        if self.authorized and system_id:
            end_dt = datetime.now(
                timezone.utc
            )

            start_dt = end_dt - timedelta(
                days=days
            )

            raw = await self.get_energy_lifetime(
                system_id=system_id,
                start_at=int(
                    start_dt.timestamp()
                ),
                end_at=int(
                    end_dt.timestamp()
                ),
            )

            return {
                "provider": "Enphase",
                "data_mode": "real",
                "demo": False,
                "project_id": project_id,
                "system_id": system_id,
                "raw_response": raw,
                "message": (
                    "Real Enphase generation data "
                    "retrieved from an authorized system."
                ),
            }

        return self.get_demo_import(
            days=days,
            system_capacity_kw=system_capacity_kw,
            project_id=project_id,
        )

    # ------------------------------------------------------------------
    # HEALTH
    # ------------------------------------------------------------------

    async def health_check(self) -> Dict[str, Any]:
        """
        Return Enphase integration status.
        """
        if self.authorized:
            status = "authorized"
        elif self.configured:
            status = "configured"
        else:
            status = "not_configured"

        return {
            "provider": "Enphase",
            "application_configured": self.configured,
            "system_authorized": self.authorized,
            "status": status,
            "real_data_available": self.authorized,
            "demo_data_available": True,
            "checked_at": datetime.now(
                timezone.utc
            ).isoformat(),
        }


# ----------------------------------------------------------------------
# UTILITY
# ----------------------------------------------------------------------

def unix_timestamp(dt: datetime) -> int:
    """
    Convert datetime to Unix timestamp.
    """
    if dt.tzinfo is None:
        dt = dt.replace(
            tzinfo=timezone.utc
        )

    return int(dt.timestamp())