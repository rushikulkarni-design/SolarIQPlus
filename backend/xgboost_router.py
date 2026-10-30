"""
SolarIQ+ XGBoost inference router.

Mount this router inside the existing main FastAPI application's api_router:
    from xgboost_router import router as xgboost_router
    api_router.include_router(xgboost_router)

This module does not create a FastAPI app and does not start another server.
"""
from pathlib import Path
from typing import Optional

import joblib
import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/monitoring/xgboost", tags=["XGBoost"])

BASE_DIR = Path(__file__).resolve().parent
XGBOOST_MODEL_FILE = (
    BASE_DIR / "ml" / "models" / "solar_generation_xgboost.joblib"
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
XGBOOST_MODEL_LOAD_ERROR: Optional[str] = None


def load_xgboost_model() -> None:
    """Load the model once when the main application imports this router."""
    global XGBOOST_MODEL, XGBOOST_MODEL_LOAD_ERROR
    try:
        if not XGBOOST_MODEL_FILE.is_file():
            XGBOOST_MODEL = None
            XGBOOST_MODEL_LOAD_ERROR = (
                f"Model file not found: {XGBOOST_MODEL_FILE}"
            )
            return
        XGBOOST_MODEL = joblib.load(XGBOOST_MODEL_FILE)
        XGBOOST_MODEL_LOAD_ERROR = None
    except Exception as exc:
        XGBOOST_MODEL = None
        XGBOOST_MODEL_LOAD_ERROR = str(exc)


load_xgboost_model()


class XGBoostPredictionRequest(BaseModel):
    """Weather/time features matching the training feature schema."""

    project_id: str = Field(min_length=1)
    GHI: float = Field(ge=0)
    Temperature: float
    Relative_Humidity: float = Field(alias="Relative Humidity")
    Wind_Speed: float = Field(ge=0, alias="Wind Speed")
    Wind_Direction: float = Field(alias="Wind Direction")
    Hour: int = Field(ge=0, le=23)
    Day: int = Field(ge=1, le=31)
    Month: int = Field(ge=1, le=12)
    SZ_Angle: float = Field(alias="SZ Angle")
    SA_Angle: float = Field(alias="SA Angle")


@router.get("/status")
async def xgboost_status():
    """Report whether the trained XGBoost artifact loaded successfully."""
    return {
        "service": "SolarIQ+ XGBoost",
        "status": "available" if XGBOOST_MODEL is not None else "unavailable",
        "model_available": XGBOOST_MODEL is not None,
        "model_file": str(XGBOOST_MODEL_FILE),
        "target": "AC Output",
        "feature_count": len(XGBOOST_FEATURE_COLUMNS),
        "features": XGBOOST_FEATURE_COLUMNS,
        "error": XGBOOST_MODEL_LOAD_ERROR,
        "project_linked": True,
        "note": (
            "The model returns the raw AC Output target. Its physical unit "
            "must be verified before treating it as kW or kWh."
        ),
    }


@router.post("/predict")
async def predict_with_xgboost(payload: XGBoostPredictionRequest):
    """Run a fresh inference using the supplied project's feature values."""
    if XGBOOST_MODEL is None:
        raise HTTPException(
            status_code=503,
            detail=(
                "Trained XGBoost model is unavailable. "
                f"{XGBOOST_MODEL_LOAD_ERROR or ''}"
            ).strip(),
        )

    feature_values = {
        "GHI": payload.GHI,
        "Temperature": payload.Temperature,
        "Relative Humidity": payload.Relative_Humidity,
        "Wind Speed": payload.Wind_Speed,
        "Wind Direction": payload.Wind_Direction,
        "Hour": payload.Hour,
        "Day": payload.Day,
        "Month": payload.Month,
        "SZ Angle": payload.SZ_Angle,
        "SA Angle": payload.SA_Angle,
    }

    try:
        feature_frame = pd.DataFrame(
            [feature_values],
            columns=XGBOOST_FEATURE_COLUMNS,
        )
        prediction = XGBOOST_MODEL.predict(feature_frame)
        if len(prediction) == 0:
            raise ValueError("XGBoost returned no prediction.")
        predicted_value = float(prediction[0])
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"XGBoost prediction failed: {exc}",
        ) from exc

    return {
        "status": "prediction_generated",
        "project_id": payload.project_id,
        "model": "XGBoost",
        "target": "AC Output",
        "prediction": predicted_value,
        "unit": "model target unit (verify dataset documentation)",
        "data_source": "project-specific feature payload",
        "project_linked": True,
        "reference_prediction": False,
        "features": feature_values,
        "note": (
            "This is a fresh model inference, not a saved test-set prediction. "
            "Do not label it daily kWh until the AC Output unit and sampling "
            "interval are confirmed."
        ),
    }

# ============================================================================
# SolarIQ+ PVGIS Simulator Generation Endpoint
# Keeps the existing AC Output endpoints unchanged.
# ============================================================================

from pydantic import BaseModel, Field
import numpy as np

