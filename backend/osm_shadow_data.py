"""
SolarIQ+ — OpenStreetMap Shadow Data Analyzer

Purpose:
    Retrieve nearby building footprints from OpenStreetMap/Overpass and
    convert them into obstruction information suitable for the SolarIQ+
    shadow-analysis engine.

Reliability:
    - Successful OSM responses are cached locally.
    - Cached data can be reused when Overpass is temporarily unavailable.
    - The cache is keyed by rounded rooftop coordinates and search radius.

Height safety:
    - OSM "height" is used when available.
    - OSM "building:levels" is converted using an explicit 3 m/floor assumption.
    - Missing height remains UNKNOWN.
    - No height is silently invented.

This module does NOT calculate shadow risk itself.
It prepares real-world obstruction data for shadow_analysis.py.
"""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests


# ============================================================================
# CONFIGURATION
# ============================================================================

OVERPASS_URL = "https://overpass.kumi.systems/api/interpreter"
OVERPASS_FALLBACK_URL = "https://overpass-api.de/api/interpreter"

DEFAULT_RADIUS_METERS = 100

# Explicit assumption ONLY when OSM has building:levels but no direct height.
DEFAULT_FLOOR_HEIGHT_METERS = 3.0

REQUEST_TIMEOUT_SECONDS = 60

USER_AGENT = (
    "SolarIQPlus/1.0 "
    "shadow-analysis-data-collector"
)

# Local cache directory.
BASE_DIR = Path(__file__).resolve().parent
CACHE_DIR = BASE_DIR / "osm_cache"


# ============================================================================
# DATA MODEL
# ============================================================================

@dataclass
class OSMObstruction:
    """
    Normalized obstruction information.
    """

    osm_id: int
    building_type: str

    latitude: float
    longitude: float

    distance_m: float
    bearing_deg: float

    height_m: Optional[float]

    height_source: str
    height_known: bool

    building_levels: Optional[float]

    footprint_points: int


# ============================================================================
# CACHE HELPERS
# ============================================================================

def _cache_key(
    latitude: float,
    longitude: float,
    radius_m: float,
) -> str:
    """
    Create a stable cache key.

    Coordinates are rounded to 5 decimal places, which is roughly meter-scale
    precision while avoiding excessive cache fragmentation.
    """

    raw = (
        f"{round(latitude, 5)}:"
        f"{round(longitude, 5)}:"
        f"{round(radius_m, 1)}"
    )

    return hashlib.sha256(
        raw.encode("utf-8")
    ).hexdigest()[:24]


def _cache_path(
    latitude: float,
    longitude: float,
    radius_m: float,
) -> Path:
    """
    Return the cache file path for a rooftop query.
    """

    CACHE_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    return CACHE_DIR / (
        f"osm_{_cache_key(latitude, longitude, radius_m)}.json"
    )


def _save_raw_buildings_to_cache(
    latitude: float,
    longitude: float,
    radius_m: float,
    buildings: List[Dict[str, Any]],
) -> None:
    """
    Save successful raw OSM building data locally.
    """

    path = _cache_path(
        latitude,
        longitude,
        radius_m,
    )

    payload = {
        "source": "OpenStreetMap/Overpass",
        "latitude": latitude,
        "longitude": longitude,
        "radius_m": radius_m,
        "cached_at": __import__("datetime").datetime.now(
            __import__("datetime").timezone.utc
        ).isoformat(),
        "buildings": buildings,
    }

    path.write_text(
        json.dumps(
            payload,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )


def _load_raw_buildings_from_cache(
    latitude: float,
    longitude: float,
    radius_m: float,
) -> Optional[List[Dict[str, Any]]]:
    """
    Load previously successful raw OSM data.

    Returns:
        Cached building list or None.
    """

    path = _cache_path(
        latitude,
        longitude,
        radius_m,
    )

    if not path.exists():
        return None

    try:
        payload = json.loads(
            path.read_text(
                encoding="utf-8"
            )
        )

        buildings = payload.get(
            "buildings"
        )

        if not isinstance(
            buildings,
            list,
        ):
            return None

        return buildings

    except (
        OSError,
        json.JSONDecodeError,
    ):
        return None


# ============================================================================
# DISTANCE CALCULATION
# ============================================================================

def haversine_distance_m(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
) -> float:
    """
    Calculate great-circle distance between two coordinates.

    Returns:
        Distance in meters.
    """

    earth_radius_m = 6_371_000.0

    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)

    delta_lat = math.radians(
        lat2 - lat1
    )

    delta_lon = math.radians(
        lon2 - lon1
    )

    a = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1_rad)
        * math.cos(lat2_rad)
        * math.sin(delta_lon / 2) ** 2
    )

    c = 2 * math.atan2(
        math.sqrt(a),
        math.sqrt(1 - a),
    )

    return earth_radius_m * c


