"""
SolarIQ+ — Standalone Annual Shadow Analysis Engine

This module estimates potential solar-panel shading from nearby
buildings, trees, poles, tanks, or other obstructions.

IMPORTANT:
    This is a geometric shadow-exposure model.

    It does NOT calculate an exact percentage of annual energy loss.
    Exact generation loss requires a validated PV/shading/electrical model.

Core calculation:

    obstruction height + horizontal distance
                    ↓
            angular obstruction height
                    ↓
       compare with Sun elevation
                    +
       compare Sun azimuth with obstruction bearing
                    ↓
          potential shadow exposure

The engine evaluates representative dates through the year so that
a building that is harmless on one day is not incorrectly classified
as harmless for the entire year.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import List

import pandas as pd
import pvlib


# ============================================================================
# DATA MODEL
# ============================================================================

@dataclass
class Obstruction:
    """
    Nearby object that may cast a shadow.

    bearing_deg:
        Direction FROM the proposed solar area TO the obstruction.

        0   = North
        90  = East
        180 = South
        270 = West

    distance_m:
        Horizontal distance from proposed solar area/reference point.

    height_m:
        Height of obstruction above the reference solar/panel plane.
    """

    name: str
    obstruction_type: str
    bearing_deg: float
    distance_m: float
    height_m: float


# ============================================================================
# BASIC ANGLE FUNCTIONS
# ============================================================================

def normalize_angle(angle: float) -> float:
    """Normalize an angle to 0–360 degrees."""
    return angle % 360.0


def angular_difference(a: float, b: float) -> float:
    """
    Smallest absolute difference between two compass bearings.

    Examples:
        angular_difference(350, 10) -> 20
        angular_difference(90, 270) -> 180
    """

    difference = abs(
        normalize_angle(a) - normalize_angle(b)
    )

    return min(
        difference,
        360.0 - difference,
    )


def angular_height_deg(
    height_m: float,
    distance_m: float,
) -> float:
    """
    Apparent angular height of an obstruction.

        angle = atan(height / distance)
    """

    if distance_m <= 0:
        raise ValueError(
            "distance_m must be greater than 0."
        )

    if height_m < 0:
        raise ValueError(
            "height_m cannot be negative."
        )

    return math.degrees(
        math.atan2(
            height_m,
            distance_m,
        )
    )


# ============================================================================
# SOLAR POSITION
# ============================================================================

def get_solar_position(
    latitude: float,
    longitude: float,
    timezone: str,
    timestamp: datetime,
) -> tuple[float, float]:
    """
    Return:

        sun_azimuth_deg
        sun_elevation_deg
    """

    location = pvlib.location.Location(
        latitude=latitude,
        longitude=longitude,
        tz=timezone,
    )

    times = pd.DatetimeIndex(
        [timestamp]
    )

    if times.tz is None:
        times = times.tz_localize(
            timezone
        )

    solar_position = location.get_solarposition(
        times
    )

    azimuth = float(
        solar_position["azimuth"].iloc[0]
    )

    elevation = float(
        solar_position["elevation"].iloc[0]
    )

    return azimuth, elevation


# ============================================================================
# TIME WINDOWS
# ============================================================================

def group_time_windows(
    timestamps: List[datetime],
    sample_minutes: int,
) -> List[dict]:
    """
    Convert individual sampled timestamps into continuous shadow windows.
    """

    if not timestamps:
        return []

    windows = []

    window_start = timestamps[0]
    previous = timestamps[0]

    for current in timestamps[1:]:

        gap_minutes = (
            current - previous
        ).total_seconds() / 60.0

        if gap_minutes > sample_minutes * 1.5:

            duration_hours = (
                (
                    previous
                    - window_start
                ).total_seconds()
                / 3600.0
            ) + (
                sample_minutes / 60.0
            )

            windows.append(
                {
                    "start": window_start.strftime(
                        "%H:%M"
                    ),
                    "end": (
                        previous
                        + timedelta(
                            minutes=sample_minutes
                        )
                    ).strftime("%H:%M"),
                    "duration_hours": round(
                        duration_hours,
                        2,
                    ),
                }
            )

            window_start = current

        previous = current

    duration_hours = (
        (
            previous
            - window_start
        ).total_seconds()
        / 3600.0
    ) + (
        sample_minutes / 60.0
    )

    windows.append(
        {
            "start": window_start.strftime(
                "%H:%M"
            ),
            "end": (
                previous
                + timedelta(
                    minutes=sample_minutes
                )
            ).strftime("%H:%M"),
            "duration_hours": round(
                duration_hours,
                2,
            ),
        }
    )

    return windows


# ============================================================================
# SEASONAL ANALYSIS
# ============================================================================

SEASONAL_DATES = [
    (
        "March Equinox",
        (3, 21),
    ),
    (
        "June Solstice",
        (6, 21),
    ),
    (
        "September Equinox",
        (9, 22),
    ),
    (
        "December Solstice",
        (12, 21),
    ),
]


def analyze_obstruction_on_date(
    obstruction: Obstruction,
    latitude: float,
    longitude: float,
    timezone: str,
    date_value,
    direction_tolerance_deg: float = 25.0,
    sample_minutes: int = 10,
) -> dict:
    """
    Analyze one obstruction for one representative date.

    A potential shadow is recorded when:

        1. Sun is above horizon.
        2. Sun azimuth is close to the obstruction bearing.
        3. Sun elevation is below the obstruction angular height.

    The 25-degree directional tolerance is intentionally explicit
    and can later be calibrated using more detailed geometry.
    """

    angular_height = angular_height_deg(
        obstruction.height_m,
        obstruction.distance_m,
    )

    shadow_timestamps = []

    # Analyze from 06:00 through 18:00 local time.
    current = datetime(
        date_value.year,
        date_value.month,
        date_value.day,
        6,
        0,
    )

    end_time = datetime(
        date_value.year,
        date_value.month,
        date_value.day,
        18,
        0,
    )

    while current <= end_time:

        sun_azimuth, sun_elevation = (
            get_solar_position(
                latitude=latitude,
                longitude=longitude,
                timezone=timezone,
                timestamp=current,
            )
        )

        sun_direction_difference = (
            angular_difference(
                sun_azimuth,
                obstruction.bearing_deg,
            )
        )

        direction_match = (
            sun_direction_difference
            <= direction_tolerance_deg
        )

        elevation_match = (
            sun_elevation > 0
            and sun_elevation <= angular_height
        )

        if (
            direction_match
            and elevation_match
        ):
            shadow_timestamps.append(
                current
            )

        current += timedelta(
            minutes=sample_minutes
        )

    exposure_hours = (
        len(shadow_timestamps)
        * sample_minutes
        / 60.0
    )

    windows = group_time_windows(
        shadow_timestamps,
        sample_minutes,
    )

    return {
        "date": date_value.isoformat(),
        "angular_height_deg": round(
            angular_height,
            2,
        ),
        "shadow_windows": windows,
        "potential_exposure_hours": round(
            exposure_hours,
            2,
        ),
    }


# ============================================================================
# ANNUAL OBSTRUCTION ANALYSIS
# ============================================================================

def analyze_obstruction_annually(
    obstruction: Obstruction,
    latitude: float,
    longitude: float,
    timezone: str,
    direction_tolerance_deg: float = 25.0,
    sample_minutes: int = 10,
) -> dict:
    """
    Analyze one obstruction across four representative seasonal dates.
    """

    seasonal_results = []

    total_exposure = 0.0
    seasons_with_shadow = 0

    for season_name, (month, day) in SEASONAL_DATES:

        # Use a fixed year because pvlib only needs the solar geometry
        # for the representative calendar date.
        date_value = datetime(
            2026,
            month,
            day,
        ).date()

        result = analyze_obstruction_on_date(
            obstruction=obstruction,
            latitude=latitude,
            longitude=longitude,
            timezone=timezone,
            date_value=date_value,
            direction_tolerance_deg=(
                direction_tolerance_deg
            ),
            sample_minutes=sample_minutes,
        )

        exposure = result[
            "potential_exposure_hours"
        ]

        if exposure > 0:
            seasons_with_shadow += 1

        total_exposure += exposure

        seasonal_results.append(
            {
                "season": season_name,
                **result,
            }
        )

    # ------------------------------------------------------------------------
    # Directional relevance is informational, not the shadow test itself.
    # ------------------------------------------------------------------------

    panel_azimuth_deg = 180.0

    panel_direction_difference = (
        angular_difference(
            panel_azimuth_deg,
            obstruction.bearing_deg,
        )
    )

    panel_direction_relevance = (
        panel_direction_difference <= 45.0
    )

    # ------------------------------------------------------------------------
    # Risk classification
    #
    # The four seasonal dates represent snapshots, not the complete year.
    # Therefore the wording remains "geometric shadow risk".
    # ------------------------------------------------------------------------

    if total_exposure == 0:
        risk = "LOW"

    elif (
        total_exposure <= 2.0
        and seasons_with_shadow <= 1
    ):
        risk = "LOW"

    elif (
        total_exposure <= 5.0
        and seasons_with_shadow <= 2
    ):
        risk = "MODERATE"

    else:
        risk = "HIGH"

    return {
        "name": obstruction.name,
        "type": obstruction.obstruction_type,
        "bearing_deg": round(
            obstruction.bearing_deg,
            2,
        ),
        "distance_m": round(
            obstruction.distance_m,
            2,
        ),
        "height_m": round(
            obstruction.height_m,
            2,
        ),
        "angular_height_deg": round(
            angular_height_deg(
                obstruction.height_m,
                obstruction.distance_m,
            ),
            2,
        ),
        "panel_azimuth_deg": panel_azimuth_deg,
        "panel_direction_difference_deg": round(
            panel_direction_difference,
            2,
        ),
        "near_panel_direction": (
            panel_direction_relevance
        ),
        "seasons_with_potential_shadow": (
            seasons_with_shadow
        ),
        "seasonal_exposure_hours": round(
            total_exposure,
            2,
        ),
        "risk": risk,
        "seasonal_analysis": seasonal_results,
    }


# ============================================================================
# COMPLETE NEIGHBORHOOD ANALYSIS
# ============================================================================

def analyze_neighborhood(
    latitude: float,
    longitude: float,
    timezone: str,
    obstructions: List[Obstruction],
) -> dict:
    """
    Analyze all nearby obstructions.
    """

    results = []

    for obstruction in obstructions:

        result = analyze_obstruction_annually(
            obstruction=obstruction,
            latitude=latitude,
            longitude=longitude,
            timezone=timezone,
        )

        results.append(result)

    risks = [
        item["risk"]
        for item in results
    ]

    if "HIGH" in risks:
        overall_risk = "HIGH"

    elif "MODERATE" in risks:
        overall_risk = "MODERATE"

    else:
        overall_risk = "LOW"

    return {
        "engine": (
            "SolarIQ+ Annual Geometric "
            "Shadow Analysis"
        ),
        "location": {
            "latitude": latitude,
            "longitude": longitude,
            "timezone": timezone,
        },
        "analysis_method": (
            "Sun azimuth/elevation versus "
            "obstruction bearing/angular height"
        ),
        "seasonal_dates": [
            name
            for name, _ in SEASONAL_DATES
        ],
        "overall_geometric_shadow_risk": (
            overall_risk
        ),
        "obstructions": results,
        "important_note": (
            "Risk represents geometric potential "
            "for shading. It is not an exact "
            "annual generation-loss percentage."
        ),
    }


# ============================================================================
# REPORT PRINTING
# ============================================================================

def print_report(result: dict) -> None:
    """
    Print a human-readable standalone report.
    """

    print("\n")
    print("=" * 82)
    print("SolarIQ+ ANNUAL SHADOW ANALYSIS")
    print("=" * 82)

    print(
        "\nOverall geometric shadow risk:",
        result[
            "overall_geometric_shadow_risk"
        ],
    )

    print(
        "\nLocation:",
        result["location"],
    )

    print(
        "\nMethod:",
        result["analysis_method"],
    )

    for item in result["obstructions"]:

        print("\n" + "-" * 82)

        print(
            "Obstruction:",
            item["name"],
        )

        print(
            "Type:",
            item["type"],
        )

        print(
            "Direction:",
            item["bearing_deg"],
            "deg",
        )

        print(
            "Distance:",
            item["distance_m"],
            "m",
        )

        print(
            "Height:",
            item["height_m"],
            "m",
        )

        print(
            "Angular height:",
            item["angular_height_deg"],
            "deg",
        )

        print(
            "Difference from south-facing panel direction:",
            item[
                "panel_direction_difference_deg"
            ],
            "deg",
        )

        print(
            "Near panel direction:",
            item["near_panel_direction"],
        )

        print(
            "Seasons with potential shadow:",
            item[
                "seasons_with_potential_shadow"
            ],
            "/ 4",
        )

        print(
            "Seasonal sampled exposure:",
            item[
                "seasonal_exposure_hours"
            ],
            "hours",
        )

        print(
            "Geometric risk:",
            item["risk"],
        )

        print("\nSeasonal windows:")

        for season in item[
            "seasonal_analysis"
        ]:

            exposure = season[
                "potential_exposure_hours"
            ]

            windows = season[
                "shadow_windows"
            ]

            print(
                f"  {season['season']}: "
                f"{exposure} h",
                end="",
            )

            if windows:

                readable = ", ".join(
                    (
                        f"{window['start']}"
                        f"-"
                        f"{window['end']}"
                    )
                    for window in windows
                )

                print(
                    f"  [{readable}]"
                )

            else:

                print(
                    "  [No potential shadow]"
                )

    print("\n" + "=" * 82)

    print(
        "NOTE:",
        result["important_note"],
    )

    print("=" * 82)


# ============================================================================
# REALISTIC TEST CASES
# ============================================================================

if __name__ == "__main__":

    LATITUDE = 19.876
    LONGITUDE = 75.343
    TIMEZONE = "Asia/Kolkata"

    print(
        "\nSolarIQ+ Shadow Engine Test Location:"
    )

    print(
        f"Latitude: {LATITUDE}"
    )

    print(
        f"Longitude: {LONGITUDE}"
    )

    # ------------------------------------------------------------------------
    # Scenario A:
    #
    # Target house B is one floor.
    # House A is taller and directly south.
    # ------------------------------------------------------------------------

    scenario_a = [
        Obstruction(
            name="House A — Tall South Building",
            obstruction_type="building",
            bearing_deg=180,
            distance_m=8,
            height_m=6,
        )
    ]

    result_a = analyze_neighborhood(
        latitude=LATITUDE,
        longitude=LONGITUDE,
        timezone=TIMEZONE,
        obstructions=scenario_a,
    )

    print_report(result_a)

    # ------------------------------------------------------------------------
    # Scenario B:
    #
    # Tall structure east of the target house.
    # It can affect morning sunlight even though panels face south.
    # ------------------------------------------------------------------------

    scenario_b = [
        Obstruction(
            name="East Building",
            obstruction_type="building",
            bearing_deg=90,
            distance_m=8,
            height_m=8,
        )
    ]

    result_b = analyze_neighborhood(
        latitude=LATITUDE,
        longitude=LONGITUDE,
        timezone=TIMEZONE,
        obstructions=scenario_b,
    )

    print_report(result_b)

    # ------------------------------------------------------------------------
    # Scenario C:
    #
    # Realistic mixed neighborhood.
    # ------------------------------------------------------------------------

    scenario_c = [
        Obstruction(
            name="House A",
            obstruction_type="building",
            bearing_deg=180,
            distance_m=8,
            height_m=6,
        ),
        Obstruction(
            name="House C",
            obstruction_type="building",
            bearing_deg=160,
            distance_m=10,
            height_m=5,
        ),
        Obstruction(
            name="Large Tree",
            obstruction_type="tree",
            bearing_deg=120,
            distance_m=12,
            height_m=7,
        ),
        Obstruction(
            name="North House",
            obstruction_type="building",
            bearing_deg=0,
            distance_m=8,
            height_m=8,
        ),
    ]

    result_c = analyze_neighborhood(
        latitude=LATITUDE,
        longitude=LONGITUDE,
        timezone=TIMEZONE,
        obstructions=scenario_c,
    )

    print_report(result_c)

    print("\n")
    print("=" * 82)
    print("STANDALONE SHADOW ENGINE TEST COMPLETE")
    print("=" * 82)