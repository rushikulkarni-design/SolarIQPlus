from pathlib import Path
import csv
import math
from typing import Any

from fastapi import APIRouter, HTTPException


# ============================================================================
# SolarIQ+ Post-Installation ML API
# ============================================================================
#
# This module exposes the results already produced by the SolarIQ+ ML
# pipeline through FastAPI endpoints.
#
# The actual training/analysis scripts remain separate:
#
#   data_processing.py
#   prepare_dataset.py
#   train_xgboost.py
#   shap_analysis.py
#   performance_fingerprint.py
#   isolation_forest.py
#   decision_engine.py
#
# This file is responsible only for serving their saved results to the
# frontend.
#
# IMPORTANT:
# The current ML result files are based on the public/reference training
# dataset. They are NOT attached to an individual SolarIQ+ customer
# project yet.
# ============================================================================


ML_DIR = Path(__file__).resolve().parent

DATA_DIR = ML_DIR / "data"
MODELS_DIR = ML_DIR / "models"
RESULTS_DIR = ML_DIR / "results"


ml_router = APIRouter(
    prefix="/api/ml",
    tags=["Post-Installation ML"],
)


# ============================================================================
# File helpers
# ============================================================================

def _result_path(filename: str) -> Path:
    path = RESULTS_DIR / filename

    if not path.exists() or not path.is_file():
        raise HTTPException(
            status_code=404,
            detail=(
                f"ML result file '{filename}' is not available yet. "
                "Run the corresponding ML pipeline script first."
            ),
        )

    return path


def _read_csv(filename: str) -> list[dict[str, Any]]:
    path = _result_path(filename)

    try:
        with open(
            path,
            "r",
            encoding="utf-8-sig",
            newline="",
        ) as file:
            return list(csv.DictReader(file))
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Unable to read ML result file: {exc}",
        )


def _to_float(value):
    if value in (None, ""):
        return None

    try:
        number = float(value)

        if not math.isfinite(number):
            return None

        return number

    except (TypeError, ValueError):
        return None


def _to_int(value):
    number = _to_float(value)

    if number is None:
        return None

    return int(number)


def _clean_row(row: dict) -> dict:
    """
    Convert numeric-looking CSV values into JSON-friendly numbers.
    """

    cleaned = {}

    for key, value in row.items():

        if value is None:
            cleaned[key] = None
            continue

        text = str(value).strip()

        if text == "":
            cleaned[key] = None
            continue

        numeric = _to_float(text)

        if numeric is not None:
            if numeric.is_integer():
                cleaned[key] = int(numeric)
            else:
                cleaned[key] = numeric
        else:
            cleaned[key] = text

    return cleaned


def _safe_mean(values):
    values = [
        value
        for value in values
        if value is not None
    ]

    if not values:
        return None

    return sum(values) / len(values)


def _safe_min(values):
    values = [
        value
        for value in values
        if value is not None
    ]

    return min(values) if values else None


def _safe_max(values):
    values = [
        value
        for value in values
        if value is not None
    ]

    return max(values) if values else None


# ============================================================================
# ML overview
# ============================================================================

@ml_router.get("/")
async def ml_root():
    return {
        "service": "SolarIQ+ Post-Installation ML",
        "status": "available",
        "pipeline": [
            "XGBoost",
            "SHAP",
            "Performance Fingerprint",
            "Isolation Forest",
            "Decision Engine",
        ],
        "data_source": "Reference/training dataset",
        "project_linked_generation_data": False,
    }


# ============================================================================
# XGBoost model / forecast results
# ============================================================================