# ============================================================================
# BEARING CALCULATION
# ============================================================================

def calculate_bearing_deg(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
) -> float:
    """
    Calculate compass bearing from point 1 to point 2.

    Result:

        0   = North
        90  = East
        180 = South
        270 = West
    """

    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)

    delta_lon = math.radians(
        lon2 - lon1
    )

    x = (
        math.sin(delta_lon)
        * math.cos(lat2_rad)
    )

    y = (
        math.cos(lat1_rad)
        * math.sin(lat2_rad)
        -
        math.sin(lat1_rad)
        * math.cos(lat2_rad)
        * math.cos(delta_lon)
    )

    bearing = math.degrees(
        math.atan2(x, y)
    )

    return bearing % 360.0


# ============================================================================
# LOCAL APPROXIMATION
# ============================================================================

def local_xy_meters(
    reference_lat: float,
    reference_lon: float,
    lat: float,
    lon: float,
) -> Tuple[float, float]:
    """
    Convert nearby latitude/longitude into approximate local meters.

    Returns:

        x = east/west meters
        y = north/south meters
    """

    meters_per_degree_lat = 111_320.0

    meters_per_degree_lon = (
        111_320.0
        * math.cos(
            math.radians(
                reference_lat
            )
        )
    )

    x = (
        lon - reference_lon
    ) * meters_per_degree_lon

    y = (
        lat - reference_lat
    ) * meters_per_degree_lat

    return x, y


# ============================================================================
# POINT-TO-SEGMENT DISTANCE
# ============================================================================

def point_to_segment_distance(
    px: float,
    py: float,
    ax: float,
    ay: float,
    bx: float,
    by: float,
) -> Tuple[float, float, float]:
    """
    Calculate the closest point on segment AB to point P.

    Returns:

        distance
        closest_x
        closest_y
    """

    ab_x = bx - ax
    ab_y = by - ay

    ab_length_squared = (
        ab_x * ab_x
        +
        ab_y * ab_y
    )

    if ab_length_squared == 0:
        distance = math.hypot(
            px - ax,
            py - ay,
        )

        return (
            distance,
            ax,
            ay,
        )

    t = (
        (px - ax) * ab_x
        +
        (py - ay) * ab_y
    ) / ab_length_squared

    t = max(
        0.0,
        min(1.0, t),
    )

    closest_x = (
        ax + t * ab_x
    )

    closest_y = (
        ay + t * ab_y
    )

    distance = math.hypot(
        px - closest_x,
        py - closest_y,
    )

    return (
        distance,
        closest_x,
        closest_y,
    )


# ============================================================================
# FOOTPRINT ANALYSIS
# ============================================================================

def nearest_point_on_footprint(
    rooftop_lat: float,
    rooftop_lon: float,
    geometry: List[Dict[str, Any]],
) -> Optional[Tuple[float, float, float]]:
    """
    Find the closest point on a building footprint to the rooftop.

    Returns:

        distance_m
        nearest_lat
        nearest_lon
    """

    if not geometry:
        return None

    local_points = []

    for point in geometry:

        lat = point.get("lat")
        lon = point.get("lon")

        if lat is None or lon is None:
            continue

        x, y = local_xy_meters(
            rooftop_lat,
            rooftop_lon,
            lat,
            lon,
        )

        local_points.append(
            (
                x,
                y,
                lat,
                lon,
            )
        )

    if not local_points:
        return None

    best_distance = float("inf")
    best_lat = None
    best_lon = None

    for index in range(
        len(local_points)
    ):

        current = local_points[index]

        next_index = (
            index + 1
        ) % len(local_points)

        next_point = local_points[
            next_index
        ]

        distance, closest_x, closest_y = (
            point_to_segment_distance(
                0.0,
                0.0,
                current[0],
                current[1],
                next_point[0],
                next_point[1],
            )
        )

        if distance < best_distance:

            best_distance = distance

            meters_per_degree_lat = (
                111_320.0
            )

            meters_per_degree_lon = (
                111_320.0
                * math.cos(
                    math.radians(
                        rooftop_lat
                    )
                )
            )

            best_lat = (
                rooftop_lat
                +
                closest_y
                / meters_per_degree_lat
            )

            best_lon = (
                rooftop_lon
                +
                closest_x
                / meters_per_degree_lon
            )

    if best_lat is None or best_lon is None:
        return None

    return (
        best_distance,
        best_lat,
        best_lon,
    )


# ============================================================================
# HEIGHT EXTRACTION
# ============================================================================

