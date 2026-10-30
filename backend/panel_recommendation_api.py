
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from panel_recommendation import recommend_panels


router = APIRouter(
    prefix="/panel-recommendations",
    tags=["Panel Recommendations"],
)


class PanelRecommendationRequest(BaseModel):
    budget: float = Field(default=250000, ge=0)
    panel_technology: Optional[str] = None
    property_type: Literal["residential", "commercial"] = "residential"
    roof_area_sqft: Optional[float] = Field(default=None, ge=0)
    required_kw: Optional[float] = Field(default=None, gt=0)
    priority: Literal[
        "balanced",
        "lowest_cost",
        "maximum_efficiency",
        "long_term_value",
    ] = "balanced"
    top_n: int = Field(default=3, ge=1, le=6)


@router.post("/recommend")
def get_panel_recommendations(
    request: PanelRecommendationRequest,
):
    try:
        recommendations = recommend_panels(
            budget=request.budget,
            panel_technology=request.panel_technology,
            property_type=request.property_type,
            roof_area_sqft=request.roof_area_sqft,
            required_kw=request.required_kw,
            priority=request.priority,
            top_n=request.top_n,
        )

        return {
            "success": True,
            "count": len(recommendations),
            "selected_technology": (
                request.panel_technology
                or (
                    recommendations[0]["technology"]
                    if recommendations
                    else None
                )
            ),
            "priority": request.priority,
            "recommendations": recommendations,
        }

    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid recommendation input: {exc}",
        ) from exc

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Panel recommendations could not be generated.",
        ) from exc
