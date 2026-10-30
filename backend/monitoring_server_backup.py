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

from enphase_connector import EnphaseConnector


# ============================================================
# SolarIQ+ - Existing System Monitoring API
# ============================================================

load_dotenv()

app = FastAPI(
    title="SolarIQ+ Existing System Monitoring API",
    version="1.3.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# DATABASE
# ============================================================

MONGO_URI = (
    os.getenv("MONGO_URI")
    or os.getenv("MONGODB_URI")
    or os.getenv("MONGO_URL")
    or "mongodb://127.0.0.1:27017"
)

MONGO_DB = (
    os.getenv("MONGO_DB")
    or os.getenv("MONGODB_DB")
    or os.getenv("DATABASE_NAME")
    or "solariq"
)

mongo_client = AsyncIOMotorClient(MONGO_URI)
db = mongo_client[MONGO_DB]

enphase = EnphaseConnector()


# ============================================================
# XGBOOST MODEL
# ============================================================

BASE_DIR = Path(__file__).resolve().parent

XGBOOST_MODEL_FILE = (
    BASE_DIR
    / "ml"
    / "models"
    / "solar_generation_xgboost.joblib"
)

XGBOOST_FEATURE_COLUMNS = [
    "GHI",
    "Temperature",
    "Relative Humidity",
    "Wind Speed",
    "Wind Direction",
    "Hour",
    "Day",
    "Month",
    "SZ Angle",
    "SA Angle",
]

XGBOOST_MODEL = None
XGBOOST_MODEL_LOAD_ERROR = None


def load_xgboost_model():
    """
    Load the trained SolarIQ+ XGBoost model once when the
    monitoring server starts.

    The model is loaded from the artifact created by
    backend/ml/train_xgboost.py.
    """
    global XGBOOST_MODEL
    global XGBOOST_MODEL_LOAD_ERROR

    try:
        if not XGBOOST_MODEL_FILE.exists():
            XGBOOST_MODEL = None
            XGBOOST_MODEL_LOAD_ERROR = (
                f"XGBoost model file not found: "
                f"{XGBOOST_MODEL_FILE}"
            )
            return

        XGBOOST_MODEL = joblib.load(
            XGBOOST_MODEL_FILE
        )

        XGBOOST_MODEL_LOAD_ERROR = None

    except Exception as exc:
        XGBOOST_MODEL = None
        XGBOOST_MODEL_LOAD_ERROR = (
            f"XGBoost model could not be loaded: {exc}"
        )


load_xgboost_model()


# ============================================================
# MODELS
# ============================================================

class GenerationReading(BaseModel):
    project_id: str = Field(min_length=1)
    reading_date: str = Field(
        min_length=10,
        max_length=10,
    )
    actual_generation_kwh: float = Field(ge=0)
    source: str = Field(
        default="manual",
        min_length=1,
        max_length=80,
    )
    provider: Optional[str] = Field(
        default=None,
        max_length=80,
    )
    data_mode: Optional[str] = Field(
        default=None,
        max_length=30,
    )
    demo: Optional[bool] = None


class EnphaseConnection(BaseModel):
    project_id: str = Field(min_length=1)
    system_id: str = Field(min_length=1)


class EnphaseDemoImport(BaseModel):
    project_id: str = Field(min_length=1)
    days: int = Field(
        default=30,
        ge=1,
        le=365,
    )
    system_capacity_kw: float = Field(
        default=2.5,
        gt=0,
        le=1000,
    )


class XGBoostPredictionRequest(BaseModel):
    """
    Feature payload matching the exact feature schema used
    when the SolarIQ+ XGBoost model was trained.

    This endpoint returns the raw model prediction.

    The prediction must not automatically be described as
    daily kWh because the training script only identifies
    the target as 'AC Output'.
    """

    project_id: str = Field(min_length=1)

    GHI: float = Field(ge=0)
    Temperature: float
    Relative_Humidity: float = Field(
        alias="Relative Humidity"
    )
    Wind_Speed: float = Field(
        ge=0,
        alias="Wind Speed",
    )
    Wind_Direction: float = Field(
        alias="Wind Direction"
    )
    Hour: int = Field(
        ge=0,
        le=23,
    )
    Day: int = Field(
        ge=1,
        le=31,
    )
    Month: int = Field(
        ge=1,
        le=12,
    )
    SZ_Angle: float = Field(
        alias="SZ Angle"
    )
    SA_Angle: float = Field(
        alias="SA Angle"
    )

    class Config:
        populate_by_name = True


# ============================================================
# HELPERS
# ============================================================

def serialize_document(
    document: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Convert Mongo datetime values into JSON-safe ISO strings.
    """
    result = dict(document)

    for key, value in result.items():
        if isinstance(value, datetime):
            result[key] = value.isoformat()

    return result


def extract_real_enphase_observations(
    payload: Any,
) -> list:
    """
    Extract possible observations from a real Enphase response.

    The exact response structure can vary by endpoint/version,
    so this helper checks common container names without
    pretending that an unrecognized response is valid
    generation data.
    """
    if isinstance(payload, list):
        return payload

    if not isinstance(payload, dict):
        return []

    for key in (
        "production",
        "readings",
        "intervals",
        "data",
        "items",
        "energy",
    ):
        candidate = payload.get(key)

        if isinstance(candidate, list):
            return candidate

    return []


def extract_observation_date(
    item: Dict[str, Any],
) -> Optional[str]:
    raw_date = (
        item.get("reading_date")
        or item.get("date")
        or item.get("timestamp")
        or item.get("time")
        or item.get("end_at")
    )

    if raw_date is None:
        return None

    try:
        if isinstance(raw_date, (int, float)):
            return datetime.fromtimestamp(
                raw_date,
                tz=timezone.utc,
            ).date().isoformat()

        value = str(raw_date)

        if "T" in value:
            return value[:10]

        if len(value) >= 10:
            return value[:10]

    except (
        TypeError,
        ValueError,
        OverflowError,
    ):
        return None

    return None


def extract_observation_energy(
    item: Dict[str, Any],
) -> Optional[float]:
    raw_energy = (
        item.get("actual_generation_kwh")
        or item.get("energy_kwh")
        or item.get("generation_kwh")
        or item.get("energy")
        or item.get("value")
    )

    if raw_energy is None:
        return None

    try:
        value = float(raw_energy)

        if value < 0:
            return None

        return value

    except (
        TypeError,
        ValueError,
    ):
        return None


async def save_generation_document(
    project_id: str,
    reading_date: str,
    actual_generation_kwh: float,
    source: str,
    provider: Optional[str] = None,
    data_mode: Optional[str] = None,
    demo: Optional[bool] = None,
) -> Dict[str, Any]:
    """
    Save one normalized project-linked generation reading.
    """
    readings = db["generation_readings"]
    now = datetime.now(timezone.utc)

    document: Dict[str, Any] = {
        "project_id": project_id,
        "reading_date": reading_date,
        "actual_generation_kwh": float(
            actual_generation_kwh
        ),
        "source": source,
        "updated_at": now,
    }

    if provider:
        document["provider"] = provider

    if data_mode:
        document["data_mode"] = data_mode

    if demo is not None:
        document["demo"] = demo

    await readings.update_one(
        {
            "project_id": project_id,
            "reading_date": reading_date,
        },
        {
            "$set": document,
            "$setOnInsert": {
                "created_at": now,
            },
        },
        upsert=True,
    )

    saved = await readings.find_one(
        {
            "project_id": project_id,
            "reading_date": reading_date,
        },
        {"_id": 0},
    )

    if saved is None:
        raise HTTPException(
            status_code=500,
            detail=(
                "Generation reading could not be saved."
            ),
        )

    return serialize_document(saved)


# ============================================================
# HEALTH
# ============================================================

@app.get("/api/monitoring")
async def monitoring_health():
    return {
        "service": (
            "SolarIQ+ Existing System Monitoring"
        ),
        "status": "available",
        "database": MONGO_DB,
        "features": [
            "generation readings",
            "project-linked monitoring",
            "actual generation history",
            "Enphase connector",
            "Enphase OAuth integration",
            "Enphase historical production import",
            "demo Enphase integration mode",
            "trained XGBoost model",
            "project-linked XGBoost prediction",
        ],
        "xgboost": {
            "model_available": (
                XGBOOST_MODEL is not None
            ),
            "model_file": str(
                XGBOOST_MODEL_FILE
            ),
            "target": "AC Output",
            "features": XGBOOST_FEATURE_COLUMNS,
            "error": XGBOOST_MODEL_LOAD_ERROR,
        },
    }


# ============================================================
# XGBOOST MODEL STATUS
# ============================================================

@app.get(
    "/api/monitoring/xgboost/status"
)
async def xgboost_status():
    """
    Return the current status of the trained XGBoost
    model loaded by the monitoring server.
    """
    return {
        "service": (
            "SolarIQ+ Project-linked XGBoost"
        ),
        "status": (
            "available"
            if XGBOOST_MODEL is not None
            else "unavailable"
        ),
        "model_available": (
            XGBOOST_MODEL is not None
        ),
        "model_file": str(
            XGBOOST_MODEL_FILE
        ),
        "target": "AC Output",
        "feature_count": len(
            XGBOOST_FEATURE_COLUMNS
        ),
        "features": XGBOOST_FEATURE_COLUMNS,
        "error": XGBOOST_MODEL_LOAD_ERROR,
        "data_source": (
            "trained SolarIQ+ XGBoost model"
        ),
        "project_linked": True,
        "note": (
            "The prediction endpoint returns the "
            "raw model target prediction. The "
            "training script identifies the target "
            "as AC Output but does not establish "
            "a daily-kWh conversion."
        ),
    }


# ============================================================
# PROJECT-LINKED XGBOOST PREDICTION
# ============================================================

@app.post(
    "/api/monitoring/xgboost/predict"
)
async def predict_with_xgboost(
    payload: XGBoostPredictionRequest,
):
    """
    Run the trained SolarIQ+ XGBoost model against a
    project-specific feature vector.

    This is deliberately separate from the reference
    xgboost_predictions.csv endpoint in ml/ml_api.py.

    No reference test-set prediction is returned here.
    """

    if XGBOOST_MODEL is None:
        raise HTTPException(
            status_code=503,
            detail=(
                "The trained XGBoost model is not "
                "available. "
                f"{XGBOOST_MODEL_LOAD_ERROR or ''}"
            ).strip(),
        )

    feature_values = {
        "GHI": payload.GHI,
        "Temperature": payload.Temperature,
        "Relative Humidity": (
            payload.Relative_Humidity
        ),
        "Wind Speed": payload.Wind_Speed,
        "Wind Direction": (
            payload.Wind_Direction
        ),
        "Hour": payload.Hour,
        "Day": payload.Day,
        "Month": payload.Month,
        "SZ Angle": payload.SZ_Angle,
        "SA Angle": payload.SA_Angle,
    }

    try:
        feature_frame = pd.DataFrame(
            [
                feature_values
            ],
            columns=XGBOOST_FEATURE_COLUMNS,
        )

        prediction = XGBOOST_MODEL.predict(
            feature_frame
        )

        if len(prediction) == 0:
            raise ValueError(
                "XGBoost returned no prediction."
            )

        predicted_value = float(
            prediction[0]
        )

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "XGBoost prediction failed: "
                f"{exc}"
            ),
        )

    return {
        "status": "prediction_generated",
        "project_id": payload.project_id,
        "model": "XGBoost",
        "target": "AC Output",
        "prediction": predicted_value,
        "unit": "model target unit",
        "data_source": (
            "project-specific feature payload"
        ),
        "project_linked": True,
        "reference_prediction": False,
        "features": feature_values,
        "note": (
            "The model was trained on AC Output. "
            "SolarIQ+ has not yet assumed that this "
            "raw target is equivalent to daily kWh."
        ),
    }


# ============================================================
# GENERATION MONITORING
# ============================================================

@app.post(
    "/api/monitoring/generation"
)
async def save_generation_reading(
    payload: GenerationReading,
):
    saved = await save_generation_document(
        project_id=payload.project_id,
        reading_date=payload.reading_date,
        actual_generation_kwh=(
            payload.actual_generation_kwh
        ),
        source=payload.source,
        provider=payload.provider,
        data_mode=payload.data_mode,
        demo=payload.demo,
    )

    return {
        "status": "saved",
        "project_id": payload.project_id,
        "reading": saved,
    }


@app.get(
    "/api/monitoring/generation/{project_id}"
)
async def get_generation_readings(
    project_id: str,
):
    readings = db["generation_readings"]

    cursor = readings.find(
        {
            "project_id": project_id,
        },
        {
            "_id": 0,
        },
    ).sort(
        "reading_date",
        1,
    )

    data = await cursor.to_list(
        length=1000,
    )

    return {
        "project_id": project_id,
        "count": len(data),
        "readings": [
            serialize_document(item)
            for item in data
        ],
    }


@app.get(
    "/api/monitoring/generation/{project_id}/latest"
)
async def get_latest_generation(
    project_id: str,
):
    reading = await db[
        "generation_readings"
    ].find_one(
        {
            "project_id": project_id,
        },
        {
            "_id": 0,
        },
        sort=[
            (
                "reading_date",
                -1,
            )
        ],
    )

    if reading is None:
        return {
            "project_id": project_id,
            "reading": None,
        }

    return {
        "project_id": project_id,
        "reading": serialize_document(
            reading
        ),
    }


# ============================================================
# ENPHASE HEALTH
# ============================================================

@app.get(
    "/api/monitoring/enphase"
)
async def enphase_health():
    return await enphase.health_check()


# ============================================================
# ENPHASE REAL SYSTEM DISCOVERY
# ============================================================

@app.get(
    "/api/monitoring/enphase/systems"
)
async def get_enphase_systems():
    if not enphase.authorized:
        raise HTTPException(
            status_code=401,
            detail=(
                "No authorized Enphase system is "
                "available. Complete Enphase owner "
                "authorization first."
            ),
        )

    try:
        data = await enphase.get_systems()

        return {
            "provider": "Enphase",
            "status": "connected",
            "data_mode": "real",
            "systems": data,
        }

    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "Enphase system discovery failed: "
                f"{exc}"
            ),
        )


@app.get(
    "/api/monitoring/enphase/systems/{system_id}"
)
async def get_enphase_system(
    system_id: str,
):
    if not enphase.authorized:
        raise HTTPException(
            status_code=401,
            detail=(
                "No authorized Enphase system is "
                "available."
            ),
        )

    try:
        data = await enphase.get_system(
            system_id
        )

        return {
            "provider": "Enphase",
            "system_id": system_id,
            "data_mode": "real",
            "system": data,
        }

    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "Enphase system request failed: "
                f"{exc}"
            ),
        )


@app.get(
    "/api/monitoring/enphase/systems/"
    "{system_id}/production"
)
async def get_enphase_production(
    system_id: str,
    start_at: Optional[int] = Query(
        default=None,
        description=(
            "Unix timestamp for history start."
        ),
    ),
    end_at: Optional[int] = Query(
        default=None,
        description=(
            "Unix timestamp for history end."
        ),
    ),
):
    if not enphase.authorized:
        raise HTTPException(
            status_code=401,
            detail=(
                "No authorized Enphase system is "
                "available."
            ),
        )

    if (
        start_at is None
        or end_at is None
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "start_at and end_at are required "
                "for production telemetry."
            ),
        )

    try:
        data = await enphase.get_production_meter(
            system_id=system_id,
            start_at=start_at,
            end_at=end_at,
        )

        return {
            "provider": "Enphase",
            "system_id": system_id,
            "data_mode": "real",
            "production": data,
        }

    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "Enphase production request failed: "
                f"{exc}"
            ),
        )


# ============================================================
# ENPHASE PROJECT CONNECTION
# ============================================================

@app.post(
    "/api/monitoring/enphase/connect"
)
async def connect_enphase(
    payload: EnphaseConnection,
):
    """
    Connect an authorized Enphase system to a
    SolarIQ+ project.

    Only the project-to-system relationship is stored.
    OAuth credentials remain server-side.
    """
    if not enphase.authorized:
        raise HTTPException(
            status_code=401,
            detail=(
                "Enphase authorization is required "
                "before connecting a real system."
            ),
        )

    try:
        system = await enphase.get_system(
            payload.system_id
        )

    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "SolarIQ+ could not verify the "
                f"Enphase system: {exc}"
            ),
        )

    now = datetime.now(timezone.utc)

    connection = {
        "project_id": payload.project_id,
        "provider": "Enphase",
        "system_id": payload.system_id,
        "status": "connected",
        "data_mode": "real",
        "connected_at": now,
        "updated_at": now,
        "system_snapshot": system,
    }

    await db[
        "inverter_connections"
    ].update_one(
        {
            "project_id": payload.project_id,
            "provider": "Enphase",
        },
        {
            "$set": connection,
        },
        upsert=True,
    )

    return {
        "status": "connected",
        "provider": "Enphase",
        "project_id": payload.project_id,
        "system_id": payload.system_id,
        "data_mode": "real",
    }


@app.get(
    "/api/monitoring/enphase/project/"
    "{project_id}"
)
async def get_project_enphase_connection(
    project_id: str,
):
    connection = await db[
        "inverter_connections"
    ].find_one(
        {
            "project_id": project_id,
            "provider": "Enphase",
        },
        {
            "_id": 0,
        },
    )

    if connection is None:
        return {
            "project_id": project_id,
            "connected": False,
            "provider": "Enphase",
        }

    return {
        "project_id": project_id,
        "connected": True,
        "connection": serialize_document(
            connection
        ),
    }


# ============================================================
# ENPHASE DEMO IMPORT
# ============================================================

@app.post(
    "/api/monitoring/enphase/demo/import"
)
async def import_enphase_demo(
    payload: EnphaseDemoImport,
):
    """
    Import clearly labelled demo Enphase integration data.

    This does NOT represent a real customer or inverter.

    It is intended for:
    - development
    - college review/demo
    - UI testing
    - AI pipeline testing
    """
    result = enphase.get_demo_import(
        days=payload.days,
        system_capacity_kw=(
            payload.system_capacity_kw
        ),
        project_id=payload.project_id,
    )

    imported = 0
    saved_readings = []

    for reading in result["readings"]:
        saved = await save_generation_document(
            project_id=payload.project_id,
            reading_date=reading[
                "reading_date"
            ],
            actual_generation_kwh=reading[
                "actual_generation_kwh"
            ],
            source=reading[
                "source"
            ],
            provider="Enphase",
            data_mode="demo",
            demo=True,
        )

        saved_readings.append(saved)
        imported += 1

    return {
        "status": "demo_import_completed",
        "provider": "Enphase",
        "project_id": payload.project_id,
        "data_mode": "demo",
        "demo": True,
        "days_imported": imported,
        "total_generation_kwh": round(
            sum(
                item[
                    "actual_generation_kwh"
                ]
                for item in saved_readings
            ),
            3,
        ),
        "message": (
            "Demo Enphase integration data "
            "stored as project-linked monitoring "
            "history. This is not real inverter/"
            "customer data."
        ),
        "readings": saved_readings,
    }


# ============================================================
# ENPHASE REAL HISTORY IMPORT
# ============================================================

@app.post(
    "/api/monitoring/enphase/project/"
    "{project_id}/import"
)
async def import_enphase_history(
    project_id: str,
    days: int = Query(
        default=30,
        ge=1,
        le=365,
    ),
):
    """
    Import real Enphase historical data for a project.

    A real Enphase OAuth authorization and connected
    system are required.

    The connector returns the raw Enphase lifetime
    response. We normalize observations where the
    response clearly contains a date and energy value.
    """
    connection = await db[
        "inverter_connections"
    ].find_one(
        {
            "project_id": project_id,
            "provider": "Enphase",
            "status": "connected",
            "data_mode": "real",
        },
        {
            "_id": 0,
        },
    )

    if connection is None:
        raise HTTPException(
            status_code=404,
            detail=(
                "No real Enphase system is connected "
                "to this project."
            ),
        )

    if not enphase.authorized:
        raise HTTPException(
            status_code=401,
            detail=(
                "Enphase authorization is required."
            ),
        )

    try:
        result = (
            await enphase.import_generation_history(
                system_id=connection[
                    "system_id"
                ],
                days=days,
                project_id=project_id,
            )
        )

    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "Enphase history import failed: "
                f"{exc}"
            ),
        )

    raw_response = result.get(
        "raw_response"
    )

    observations = (
        extract_real_enphase_observations(
            raw_response
        )
    )

    imported = 0
    skipped = 0
    saved_readings = []

    for item in observations:
        if not isinstance(item, dict):
            skipped += 1
            continue

        reading_date = (
            extract_observation_date(item)
        )

        energy = (
            extract_observation_energy(item)
        )

        if (
            reading_date is None
            or energy is None
        ):
            skipped += 1
            continue

        try:
            saved = await save_generation_document(
                project_id=project_id,
                reading_date=reading_date,
                actual_generation_kwh=energy,
                source="enphase_api",
                provider="Enphase",
                data_mode="real",
                demo=False,
            )

            saved_readings.append(saved)
            imported += 1

        except Exception:
            skipped += 1

    return {
        "status": "real_import_completed",
        "provider": "Enphase",
        "project_id": project_id,
        "system_id": connection[
            "system_id"
        ],
        "data_mode": "real",
        "demo": False,
        "requested_days": days,
        "observations_found": len(
            observations
        ),
        "imported_readings": imported,
        "skipped_observations": skipped,
        "message": (
            "Real Enphase data was requested. "
            "Only observations that could be "
            "unambiguously normalized were stored."
        ),
        "readings": saved_readings,
    }


# ============================================================
# SHUTDOWN
# ============================================================

@app.on_event("shutdown")
async def shutdown_db():
    mongo_client.close()


# ============================================================
# LOCAL START
# ============================================================

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "monitoring_server:app",
        host="127.0.0.1",
        port=8001,
        reload=True,
    )