def parse_numeric_height(
    value: Any,
) -> Optional[float]:
    """
    Parse OSM height values.

    Handles examples such as:

        "12"
        "12 m"
        "12.5"
    """

    if value is None:
        return None

    text = str(value).strip()

    if not text:
        return None

    text = (
        text
        .lower()
        .replace("meters", "")
        .replace("meter", "")
        .replace("metres", "")
        .replace("metre", "")
        .replace("m", "")
        .strip()
    )

    try:
        height = float(text)

        if height < 0:
            return None

        return height

    except ValueError:
        return None


def parse_building_levels(
    value: Any,
) -> Optional[float]:
    """
    Parse building:levels.

    Examples:

        "3" -> 3
        "3.5" -> 3.5
    """

    if value is None:
        return None

    try:
        levels = float(
            str(value).strip()
        )

        if levels < 0:
            return None

        return levels

    except ValueError:
        return None


def extract_height(
    tags: Dict[str, Any],
) -> Tuple[
    Optional[float],
    str,
    bool,
    Optional[float],
]:
    """
    Determine building height.

    Priority:

        1. OSM "height"
        2. OSM "building:levels" × explicit floor assumption
        3. Unknown

    Returns:

        height_m
        height_source
        height_known
        building_levels
    """

    direct_height = parse_numeric_height(
        tags.get("height")
    )

    if direct_height is not None:

        return (
            round(
                direct_height,
                2,
            ),
            "OSM height tag",
            True,
            parse_building_levels(
                tags.get(
                    "building:levels"
                )
            ),
        )

    levels = parse_building_levels(
        tags.get("building:levels")
    )

    if levels is not None:

        estimated_height = (
            levels
            * DEFAULT_FLOOR_HEIGHT_METERS
        )

        return (
            round(
                estimated_height,
                2,
            ),
            (
                "Estimated from "
                "building:levels "
                f"({DEFAULT_FLOOR_HEIGHT_METERS} m/floor)"
            ),
            True,
            levels,
        )

    return (
        None,
        "Height unavailable",
        False,
        None,
    )


# ============================================================================
# OVERPASS
# ============================================================================

def _query_overpass(
    endpoint: str,
    query: str,
) -> List[Dict[str, Any]]:
    """
    Execute one Overpass request.
    """

    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
    }

    response = requests.post(
        endpoint,
        data={
            "data": query,
        },
        headers=headers,
        timeout=REQUEST_TIMEOUT_SECONDS,
    )

    response.raise_for_status()

    data = response.json()

    return data.get(
        "elements",
        [],
    )


def _fetch_live_buildings(
    latitude: float,
    longitude: float,
    radius_m: float,
) -> List[Dict[str, Any]]:
    """
    Query the configured Overpass endpoints.

    Returns:
        Raw OSM building elements.

    Raises:
        requests.RequestException if all endpoints fail.
    """

    query = (
        "[out:json][timeout:30];"
        f"way[building]"
        f"(around:{radius_m},{latitude},{longitude});"
        "out tags geom;"
    )

    errors = []

    for endpoint in (
        OVERPASS_URL,
        OVERPASS_FALLBACK_URL,
    ):

        try:

            buildings = _query_overpass(
                endpoint,
                query,
            )

            return buildings

        except (
            requests.RequestException,
            ValueError,
        ) as error:

            errors.append(
                f"{endpoint}: {error}"
            )

    raise requests.RequestException(
        "All configured Overpass endpoints failed.\n"
        + "\n".join(errors)
    )


def fetch_buildings(
    latitude: float,
    longitude: float,
    radius_m: float = DEFAULT_RADIUS_METERS,
) -> List[Dict[str, Any]]:
    """
    Retrieve nearby buildings.

    Strategy:

        1. Try live Overpass.
        2. If successful, save the result to cache.
        3. If live Overpass fails, use cached data.
        4. If no cache exists, raise a clear error.
    """

    try:

        buildings = _fetch_live_buildings(
            latitude=latitude,
            longitude=longitude,
            radius_m=radius_m,
        )

        _save_raw_buildings_to_cache(
            latitude=latitude,
            longitude=longitude,
            radius_m=radius_m,
            buildings=buildings,
        )

        return buildings

    except requests.RequestException as live_error:

        cached = _load_raw_buildings_from_cache(
            latitude=latitude,
            longitude=longitude,
            radius_m=radius_m,
        )

        if cached is not None:

            return cached

        raise requests.RequestException(
            "OpenStreetMap/Overpass is currently "
            "unavailable and no cached building data "
            "exists for this rooftop location.\n"
            f"Live error: {live_error}"
        )


# ============================================================================
# NORMALIZATION
# ============================================================================

