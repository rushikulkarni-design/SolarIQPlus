"""
SolarIQ+ Shadow Analysis Server

Dedicated shadow-analysis module for SolarIQ+.

This file is intentionally separate from the main SolarIQ+ server
so existing planner, financial, and PDF report-generation logic
remains untouched.

The main server can import this router using:

    from shadow_server import router as shadow_router
    app.include_router(shadow_router)

Shadow analysis uses:
- rooftop/project location
- panel orientation
- panel tilt
- user-confirmed obstruction information
- pvlib solar position
- geometric seasonal shadow analysis

IMPORTANT:
The system never invents obstruction heights.
Heights must be supplied or confirmed by the user.
"""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from shadow_analysis import (
    Obstruction,
    analyze_neighborhood,
)


# ============================================================
# ROUTER
# ============================================================

router = APIRouter(
    prefix="/api/shadow",
    tags=["Shadow Analysis"],
)


# ============================================================
# REQUEST MODELS
# ============================================================

class ShadowObstructionRequest(BaseModel):
    """
    A nearby object that may cast a shadow on the proposed
    solar-panel area.
    """

    name: str = Field(
        ...,
        min_length=1,
        max_length=100,
    )

    obstruction_type: str = Field(
        default="building",
        min_length=1,
        max_length=50,
    )

    bearing_deg: float = Field(
        ...,
        ge=0,
        lt=360,
        description="Direction of obstruction from rooftop in degrees.",
    )

    distance_m: float = Field(
        ...,
        gt=0,
        le=1000,
        description="Distance from rooftop/panel area in metres.",
    )

    height_m: float = Field(
        ...,
        gt=0,
        le=500,
        description="Confirmed or user-entered obstruction height.",
    )


class ShadowAnalysisRequest(BaseModel):
    """
    Complete shadow-analysis request.
    """

    latitude: float = Field(
        ...,
        ge=-90,
        le=90,
    )

    longitude: float = Field(
        ...,
        ge=-180,
        le=180,
    )

    timezone: str = Field(
        default="Asia/Kolkata",
        min_length=1,
        max_length=100,
    )

    panel_azimuth_deg: float = Field(
        default=180.0,
        ge=0,
        lt=360,
        description="Solar-panel facing direction.",
    )

    panel_tilt_deg: float = Field(
        default=20.0,
        ge=0,
        le=90,
        description="Solar-panel tilt angle.",
    )

    obstructions: List[ShadowObstructionRequest] = Field(
        default_factory=list,
        max_length=50,
    )

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value: str) -> str:
        value = value.strip()

        if not value:
            raise ValueError("Timezone cannot be empty.")

        return value


# ============================================================
# INTERNAL HELPERS
# ============================================================

def _build_obstructions(
    items: List[ShadowObstructionRequest],
) -> List[Obstruction]:
    """
    Convert API request objects into the shadow-analysis engine's
    obstruction objects.
    """

    return [
        Obstruction(
            name=item.name.strip(),
            obstruction_type=item.obstruction_type.strip(),
            bearing_deg=item.bearing_deg,
            distance_m=item.distance_m,
            height_m=item.height_m,
        )
        for item in items
    ]


# ============================================================
# HEALTH
# ============================================================

@router.get("/health")
def shadow_health():
    """
    Health check for the Shadow Analysis module.
    """

    return {
        "service": "SolarIQ+ Shadow Analysis",
        "status": "available",
        "engine": "geometric seasonal shadow analysis",
        "height_policy": (
            "Obstruction heights must be supplied or confirmed "
            "by the user. Unknown heights are never invented."
        ),
    }


# ============================================================
# MAIN SHADOW ANALYSIS
# ============================================================