@ml_router.get("/forecast")
async def get_forecast_results():
    """
    Return the saved XGBoost predictions.

    Current data:
        backend/ml/results/xgboost_predictions.csv
    """

    rows = _read_csv(
        "xgboost_predictions.csv"
    )

    cleaned = [
        _clean_row(row)
        for row in rows
    ]

    actual_values = [
        _to_float(
            row.get("Actual AC Output")
            or row.get("actual")
            or row.get("Actual")
        )
        for row in cleaned
    ]

    predicted_values = [
        _to_float(
            row.get("Predicted AC Output")
            or row.get("predicted")
            or row.get("Predicted")
        )
        for row in cleaned
    ]

    return {
        "status": "ok",
        "records": len(cleaned),
        "data_source": "Reference/training dataset",
        "project_linked": False,
        "summary": {
            "mean_actual_ac_output": _safe_mean(
                actual_values
            ),
            "mean_predicted_ac_output": _safe_mean(
                predicted_values
            ),
            "min_predicted_ac_output": _safe_min(
                predicted_values
            ),
            "max_predicted_ac_output": _safe_max(
                predicted_values
            ),
        },
        "rows": cleaned,
    }


# ============================================================================
# XGBoost evaluation
# ============================================================================

@ml_router.get("/evaluation")
async def get_model_evaluation():
    """
    Return saved XGBoost evaluation metrics.
    """

    rows = _read_csv(
        "xgboost_evaluation.csv"
    )

    cleaned = [
        _clean_row(row)
        for row in rows
    ]

    return {
        "status": "ok",
        "model": "XGBRegressor",
        "data_source": "Reference/training dataset",
        "project_linked": False,
        "metrics": cleaned,
    }


# ============================================================================
# SHAP
# ============================================================================

@ml_router.get("/shap")
async def get_shap_results():
    """
    Return global SHAP feature importance.
    """

    rows = _read_csv(
        "shap_feature_importance.csv"
    )

    cleaned = [
        _clean_row(row)
        for row in rows
    ]

    # Sort by mean absolute SHAP value when the expected column exists.
    def shap_sort_key(row):
        for key in (
            "mean_abs_shap",
            "Mean Absolute SHAP",
            "mean_abs_shap_value",
            "importance",
        ):
            value = _to_float(
                row.get(key)
            )

            if value is not None:
                return value

        return 0.0

    cleaned.sort(
        key=shap_sort_key,
        reverse=True,
    )

    return {
        "status": "ok",
        "method": "SHAP",
        "data_source": "Reference/training dataset",
        "project_linked": False,
        "feature_count": len(cleaned),
        "features": cleaned,
    }


# ============================================================================
# Performance fingerprint
# ============================================================================

@ml_router.get("/performance")
async def get_performance_fingerprint():
    """
    Return the saved performance fingerprint analysis.
    """

    rows = _read_csv(
        "performance_fingerprint.csv"
    )

    cleaned = [
        _clean_row(row)
        for row in rows
    ]

    statuses = {}

    for row in cleaned:
        status = (
            row.get("Performance Status")
            or row.get("performance_status")
            or row.get("Status")
        )

        if status:
            statuses[status] = (
                statuses.get(status, 0) + 1
            )

    ratios = [
        _to_float(
            row.get("Performance Ratio")
            or row.get("performance_ratio")
        )
        for row in cleaned
    ]

    deviations = [
        _to_float(
            row.get("Relative Deviation")
            or row.get("relative_deviation")
            or row.get("Deviation")
        )
        for row in cleaned
    ]

    return {
        "status": "ok",
        "method": "Performance Fingerprint",
        "data_source": "Reference/training dataset",
        "project_linked": False,
        "records": len(cleaned),
        "summary": {
            "mean_performance_ratio": _safe_mean(
                ratios
            ),
            "mean_relative_deviation": _safe_mean(
                deviations
            ),
            "status_counts": statuses,
        },
        "rows": cleaned,
    }


# ============================================================================
# Isolation Forest
# ============================================================================

@ml_router.get("/anomalies")
async def get_anomalies():
    """
    Return Isolation Forest anomaly analysis.
    """

    rows = _read_csv(
        "isolation_forest_results.csv"
    )

    cleaned = [
        _clean_row(row)
        for row in rows
    ]

    counts = {
        "Normal": 0,
        "Anomaly": 0,
        "Low Generation": 0,
    }

    for row in cleaned:

        status = (
            row.get("Anomaly Status")
            or row.get("anomaly_status")
            or row.get("Status")
        )

        if status in counts:
            counts[status] += 1

    anomalies = []

    for row in cleaned:

        status = (
            row.get("Anomaly Status")
            or row.get("anomaly_status")
            or row.get("Status")
        )

        if status == "Anomaly":
            anomalies.append(row)

    return {
        "status": "ok",
        "method": "Isolation Forest",
        "data_source": "Reference/training dataset",
        "project_linked": False,
        "records": len(cleaned),
        "summary": {
            "normal": counts["Normal"],
            "anomaly": counts["Anomaly"],
            "low_generation": counts["Low Generation"],
        },
        "anomalies": anomalies,
        "rows": cleaned,
    }