def convert_building_to_obstruction(
    rooftop_lat: float,
    rooftop_lon: float,
    building: Dict[str, Any],
) -> Optional[OSMObstruction]:
    """
    Convert one raw OSM building into a normalized obstruction.
    """

    geometry = building.get(
        "geometry",
        [],
    )

    nearest = nearest_point_on_footprint(
        rooftop_lat,
        rooftop_lon,
        geometry,
    )

    if nearest is None:
        return None

    distance_m, nearest_lat, nearest_lon = nearest

    bearing_deg = calculate_bearing_deg(
        rooftop_lat,
        rooftop_lon,
        nearest_lat,
        nearest_lon,
    )

    tags = building.get(
        "tags",
        {},
    )

    (
        height_m,
        height_source,
        height_known,
        levels,
    ) = extract_height(tags)

    building_type = tags.get(
        "building",
        "unknown",
    )

    return OSMObstruction(
        osm_id=int(
            building.get(
                "id",
                0,
            )
        ),
        building_type=building_type,
        latitude=round(
            nearest_lat,
            7,
        ),
        longitude=round(
            nearest_lon,
            7,
        ),
        distance_m=round(
            distance_m,
            2,
        ),
        bearing_deg=round(
            bearing_deg,
            2,
        ),
        height_m=height_m,
        height_source=height_source,
        height_known=height_known,
        building_levels=levels,
        footprint_points=len(
            geometry
        ),
    )


def get_osm_obstructions(
    latitude: float,
    longitude: float,
    radius_m: float = DEFAULT_RADIUS_METERS,
) -> List[OSMObstruction]:
    """
    Complete OSM acquisition and normalization pipeline.
    """

    buildings = fetch_buildings(
        latitude=latitude,
        longitude=longitude,
        radius_m=radius_m,
    )

    obstructions = []

    for building in buildings:

        obstruction = (
            convert_building_to_obstruction(
                rooftop_lat=latitude,
                rooftop_lon=longitude,
                building=building,
            )
        )

        if obstruction is not None:
            obstructions.append(
                obstruction
            )

    obstructions.sort(
        key=lambda item: item.distance_m
    )

    return obstructions


# ============================================================================
# HUMAN-READABLE REPORT
# ============================================================================

def print_obstruction_report(
    latitude: float,
    longitude: float,
    radius_m: float,
    obstructions: List[OSMObstruction],
) -> None:
    """
    Print normalized obstruction data.
    """

    print()
    print("=" * 82)
    print(
        "SolarIQ+ OPENSTREETMAP "
        "OBSTRUCTION ANALYSIS"
    )
    print("=" * 82)

    print(
        "\nRooftop:",
        latitude,
        longitude,
    )

    print(
        "Search radius:",
        radius_m,
        "meters",
    )

    print(
        "Buildings found:",
        len(obstructions),
    )

    known_height_count = sum(
        1
        for item in obstructions
        if item.height_known
    )

    unknown_height_count = (
        len(obstructions)
        - known_height_count
    )

    print(
        "Height known:",
        known_height_count,
    )

    print(
        "Height unknown:",
        unknown_height_count,
    )

    for index, item in enumerate(
        obstructions,
        start=1,
    ):

        print("\n" + "-" * 82)

        print(
            f"#{index}  OSM ID:",
            item.osm_id,
        )

        print(
            "Building type:",
            item.building_type,
        )

        print(
            "Nearest point:",
            item.latitude,
            item.longitude,
        )

        print(
            "Distance:",
            item.distance_m,
            "m",
        )

        print(
            "Bearing:",
            item.bearing_deg,
            "deg",
        )

        print(
            "Height:",
            (
                f"{item.height_m} m"
                if item.height_known
                else "UNKNOWN"
            ),
        )

        print(
            "Height source:",
            item.height_source,
        )

        print(
            "Building levels:",
            (
                item.building_levels
                if item.building_levels is not None
                else "UNKNOWN"
            ),
        )

        print(
            "Footprint points:",
            item.footprint_points,
        )

    print("\n" + "=" * 82)

    print("IMPORTANT:")

    print(
        "Unknown building heights are not invented. "
        "They require user confirmation or another "
        "height source before shadow risk is calculated."
    )

    print("=" * 82)


# ============================================================================
# STANDALONE TEST
# ============================================================================

if __name__ == "__main__":

    LATITUDE = 19.876
    LONGITUDE = 75.343
    RADIUS_METERS = 50

    try:

        obstructions = get_osm_obstructions(
            latitude=LATITUDE,
            longitude=LONGITUDE,
            radius_m=RADIUS_METERS,
        )

        print_obstruction_report(
            latitude=LATITUDE,
            longitude=LONGITUDE,
            radius_m=RADIUS_METERS,
            obstructions=obstructions,
        )

    except requests.RequestException as error:

        print(
            "\nERROR: "
            "OpenStreetMap/Overpass request failed."
        )

        print(error)

    except Exception as error:

        print(
            "\nERROR: "
            "Obstruction analysis failed."
        )

        print(type(error).__name__)
        print(error)