@router.post("/analyze")
def analyze_shadow(request: ShadowAnalysisRequest):
    """
    Run SolarIQ+ shadow analysis.

    The frontend supplies:
    - location
    - panel orientation
    - panel tilt
    - nearby objects
    - object direction
    - object distance
    - confirmed object height

    The geometric engine then evaluates representative seasonal
    sun positions and returns shadow exposure/risk information.
    """

    try:
        obstructions = _build_obstructions(
            request.obstructions
        )

        result = analyze_neighborhood(
            latitude=request.latitude,
            longitude=request.longitude,
            timezone=request.timezone,
            obstructions=obstructions,
        )

        # ----------------------------------------------------
        # Panel configuration
        # ----------------------------------------------------

        result["panel_configuration"] = {
            "azimuth_deg": request.panel_azimuth_deg,
            "tilt_deg": request.panel_tilt_deg,
        }

        # ----------------------------------------------------
        # Analysis scope
        # ----------------------------------------------------

        result["analysis_scope"] = {
            "obstruction_count": len(
                request.obstructions
            ),
            "seasonal_samples": 4,
            "sample_interval_minutes": 10,
            "time_range": "06:00–18:00 local time",
        }

        # ----------------------------------------------------
        # Data quality
        # ----------------------------------------------------

        result["data_quality"] = {
            "obstruction_heights": "user-confirmed",
            "map_geometry": "user/map supplied",
            "generation_loss_percentage": "not calculated",
        }

        # ----------------------------------------------------
        # Method information
        # ----------------------------------------------------

        result["method"] = {
            "type": "geometric shadow analysis",
            "solar_position": "pvlib",
            "seasonal_reference_dates": [
                "March 21",
                "June 21",
                "September 22",
                "December 21",
            ],
            "shadow_rule": (
                "Shadow risk is detected when the sun is above "
                "the horizon, its direction is near the "
                "obstruction bearing, and solar elevation is "
                "below the obstruction angular height."
            ),
        }

        # ----------------------------------------------------
        # Important limitation
        # ----------------------------------------------------

        result["limitations"] = [
            (
                "The analysis estimates geometric shadow exposure "
                "using representative seasonal dates."
            ),
            (
                "It does not calculate an exact annual percentage "
                "of solar-generation loss."
            ),
            (
                "Obstruction heights must be supplied or confirmed "
                "by the user."
            ),
        ]

        return result

    except Exception as error:
        raise HTTPException(
            status_code=400,
            detail=(
                "Shadow analysis could not be completed: "
                f"{type(error).__name__}: {error}"
            ),
        )


# ============================================================
# DEMO ENDPOINT
# ============================================================

@router.get("/demo")
def demo_shadow_analysis():
    """
    Demonstration endpoint for testing the Shadow Analysis UI.

    The values below are demonstration values only and must
    never be presented as customer measurements.
    """

    demo_request = ShadowAnalysisRequest(
        latitude=19.876,
        longitude=75.343,
        timezone="Asia/Kolkata",
        panel_azimuth_deg=180,
        panel_tilt_deg=20,
        obstructions=[
            ShadowObstructionRequest(
                name="House A",
                obstruction_type="building",
                bearing_deg=180,
                distance_m=8,
                height_m=6,
            ),
            ShadowObstructionRequest(
                name="House C",
                obstruction_type="building",
                bearing_deg=160,
                distance_m=10,
                height_m=5,
            ),
            ShadowObstructionRequest(
                name="Large Tree",
                obstruction_type="tree",
                bearing_deg=120,
                distance_m=12,
                height_m=7,
            ),
        ],
    )

    result = analyze_shadow(demo_request)

    result["demo"] = True

    result["data_quality"]["note"] = (
        "Demonstration obstruction values. "
        "They are not customer measurements."
    )

    return result


# ============================================================
# SIMPLE ROUTER STATUS
# ============================================================

@router.get("/")
def shadow_root():
    """
    Basic information endpoint.
    """

    return {
        "service": "SolarIQ+ Shadow Analysis",
        "status": "ready",
        "endpoints": {
            "health": "/api/shadow/health",
            "analyze": "/api/shadow/analyze",
            "demo": "/api/shadow/demo",
        },
    }