# ============================================================================
# Decision Engine
# ============================================================================

@ml_router.get("/decisions")
async def get_decision_engine_results():
    """
    Return the saved Decision Engine results.
    """

    rows = _read_csv(
        "decision_engine_results.csv"
    )

    cleaned = [
        _clean_row(row)
        for row in rows
    ]

    status_counts = {}

    for row in cleaned:

        status = (
            row.get("Decision Status")
            or row.get("decision_status")
            or row.get("Status")
        )

        if status:
            status_counts[status] = (
                status_counts.get(status, 0) + 1
            )

    scores = [
        _to_float(
            row.get("Decision Score")
            or row.get("decision_score")
            or row.get("Score")
        )
        for row in cleaned
    ]

    attention_required = []

    for row in cleaned:

        status = (
            row.get("Decision Status")
            or row.get("decision_status")
            or row.get("Status")
        )

        if status == "Attention Required":
            attention_required.append(row)

    return {
        "status": "ok",
        "method": "SolarIQ+ Decision Engine",
        "data_source": "Reference/training dataset",
        "project_linked": False,
        "records": len(cleaned),
        "summary": {
            "average_decision_score": _safe_mean(
                scores
            ),
            "status_counts": status_counts,
        },
        "attention_required": attention_required,
        "rows": cleaned,
    }


# ============================================================================
# Combined dashboard summary
# ============================================================================

@ml_router.get("/summary")
async def get_ml_summary():
    """
    Provide one compact endpoint for the future dashboard.

    This avoids the frontend needing to make five separate API requests
    simply to display the ML overview.
    """

    evaluation = _read_csv(
        "xgboost_evaluation.csv"
    )

    shap_rows = _read_csv(
        "shap_feature_importance.csv"
    )

    performance_rows = _read_csv(
        "performance_fingerprint.csv"
    )

    anomaly_rows = _read_csv(
        "isolation_forest_results.csv"
    )

    decision_rows = _read_csv(
        "decision_engine_results.csv"
    )

    evaluation_clean = [
        _clean_row(row)
        for row in evaluation
    ]

    shap_clean = [
        _clean_row(row)
        for row in shap_rows
    ]

    performance_clean = [
        _clean_row(row)
        for row in performance_rows
    ]

    anomaly_clean = [
        _clean_row(row)
        for row in anomaly_rows
    ]

    decision_clean = [
        _clean_row(row)
        for row in decision_rows
    ]

    # -------------------------------------------------------
    # Performance status counts
    # -------------------------------------------------------

    performance_status_counts = {}

    for row in performance_clean:

        status = (
            row.get("Performance Status")
            or row.get("performance_status")
            or row.get("Status")
        )

        if status:
            performance_status_counts[status] = (
                performance_status_counts.get(status, 0)
                + 1
            )

    # -------------------------------------------------------
    # Anomaly counts
    # -------------------------------------------------------

    anomaly_counts = {
        "Normal": 0,
        "Anomaly": 0,
        "Low Generation": 0,
    }

    for row in anomaly_clean:

        status = (
            row.get("Anomaly Status")
            or row.get("anomaly_status")
            or row.get("Status")
        )

        if status in anomaly_counts:
            anomaly_counts[status] += 1

    # -------------------------------------------------------
    # Decision counts
    # -------------------------------------------------------

    decision_status_counts = {}

    for row in decision_clean:

        status = (
            row.get("Decision Status")
            or row.get("decision_status")
            or row.get("Status")
        )

        if status:
            decision_status_counts[status] = (
                decision_status_counts.get(status, 0)
                + 1
            )

    # -------------------------------------------------------
    # SHAP ranking
    # -------------------------------------------------------

    def shap_value(row):
        for key in (
            "mean_abs_shap",
            "Mean Absolute SHAP",
            "mean_abs_shap_value",
            "importance",
        ):
            value = _to_float(
                row.get(key)
            )

            if value is not None:
                return value

        return 0.0

    shap_clean.sort(
        key=shap_value,
        reverse=True,
    )

    return {
        "status": "ok",

        "data_source": (
            "Reference/training dataset"
        ),

        "project_linked": False,

        "forecast_model": {
            "name": "XGBRegressor",
            "evaluation": evaluation_clean,
        },

        "shap": {
            "method": "SHAP",
            "feature_count": len(
                shap_clean
            ),
            "top_features": shap_clean[:10],
        },

        "performance_fingerprint": {
            "records": len(
                performance_clean
            ),
            "status_counts": (
                performance_status_counts
            ),
        },

        "anomaly_detection": {
            "method": "Isolation Forest",
            "records": len(
                anomaly_clean
            ),
            "status_counts": anomaly_counts,
        },

        "decision_engine": {
            "records": len(
                decision_clean
            ),
            "status_counts": (
                decision_status_counts
            ),
        },

        "pipeline": [
            "XGBoost Forecast",
            "SHAP Explainability",
            "Performance Fingerprint",
            "Isolation Forest",
            "Decision Engine",
        ],
    }


