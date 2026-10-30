import os

from datetime import datetime, timezone

from pathlib import Path

from typing import Any, Dict, Optional

import joblib

import pandas as pd

from dotenv import load_dotenv

from fastapi import FastAPI, HTTPException, Query

from fastapi.middleware.cors import CORSMiddleware

from motor.motor_asyncio import AsyncIOMotorClient

from pydantic import BaseModel, Field

from bson import ObjectId

from enphase_connector import EnphaseConnector

from inverter_integrations.sunspec_api import router as universal_sunspec_router

from inverter_integrations.sunspec_api import (
    router as universal_sunspec_router,
)

from inverter_integrations.bootstrap import (
    build_inverter_registry,
)


load_dotenv()


app = FastAPI(
    title="SolarIQ+ Monitoring API",
    version="1.5.0",
    description=(
        "SolarIQ+ monitoring and analytics API with provider-neutral "
        "inverter integrations."
    ),
)

app.include_router(
    universal_sunspec_router
)

app.include_router(
    universal_sunspec_router
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


BASE_DIR = Path(__file__).resolve().parent

MODEL_DIR = BASE_DIR / "models"


MONGO_URI = os.getenv(
    "MONGO_URI",
    os.getenv("MONGO_URL", "mongodb://localhost:27017"),
)

MONGO_DB_NAME = os.getenv(
    "MONGO_DB_NAME",
    os.getenv("MONGO_DB_NAME", "solariq"),
)


mongo_client = None

mongo_db = None


try:

    mongo_client = AsyncIOMotorClient(
        MONGO_URI,
        serverSelectionTimeoutMS=2000,
    )

    mongo_db = mongo_client[MONGO_DB_NAME]

except Exception:

    mongo_client = None

    mongo_db = None


enphase = EnphaseConnector()


inverter_registry = build_inverter_registry(
    enphase_connector=enphase,
)


def serialize_inverter_system(
    system,
) -> Dict[str, Any]:

    return {
        "provider": system.provider,
        "external_system_id": system.external_system_id,
        "name": system.name,
        "timezone": system.timezone,
        "status": system.status,
        "capacity_kw": system.capacity_kw,
        "raw": system.raw,
    }


def serialize_inverter_reading(
    reading,
) -> Dict[str, Any]:

    return {
        "provider": reading.provider,
        "external_system_id": reading.external_system_id,
        "timestamp": (
            reading.timestamp.isoformat()
            if reading.timestamp
            else None
        ),
        "power_kw": reading.power_kw,
        "energy_kwh": reading.energy_kwh,
        "inverter_status": reading.inverter_status,
        "grid_power_kw": reading.grid_power_kw,
        "battery_soc_percent": reading.battery_soc_percent,
        "raw": reading.raw,
    }


def serialize_provider_capabilities(
    capabilities,
) -> Dict[str, bool]:

    return {
        "realtime": capabilities.realtime,
        "historical_energy": capabilities.historical_energy,
        "alarms": capabilities.alarms,
        "inverter_details": capabilities.inverter_details,
        "system_details": capabilities.system_details,
        "oauth": capabilities.oauth,
        "local_gateway": capabilities.local_gateway,
    }


def get_inverter_provider(
    provider_id: str,
):

    try:

        return inverter_registry.get(
            provider_id
        )

    except KeyError:

        raise HTTPException(
            status_code=404,
            detail=(
                f"Inverter provider "
                f"'{provider_id}' is not registered."
            ),
        )


def get_provider_data_mode(
    provider,
) -> str:

    mode = getattr(
        provider,
        "data_mode",
        None,
    )

    if mode in {
        "real",
        "simulator",
        "demo",
    }:

        return mode


    adapter = getattr(
        provider,
        "adapter",
        None,
    )


    transport = getattr(
        adapter,
        "transport",
        None,
    )


    if transport is not None:

        transport_name = (
            transport.__class__.__name__
            .lower()
        )

        if (
            "simulated" in transport_name
            or "simulator" in transport_name
        ):

            return "simulator"


    return "real"


@app.get("/")
async def root():

    return {
        "service": "SolarIQ+ Monitoring API",
        "status": "running",
        "version": "1.5.0",
    }


@app.get("/health")
async def health():

    return {
        "status": "healthy",
        "service": "monitoring",
        "version": "1.5.0",
    }


class InverterConnectionCreate(
    BaseModel
):

    project_id: str

    name: Optional[str] = None

    external_system_id: Optional[str] = None

    data_mode: Optional[str] = Field(
        default=None,
        description="real, simulator, or demo",
    )

    config: Dict[str, Any] = Field(
        default_factory=dict
    )

    metadata: Dict[str, Any] = Field(
        default_factory=dict
    )


class MonitoringRequest(
    BaseModel
):

    project_id: Optional[str] = None

    start_date: Optional[str] = None

    end_date: Optional[str] = None

    data_mode: Optional[str] = Field(
        default=None,
        description="real, demo, or simulator",
    )


class MonitoringResponse(
    BaseModel
):

    status: str

    message: Optional[str] = None

    data: Optional[Any] = None

    data_mode: Optional[str] = None


def parse_datetime(
    value: Optional[str],
) -> Optional[datetime]:

    if not value:

        return None


    try:

        parsed = datetime.fromisoformat(
            value.replace(
                "Z",
                "+00:00",
            )
        )


        if parsed.tzinfo is None:

            parsed = parsed.replace(
                tzinfo=timezone.utc
            )


        return parsed


    except Exception:

        raise HTTPException(
            status_code=400,
            detail=f"Invalid datetime: {value}",
        )


def serialize_datetime(
    value: Any,
) -> Optional[str]:

    if value is None:

        return None


    if isinstance(
        value,
        datetime,
    ):

        return value.isoformat()


    return str(value)


async def save_monitoring_document(
    collection_name: str,
    document: Dict[str, Any],
):

    if mongo_db is None:

        return None


    try:

        result = await mongo_db[
            collection_name
        ].insert_one(
            document
        )

        return str(
            result.inserted_id
        )


    except Exception:

        return None


async def update_monitoring_document(
    collection_name: str,
    document_id: str,
    update_data: Dict[str, Any],
):

    if mongo_db is None:

        return False


    try:

        from bson import ObjectId


        result = await mongo_db[
            collection_name
        ].update_one(
            {
                "_id": ObjectId(
                    document_id
                )
            },
            {
                "$set": update_data
            },
        )


        return result.modified_count > 0


    except Exception:

        return False


async def get_monitoring_documents(
    collection_name: str,
    query: Optional[
        Dict[str, Any]
    ] = None,
    limit: int = 100,
):

    if mongo_db is None:

        return []


    try:

        cursor = mongo_db[
            collection_name
        ].find(
            query or {}
        ).limit(
            limit
        )


        documents = []


        async for document in cursor:

            document["_id"] = str(
                document["_id"]
            )

            documents.append(
                document
            )


        return documents


    except Exception:

        return []


@app.post(
    "/api/monitoring/data",
    response_model=MonitoringResponse,
)
async def monitoring_data(
    payload: MonitoringRequest,
):

    document = {
        "project_id": payload.project_id,
        "start_date": payload.start_date,
        "end_date": payload.end_date,
        "data_mode": payload.data_mode,
        "created_at": datetime.now(
            timezone.utc
        ),
    }


    document_id = (
        await save_monitoring_document(
            "monitoring_requests",
            document,
        )
    )


    return MonitoringResponse(
        status="success",
        message="Monitoring request received.",
        data={
            "document_id": document_id,
            "project_id": payload.project_id,
            "start_date": payload.start_date,
            "end_date": payload.end_date,
        },
        data_mode=payload.data_mode,
    )


@app.get(
    "/api/monitoring/models"
)
async def get_models():

    models = []


    if MODEL_DIR.exists():

        for path in MODEL_DIR.iterdir():

            if path.is_file():

                models.append(
                    {
                        "name": path.name,
                        "path": str(path),
                    }
                )


    return {
        "status": "success",
        "count": len(models),
        "models": models,
    }


INVERTER_CONNECTIONS_COLLECTION = (
    "inverter_connections"
)


FORBIDDEN_CREDENTIAL_KEYS = {
    "password",
    "secret",
    "client_secret",
    "api_key",
    "access_token",
    "refresh_token",
    "authorization",
    "token",
}


def _reject_credentials(
    config: Dict[str, Any],
) -> None:

    unsafe = [
        key
        for key in config
        if key.lower()
        in FORBIDDEN_CREDENTIAL_KEYS
    ]


    if unsafe:

        raise HTTPException(
            status_code=400,
            detail=(
                "Credentials and tokens must not "
                "be sent to this endpoint. "
                "Use the provider OAuth/credential "
                f"flow instead: {unsafe}"
            ),
        )


async def get_inverter_connection(
    connection_id: str,
    provider_id: Optional[str] = None,
    project_id: Optional[str] = None,
):

    if connection_id == "default":

        provider = (
            get_inverter_provider(
                provider_id
            )
            if provider_id
            else None
        )


        return {
            "connection_id": "default",
            "project_id": project_id,
            "provider_id": provider_id,
            "provider_name": (
                provider.provider_name
                if provider
                else None
            ),
            "status": "legacy_default",
            "data_mode": (
                get_provider_data_mode(
                    provider
                )
                if provider
                else "real"
            ),
        }


    if mongo_db is None:

        raise HTTPException(
            status_code=503,
            detail="MongoDB is unavailable.",
        )


    query: Dict[str, Any] = {
        "connection_id": connection_id
    }


    if provider_id:

        query["provider_id"] = provider_id


    if project_id:

        query["project_id"] = project_id


    try:

        return await mongo_db[
            INVERTER_CONNECTIONS_COLLECTION
        ].find_one(
            query,
            {"_id": 0},
        )


    except Exception as exc:

        raise HTTPException(
            status_code=503,
            detail=(
                "Connection lookup failed: "
                f"{exc}"
            ),
        )


def serialize_connection(
    document: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Convert a MongoDB inverter connection document into
    a completely JSON-safe dictionary.
    """

    def make_json_safe(value):
        if isinstance(value, ObjectId):
            return str(value)

        if isinstance(value, datetime):
            return value.isoformat()

        if isinstance(value, dict):
            return {
                str(key): make_json_safe(item)
                for key, item in value.items()
            }

        if isinstance(value, list):
            return [
                make_json_safe(item)
                for item in value
            ]

        if isinstance(value, tuple):
            return [
                make_json_safe(item)
                for item in value
            ]

        return value

    return make_json_safe(dict(document))


@app.post(
    "/api/monitoring/inverters/"
    "{provider_id}/connections"
)
async def create_inverter_connection(
    provider_id: str,
    payload: InverterConnectionCreate,
):

    provider = get_inverter_provider(
        provider_id
    )


    if mongo_db is None:

        raise HTTPException(
            status_code=503,
            detail="MongoDB is unavailable.",
        )


    _reject_credentials(
        payload.config
    )


    mode = (
        payload.data_mode
        or get_provider_data_mode(
            provider
        )
    )


    if mode not in {
        "real",
        "simulator",
        "demo",
    }:

        raise HTTPException(
            status_code=400,
            detail=(
                "data_mode must be "
                "real, simulator, or demo."
            ),
        )


    from uuid import uuid4


    connection_id = str(
        uuid4()
    )


    now = datetime.now(
        timezone.utc
    )


    status = (
        "connected"
        if mode in {
            "simulator",
            "demo",
        }
        else "pending"
    )


    document = {
        "connection_id": connection_id,
        "project_id": payload.project_id,
        "provider_id": provider.provider_id,
        "provider_name": provider.provider_name,
        "name": (
            payload.name
            or f"{provider.provider_name} connection"
        ),
        "external_system_id": (
            payload.external_system_id
        ),
        "status": status,
        "data_mode": mode,
        "connected_at": (
            now
            if status == "connected"
            else None
        ),
        "updated_at": now,
        "config": payload.config,
        "metadata": payload.metadata,
    }


    try:

        await mongo_db[
            INVERTER_CONNECTIONS_COLLECTION
        ].insert_one(
            document
        )


    except Exception as exc:

        raise HTTPException(
            status_code=503,
            detail=(
                "Could not save inverter "
                f"connection: {exc}"
            ),
        )


    return {
        "status": "success",
        "connection": serialize_connection(
            document
        ),
    }


@app.get(
    "/api/monitoring/inverters/connections"
)
async def list_inverter_connections(
    project_id: Optional[str] = None,
    provider_id: Optional[str] = None,
):

    if mongo_db is None:

        raise HTTPException(
            status_code=503,
            detail="MongoDB is unavailable.",
        )


    query: Dict[str, Any] = {}


    if project_id:

        query["project_id"] = project_id


    if provider_id:

        query["provider_id"] = provider_id


    try:

        cursor = (
            mongo_db[
                INVERTER_CONNECTIONS_COLLECTION
            ]
            .find(
                query,
                {"_id": 0},
            )
            .sort(
                "updated_at",
                -1,
            )
        )


        connections = [
            serialize_connection(
                doc
            )
            async for doc in cursor
        ]


        return {
            "status": "success",
            "count": len(
                connections
            ),
            "connections": connections,
        }


    except Exception as exc:

        raise HTTPException(
            status_code=503,
            detail=(
                "Could not list inverter "
                f"connections: {exc}"
            ),
        )


@app.get(
    "/api/monitoring/inverters/"
    "connections/{connection_id}"
)
async def get_inverter_connection_details(
    connection_id: str,
):

    connection = (
        await get_inverter_connection(
            connection_id
        )
    )


    if connection is None:

        raise HTTPException(
            status_code=404,
            detail=(
                "Inverter connection "
                "not found."
            ),
        )


    return {
        "status": "success",
        "connection": serialize_connection(
            connection
        ),
    }


@app.delete(
    "/api/monitoring/inverters/"
    "connections/{connection_id}"
)
async def delete_inverter_connection(
    connection_id: str,
):

    if connection_id == "default":

        raise HTTPException(
            status_code=400,
            detail=(
                "The legacy default connection "
                "cannot be deleted."
            ),
        )


    if mongo_db is None:

        raise HTTPException(
            status_code=503,
            detail="MongoDB is unavailable.",
        )


    try:

        result = await mongo_db[
            INVERTER_CONNECTIONS_COLLECTION
        ].delete_one(
            {
                "connection_id": connection_id
            }
        )


    except Exception as exc:

        raise HTTPException(
            status_code=503,
            detail=(
                "Could not delete inverter "
                f"connection: {exc}"
            ),
        )


    if result.deleted_count == 0:

        raise HTTPException(
            status_code=404,
            detail=(
                "Inverter connection "
                "not found."
            ),
        )


    return {
        "status": "success",
        "connection_id": connection_id,
        "message": (
            "Inverter connection removed."
        ),
    }


@app.get(
    "/api/monitoring/inverters/providers"
)
async def list_inverter_providers():

    providers = []


    for provider in (
        inverter_registry.all()
    ):

        providers.append(
            {
                "id": provider.provider_id,
                "name": provider.provider_name,
                "data_mode": (
                    get_provider_data_mode(
                        provider
                    )
                ),
                "capabilities": (
                    serialize_provider_capabilities(
                        provider.capabilities
                    )
                ),
            }
        )


    return {
        "status": "available",
        "count": len(
            providers
        ),
        "providers": providers,
    }


@app.get(
    "/api/monitoring/inverters/providers/"
    "{provider_id}"
)
async def get_inverter_provider_details(
    provider_id: str,
):

    provider = get_inverter_provider(
        provider_id
    )


    return {
        "status": "available",
        "id": provider.provider_id,
        "name": provider.provider_name,
        "data_mode": (
            get_provider_data_mode(
                provider
            )
        ),
        "capabilities": (
            serialize_provider_capabilities(
                provider.capabilities
            )
        ),
    }


@app.get(
    "/api/monitoring/inverters/"
    "{provider_id}/systems"
)
async def get_inverter_systems(
    provider_id: str,
    connection_id: str = Query(
        default="default"
    ),
):

    provider = get_inverter_provider(
        provider_id
    )


    await get_inverter_connection(
        connection_id,
        provider_id=provider_id,
    )


    try:

        systems = (
            await provider.get_systems(
                connection_id=connection_id
            )
        )


        return {
            "provider": provider.provider_name,
            "data_mode": (
                get_provider_data_mode(
                    provider
                )
            ),
            "count": len(
                systems
            ),
            "systems": [
                serialize_inverter_system(
                    system
                )
                for system in systems
            ],
        }


    except Exception as exc:

        raise HTTPException(
            status_code=502,
            detail=str(exc),
        )


@app.get(
    "/api/monitoring/inverters/"
    "{provider_id}/systems/"
    "{system_id}"
)
async def get_inverter_system_details(
    provider_id: str,
    system_id: str,
    connection_id: str = Query(
        default="default"
    ),
):

    provider = get_inverter_provider(
        provider_id
    )


    await get_inverter_connection(
        connection_id,
        provider_id=provider_id,
    )


    try:

        system = (
            await provider.get_system_details(
                connection_id=connection_id,
                system_id=system_id,
            )
        )


        return {
            "provider": provider.provider_name,
            "data_mode": (
                get_provider_data_mode(
                    provider
                )
            ),
            "system": (
                serialize_inverter_system(
                    system
                )
            ),
        }


    except Exception as exc:

        raise HTTPException(
            status_code=502,
            detail=str(exc),
        )


@app.get(
    "/api/monitoring/inverters/"
    "{provider_id}/systems/"
    "{system_id}/realtime"
)
async def get_inverter_realtime(
    provider_id: str,
    system_id: str,
    connection_id: str = Query(
        default="default"
    ),
):

    provider = get_inverter_provider(
        provider_id
    )


    await get_inverter_connection(
        connection_id,
        provider_id=provider_id,
    )


    try:

        readings = (
            await provider.get_realtime(
                connection_id=connection_id,
                system_id=system_id,
            )
        )


        return {
            "provider": provider.provider_name,
            "system_id": system_id,
            "data_mode": (
                get_provider_data_mode(
                    provider
                )
            ),
            "count": len(
                readings
            ),
            "readings": [
                serialize_inverter_reading(
                    reading
                )
                for reading in readings
            ],
        }


    except Exception as exc:

        raise HTTPException(
            status_code=502,
            detail=str(exc),
        )


@app.get(
    "/api/monitoring/inverters/"
    "{provider_id}/systems/"
    "{system_id}/alarms"
)
async def get_inverter_alarms(
    provider_id: str,
    system_id: str,
    start_at: Optional[str] = Query(
        default=None
    ),
    end_at: Optional[str] = Query(
        default=None
    ),
    connection_id: str = Query(
        default="default"
    ),
):

    provider = get_inverter_provider(
        provider_id
    )


    await get_inverter_connection(
        connection_id,
        provider_id=provider_id,
    )


    start_datetime = parse_datetime(
        start_at
    )


    end_datetime = parse_datetime(
        end_at
    )


    try:

        alarms = (
            await provider.get_alarms(
                connection_id=connection_id,
                system_id=system_id,
                start_at=start_datetime,
                end_at=end_datetime,
            )
        )


        return {
            "provider": provider.provider_name,
            "system_id": system_id,
            "data_mode": (
                get_provider_data_mode(
                    provider
                )
            ),
            "count": len(
                alarms
            ),
            "alarms": alarms,
        }


    except Exception as exc:

        raise HTTPException(
            status_code=502,
            detail=str(exc),
        )


@app.get(
    "/api/monitoring/inverters/"
    "{provider_id}/systems/"
    "{system_id}/history"
)
async def get_inverter_history(
    provider_id: str,
    system_id: str,
    start_at: str,
    end_at: str,
    connection_id: str = Query(
        default="default"
    ),
):

    provider = get_inverter_provider(
        provider_id
    )


    await get_inverter_connection(
        connection_id,
        provider_id=provider_id,
    )


    start_datetime = parse_datetime(
        start_at
    )


    end_datetime = parse_datetime(
        end_at
    )


    if start_datetime is None:

        raise HTTPException(
            status_code=400,
            detail="start_at is required.",
        )


    if end_datetime is None:

        raise HTTPException(
            status_code=400,
            detail="end_at is required.",
        )


    try:

        readings = (
            await provider.get_historical_energy(
                connection_id=connection_id,
                system_id=system_id,
                start_at=start_datetime,
                end_at=end_datetime,
            )
        )


        return {
            "provider": provider.provider_name,
            "system_id": system_id,
            "data_mode": (
                get_provider_data_mode(
                    provider
                )
            ),
            "count": len(
                readings
            ),
            "readings": [
                serialize_inverter_reading(
                    reading
                )
                for reading in readings
            ],
        }


    except Exception as exc:

        raise HTTPException(
            status_code=502,
            detail=str(exc),
        )


@app.get(
    "/api/enphase/health"
)
async def enphase_health():

    configured = getattr(
        enphase,
        "configured",
        False,
    )


    authorized = getattr(
        enphase,
        "authorized",
        False,
    )


    return {
        "provider": "Enphase",
        "provider_id": "enphase",
        "status": (
            "ready"
            if configured and authorized
            else "not_configured"
        ),
        "configured": configured,
        "authorized": authorized,
        "data_mode": "real",
    }


@app.get(
    "/api/enphase/config"
)
async def enphase_config():

    return {
        "provider": "Enphase",
        "provider_id": "enphase",
        "configured": getattr(
            enphase,
            "configured",
            False,
        ),
        "authorized": getattr(
            enphase,
            "authorized",
            False,
        ),
        "data_mode": "real",
    }


@app.get(
    "/api/enphase/systems"
)
async def get_enphase_systems():

    try:

        systems = (
            await enphase.get_systems()
        )


        return {
            "provider": "Enphase",
            "data_mode": "real",
            "count": len(
                systems
            ),
            "systems": systems,
        }


    except Exception as exc:

        raise HTTPException(
            status_code=502,
            detail=str(exc),
        )


@app.get(
    "/api/enphase/systems/"
    "{system_id}"
)
async def get_enphase_system(
    system_id: str,
):

    try:

        system = (
            await enphase.get_system(
                system_id
            )
        )


        return {
            "provider": "Enphase",
            "data_mode": "real",
            "system": system,
        }


    except Exception as exc:

        raise HTTPException(
            status_code=502,
            detail=str(exc),
        )


@app.get(
    "/api/enphase/systems/"
    "{system_id}/devices"
)
async def get_enphase_devices(
    system_id: str,
):

    try:

        devices = (
            await enphase.get_devices(
                system_id
            )
        )


        return {
            "provider": "Enphase",
            "data_mode": "real",
            "system_id": system_id,
            "count": len(
                devices
            ),
            "devices": devices,
        }


    except Exception as exc:

        raise HTTPException(
            status_code=502,
            detail=str(exc),
        )


@app.get(
    "/api/enphase/systems/"
    "{system_id}/production"
)
async def get_enphase_production(
    system_id: str,
):

    try:

        production = (
            await enphase.get_production_meter(
                system_id
            )
        )


        return {
            "provider": "Enphase",
            "data_mode": "real",
            "system_id": system_id,
            "production": production,
        }


    except Exception as exc:

        raise HTTPException(
            status_code=502,
            detail=str(exc),
        )


@app.get(
    "/api/enphase/systems/"
    "{system_id}/production/micro"
)
async def get_enphase_micro_production(
    system_id: str,
):

    try:

        production = (
            await enphase.get_production_micro(
                system_id
            )
        )


        return {
            "provider": "Enphase",
            "data_mode": "real",
            "system_id": system_id,
            "count": len(
                production
            ),
            "production": production,
        }


    except Exception as exc:

        raise HTTPException(
            status_code=502,
            detail=str(exc),
        )


@app.get(
    "/api/enphase/systems/"
    "{system_id}/energy/lifetime"
)
async def get_enphase_lifetime_energy(
    system_id: str,
):

    try:

        energy = (
            await enphase.get_energy_lifetime(
                system_id
            )
        )


        return {
            "provider": "Enphase",
            "data_mode": "real",
            "system_id": system_id,
            "energy": energy,
        }


    except Exception as exc:

        raise HTTPException(
            status_code=502,
            detail=str(exc),
        )


@app.get(
    "/api/monitoring/demo"
)
async def monitoring_demo():

    return {
        "status": "success",
        "data_mode": "demo",
        "message": (
            "This endpoint intentionally returns "
            "demo analytics data."
        ),
        "data": {
            "power_kw": 3.42,
            "energy_today_kwh": 18.6,
            "efficiency_percent": 91.4,
        },
    }


@app.post(
    "/api/monitoring/analytics"
)
async def monitoring_analytics(
    payload: MonitoringRequest,
):

    requested_mode = (
        payload.data_mode
        if payload.data_mode
        else "demo"
    )


    return {
        "status": "success",
        "data_mode": requested_mode,
        "message": (
            "Analytics request accepted."
        ),
        "analytics": {
            "requested_project_id": (
                payload.project_id
            ),
            "start_date": payload.start_date,
            "end_date": payload.end_date,
        },
    }


@app.get(
    "/api/monitoring/energy-summary"
)
async def energy_summary():

    return {
        "status": "success",
        "data_mode": "demo",
        "summary": {
            "today_kwh": 18.6,
            "month_kwh": 482.4,
            "year_kwh": 5820.7,
            "lifetime_kwh": 14258.3,
        },
    }


@app.get(
    "/api/monitoring/performance"
)
async def performance_summary():

    return {
        "status": "success",
        "data_mode": "demo",
        "performance": {
            "efficiency_percent": 91.4,
            "availability_percent": 98.7,
            "performance_ratio_percent": 86.2,
        },
    }


@app.get(
    "/api/monitoring/system-health"
)
async def system_health():

    return {
        "status": "success",
        "data_mode": "demo",
        "health": {
            "overall": "healthy",
            "temperature_c": 42.5,
            "alerts": 0,
            "warnings": 1,
        },
    }


@app.get(
    "/api/monitoring/alerts"
)
async def monitoring_alerts():

    return {
        "status": "success",
        "data_mode": "demo",
        "count": 1,
        "alerts": [
            {
                "severity": "warning",
                "message": (
                    "Performance slightly below "
                    "expected value."
                ),
                "timestamp": datetime.now(
                    timezone.utc
                ).isoformat(),
            }
        ],
    }


@app.get(
    "/api/monitoring/daily-report"
)
async def daily_report():

    return {
        "status": "success",
        "data_mode": "demo",
        "report": {
            "date": datetime.now(
                timezone.utc
            ).date().isoformat(),
            "energy_generated_kwh": 18.6,
            "estimated_savings": 148.8,
            "system_efficiency": 91.4,
        },
    }


@app.get(
    "/api/monitoring/monthly-report"
)
async def monthly_report():

    return {
        "status": "success",
        "data_mode": "demo",
        "report": {
            "month": datetime.now(
                timezone.utc
            ).strftime("%Y-%m"),
            "energy_generated_kwh": 482.4,
            "estimated_savings": 3859.2,
            "system_efficiency": 90.8,
        },
    }


@app.get(
    "/api/monitoring/history"
)
async def monitoring_history(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
):

    return {
        "status": "success",
        "data_mode": "demo",
        "start_date": start_date,
        "end_date": end_date,
        "history": [],
    }


@app.get(
    "/api/monitoring/projects/"
    "{project_id}"
)
async def project_monitoring(
    project_id: str,
):

    return {
        "status": "success",
        "project_id": project_id,
        "data_mode": "demo",
        "monitoring": {
            "system_status": "healthy",
            "power_kw": 3.42,
            "energy_today_kwh": 18.6,
            "efficiency_percent": 91.4,
        },
    }


@app.get(
    "/api/monitoring/projects/"
    "{project_id}/history"
)
async def project_monitoring_history(
    project_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
):

    return {
        "status": "success",
        "project_id": project_id,
        "data_mode": "demo",
        "start_date": start_date,
        "end_date": end_date,
        "history": [],
    }


@app.get(
    "/api/monitoring/projects/"
    "{project_id}/alerts"
)
async def project_alerts(
    project_id: str,
):

    return {
        "status": "success",
        "project_id": project_id,
        "data_mode": "demo",
        "count": 0,
        "alerts": [],
    }


@app.get(
    "/api/monitoring/projects/"
    "{project_id}/report"
)
async def project_report(
    project_id: str,
):

    return {
        "status": "success",
        "project_id": project_id,
        "data_mode": "demo",
        "report": {
            "energy_generated_kwh": 18.6,
            "estimated_savings": 148.8,
            "efficiency_percent": 91.4,
        },
    }


@app.on_event(
    "startup"
)
async def startup_event():

    print(
        "SolarIQ+ Monitoring API started."
    )


    print(
        "Registered inverter providers:",
        inverter_registry.ids(),
    )


    for provider in (
        inverter_registry.all()
    ):

        print(
            f"Provider: "
            f"{provider.provider_name} "
            f"({provider.provider_id}) "
            f"mode="
            f"{get_provider_data_mode(provider)}"
        )


@app.on_event(
    "shutdown"
)
async def shutdown_event():

    if mongo_client is not None:

        mongo_client.close()


    print(
        "SolarIQ+ Monitoring API stopped."
    )


if __name__ == "__main__":

    import uvicorn


    uvicorn.run(
        "monitoring_server_new:app",
        host="127.0.0.1",
        port=8001,
        reload=False,
    )