PVGIS_MODEL_FILE = (
    BASE_DIR / "ml" / "models" / "solariq_pvgis_xgboost_hourly.joblib"
)
PVGIS_DATA_FILE = (
    BASE_DIR / "ml" / "data" / "pvgis_india_6_locations_2014_2020.csv"
)

PVGIS_MODEL = None
PVGIS_FEATURES = None
PVGIS_LOAD_ERROR = None


def load_pvgis_model():
    global PVGIS_MODEL, PVGIS_FEATURES, PVGIS_LOAD_ERROR

    try:
        if not PVGIS_MODEL_FILE.is_file():
            raise FileNotFoundError(str(PVGIS_MODEL_FILE))

        artifact = joblib.load(PVGIS_MODEL_FILE)

        # The training package saves a dictionary containing
        # the estimator and its exact feature list.
        if isinstance(artifact, dict):
            PVGIS_MODEL = artifact["model"]
            PVGIS_FEATURES = artifact["features"]
        else:
            PVGIS_MODEL = artifact
            PVGIS_FEATURES = [
                "latitude", "longitude", "hour", "day", "month",
                "irradiance", "temperature", "wind_speed", "sun_height",
            ]

        PVGIS_LOAD_ERROR = None

    except Exception as exc:
        PVGIS_MODEL = None
        PVGIS_FEATURES = None
        PVGIS_LOAD_ERROR = str(exc)


load_pvgis_model()


class SolarSimulatorGenerationRequest(BaseModel):
    project_id: str = Field(min_length=1)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    system_capacity_kw: float = Field(gt=0, le=10000)
    engineering_generation_kwh: float = Field(ge=0)


@router.get("/simulator-status")
async def pvgis_simulator_status():
    return {
        "status": "available" if PVGIS_MODEL is not None else "unavailable",
        "model_available": PVGIS_MODEL is not None,
        "model_file": str(PVGIS_MODEL_FILE),
        "dataset_file": str(PVGIS_DATA_FILE),
        "features": PVGIS_FEATURES,
        "error": PVGIS_LOAD_ERROR,
    }


@router.post("/simulator-generation")
async def pvgis_simulator_generation(
    payload: SolarSimulatorGenerationRequest,
):
    if PVGIS_MODEL is None:
        raise HTTPException(
            status_code=503,
            detail=f"PVGIS model unavailable: {PVGIS_LOAD_ERROR}",
        )

    if not PVGIS_DATA_FILE.is_file():
        raise HTTPException(
            status_code=503,
            detail=f"PVGIS dataset not found: {PVGIS_DATA_FILE}",
        )

    try:
        data = pd.read_csv(PVGIS_DATA_FILE)

        required = set(PVGIS_FEATURES + ["latitude", "longitude"])
        missing = required.difference(data.columns)

        if missing:
            raise ValueError(
                f"Dataset missing required columns: {sorted(missing)}"
            )

        # Use the closest location represented in the training dataset.
        locations = data[["latitude", "longitude"]].drop_duplicates()
        distances = (
            (locations["latitude"] - payload.latitude) ** 2
            + (
                (locations["longitude"] - payload.longitude)
                * np.cos(np.radians(payload.latitude))
            ) ** 2
        )
        nearest = locations.loc[distances.idxmin()]

        profile = data[
            (data["latitude"] == nearest["latitude"])
            & (data["longitude"] == nearest["longitude"])
        ].copy()

        if profile.empty:
            raise ValueError("No hourly profile found for nearest location.")

        # Predict hourly power for the historical profile.
        hourly_predictions = np.maximum(
            PVGIS_MODEL.predict(profile[PVGIS_FEATURES]),
            0,
        )

        # Approximate average annual kWh for a 1 kWp system.
        # The profile covers multiple historical years.
        ml_kwh_per_kwp_year = (
            float(np.mean(hourly_predictions)) * 8760 / 1000
        )

        ml_annual_kwh = (
            ml_kwh_per_kwp_year * payload.system_capacity_kw
        )

        engineering_kwh = payload.engineering_generation_kwh

        # Required 70% ML + 30% engineering blend.
        final_annual_kwh = (
            0.70 * ml_annual_kwh
            + 0.30 * engineering_kwh
        )

        return {
            "status": "success",
            "project_id": payload.project_id,
            "ml_annual_generation_kwh": round(ml_annual_kwh, 2),
            "engineering_annual_generation_kwh": round(
                engineering_kwh, 2
            ),
            "final_annual_generation_kwh": round(
                final_annual_kwh, 2
            ),
            "ml_weight": 0.70,
            "engineering_weight": 0.30,
            "profile_location": {
                "latitude": float(nearest["latitude"]),
                "longitude": float(nearest["longitude"]),
            },
            "requested_location": {
                "latitude": payload.latitude,
                "longitude": payload.longitude,
            },
            "note": (
                "ML estimate uses the nearest available historical PVGIS "
                "profile. It is an approximate estimate, not a location-"
                "specific weather forecast. Validate before production use."
            ),
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"PVGIS simulator prediction failed: {exc}",
        ) from exc