# ============================================================================
# Maintenance guidance
# ============================================================================

@ml_router.get("/maintenance")
async def get_maintenance_guidance():
    """
    Convert Decision Engine results into dashboard-friendly maintenance
    guidance.

    This is guidance, not a physical-fault diagnosis.
    """

    rows = _read_csv(
        "decision_engine_results.csv"
    )

    cleaned = [
        _clean_row(row)
        for row in rows
    ]

    attention_count = 0
    watch_count = 0
    low_generation_count = 0
    normal_count = 0

    for row in cleaned:

        status = (
            row.get("Decision Status")
            or row.get("decision_status")
            or row.get("Status")
        )

        if status == "Attention Required":
            attention_count += 1

        elif status == "Watch":
            watch_count += 1

        elif status == "Low Generation":
            low_generation_count += 1

        elif status == "Normal":
            normal_count += 1

    guidance = []

    if attention_count > 0:
        guidance.append(
            {
                "priority": "High",
                "title": "Review attention-required periods",
                "message": (
                    f"{attention_count} periods were flagged by the "
                    "Decision Engine for closer review. Check the "
                    "corresponding generation, weather and operational "
                    "records before taking maintenance action."
                ),
            }
        )

    if watch_count > 0:
        guidance.append(
            {
                "priority": "Medium",
                "title": "Monitor below-expected generation",
                "message": (
                    f"{watch_count} periods were classified as Watch. "
                    "Review whether the deviation persists across "
                    "multiple observations."
                ),
            }
        )

    if low_generation_count > 0:
        guidance.append(
            {
                "priority": "Info",
                "title": "Low-generation periods detected",
                "message": (
                    f"{low_generation_count} records were classified as "
                    "low generation. These periods are not automatically "
                    "treated as faults."
                ),
            }
        )

    if normal_count > 0:
        guidance.append(
            {
                "priority": "Normal",
                "title": "Normal operating periods",
                "message": (
                    f"{normal_count} records were classified as normal "
                    "by the current Decision Engine."
                ),
            }
        )

    guidance.append(
        {
            "priority": "Important",
            "title": "Maintenance interpretation",
            "message": (
                "SolarIQ+ uses statistical anomaly and deviation signals "
                "as decision support. A single anomalous observation does "
                "not prove a physical equipment fault. Persistent deviations "
                "should be checked against weather, generation and site "
                "conditions."
            ),
        }
    )

    return {
        "status": "ok",
        "data_source": "Reference/training dataset",
        "project_linked": False,
        "summary": {
            "attention_required": attention_count,
            "watch": watch_count,
            "low_generation": low_generation_count,
            "normal": normal_count,
        },
        "guidance": guidance,
    }