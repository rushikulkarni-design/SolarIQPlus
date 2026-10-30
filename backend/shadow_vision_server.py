import io
import math
from datetime import date, time
from typing import Optional, Dict, List, Any, Tuple

import numpy as np
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from ultralytics import YOLOWorld


# ============================================================
# SolarIQ+ Shadow Vision + PV Array Shading Server
# ============================================================

app = FastAPI(
    title="SolarIQ+ Shadow Vision Analysis",
    version="4.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# YOLO WORLD
# ============================================================

MODEL_NAME = "yolov8s-worldv2.pt"

try:
    model = YOLOWorld(MODEL_NAME)
    print(f"[OK] YOLOWorld model loaded: {MODEL_NAME}")
except Exception as e:
    model = None
    print(f"[ERROR] YOLOWorld model load failed: {e}")


# ============================================================
# PROJECT DEFAULTS
# ============================================================

DEFAULT_SITE_LATITUDE = 19.8762
DEFAULT_SITE_LONGITUDE = 75.3433
DEFAULT_TIMEZONE_OFFSET = 5.5

DEFAULT_PANEL_AZIMUTH = 180.0
DEFAULT_PANEL_TILT = 20.0


# ============================================================
# TEST ARRAY DEFAULTS
# ============================================================

DEFAULT_MODULES_PER_ROW = 8
DEFAULT_NUMBER_OF_ROWS = 4

DEFAULT_MODULE_WIDTH_M = 2.0
DEFAULT_MODULE_HEIGHT_M = 1.0

DEFAULT_ROW_SPACING_M = 1.2
DEFAULT_ARRAY_HEIGHT_M = 1.0


# ============================================================
# TEST OBSTACLE DEFAULTS
# ============================================================

DEFAULT_OBSTACLE_BEARING = 90.0
DEFAULT_OBSTACLE_DISTANCE = 25.0
DEFAULT_OBSTACLE_HEIGHT = 12.0

# Test footprint.
# These must eventually come from user/site measurements.
DEFAULT_OBSTACLE_WIDTH_M = 10.0
DEFAULT_OBSTACLE_DEPTH_M = 5.0


# ============================================================
# VISION CLASSES
# ============================================================

VISION_CLASSES = [
    "nearby building",
    "large foreground building",
    "close multi-storey building",
    "large rooftop structure",

    "nearby tree",
    "nearby water tank",
    "nearby pole",
    "nearby telecom tower",
    "nearby tower",

    "building",
    "tree",
    "water tank",
    "pole",
    "telecom tower",
    "tower",
]


DETECTION_CONFIDENCE = 0.10
MAX_CANDIDATES_PER_PHOTO = 2
IOU_THRESHOLD = 0.55


# ============================================================
# BUILDING SCREENING
# ============================================================

BUILDING_MIN_AREA = 0.18
BUILDING_MIN_VERTICAL_FRACTION = 0.55
BUILDING_MIN_CENTRALITY = 0.48

NORTH_BUILDING_MIN_AREA = 0.30
NORTH_BUILDING_MIN_VERTICAL = 0.65
NORTH_BUILDING_MIN_CENTRALITY = 0.62
NORTH_BUILDING_MAX_EDGE_CONTEXT = 0.45

TREE_MIN_AREA = 0.035
TREE_MIN_VERTICAL = 0.20

TANK_MIN_AREA = 0.025
TANK_MIN_VERTICAL = 0.12

TOWER_MIN_AREA = 0.008
TOWER_MIN_VERTICAL = 0.20

POLE_MIN_VERTICAL = 0.25


# ============================================================
# SHADOW SETTINGS
# ============================================================

DEFAULT_ALIGNMENT_TOLERANCE = 15.0
PARTIAL_ARRAY_ALIGNMENT_TOLERANCE = 30.0


# ============================================================
# GENERAL HELPERS
# ============================================================

def clamp(
    value: float,
    minimum: float,
    maximum: float
) -> float:
    return max(
        minimum,
        min(maximum, value)
    )


def safe_float(
    value: Any,
    default: float = 0.0
) -> float:

    try:
        return float(value)
    except Exception:
        return default


def safe_int(
    value: Any,
    default: int
) -> int:

    try:
        return int(float(value))
    except Exception:
        return default


def normalize_azimuth(
    degrees_value: float
) -> float:

    return degrees_value % 360.0


def angular_difference_deg(
    a: float,
    b: float
) -> float:

    return abs(
        (a - b + 180.0) % 360.0 - 180.0
    )


# ============================================================
# VISUAL FEATURES
# ============================================================

def calculate_visual_features(
    x1: float,
    y1: float,
    x2: float,
    y2: float
) -> Dict[str, float]:

    width = max(
        0.0,
        x2 - x1
    )

    height = max(
        0.0,
        y2 - y1
    )

    area = width * height

    center_x = (
        x1 + x2
    ) / 2.0

    center_y = (
        y1 + y2
    ) / 2.0

    centrality = 1.0 - min(
        1.0,
        abs(center_x - 0.5) * 2.0
    )

    bottom_presence = y2
    top_reach = 1.0 - y1

    size_score = clamp(
        math.sqrt(
            max(area, 0.0)
        ) * 2.0,
        0.0,
        1.0
    )

    foreground_score = clamp(
        0.50 * size_score
        + 0.30 * bottom_presence
        + 0.20 * height,
        0.0,
        1.0
    )

    skyline_score = clamp(
        0.55 * top_reach
        + 0.45 * height,
        0.0,
        1.0
    )

    touches_left = x1 <= 0.02
    touches_right = x2 >= 0.98
    touches_top = y1 <= 0.02
    touches_bottom = y2 >= 0.98

    edge_touch_count = sum([
        touches_left,
        touches_right,
        touches_top,
        touches_bottom
    ])

    edge_context = (
        edge_touch_count / 4.0
    )

    if center_x < 0.5:
        side_edge_dominance = max(
            x1,
            1.0 - center_x
        )
    else:
        side_edge_dominance = max(
            1.0 - x2,
            center_x
        )

    aspect_ratio = (
        width / height
        if height > 0
        else 0.0
    )

    return {
        "area": area,
        "width": width,
        "height": height,
        "center_x": center_x,
        "center_y": center_y,
        "vertical_fraction": height,
        "horizontal_fraction": width,
        "centrality": centrality,
        "bottom_presence": bottom_presence,
        "top_reach": top_reach,
        "size_score": size_score,
        "foreground_score": foreground_score,
        "skyline_score": skyline_score,
        "edge_context": edge_context,
        "side_edge_dominance": side_edge_dominance,
        "touches_left": float(touches_left),
        "touches_right": float(touches_right),
        "touches_top": float(touches_top),
        "touches_bottom": float(touches_bottom),
        "aspect_ratio": aspect_ratio,
    }


# ============================================================
# BUILDING CONTEXT ANALYSIS
# ============================================================

def analyze_building_context(
    features: Dict[str, float],
    direction: str
) -> Dict[str, Any]:

    area = features["area"]
    vertical = features["vertical_fraction"]
    centrality = features["centrality"]
    edge_context = features["edge_context"]
    side_edge_dominance = features["side_edge_dominance"]

    touches_left = bool(
        features["touches_left"]
    )

    touches_right = bool(
        features["touches_right"]
    )

    direction = direction.lower()

    # Strong multi-edge attachment.
    if edge_context >= 0.75:
        return {
            "keep": False,
            "reason": "MULTI_EDGE_CONTEXT"
        }

    # Reject very large foreground structures
    # attached strongly to one side.
    #
    # This intentionally does NOT reject every large building.
    if (
        area >= 0.42
        and vertical >= 0.80
        and (touches_left or touches_right)
        and side_edge_dominance >= 0.68
        and centrality < 0.64
    ):
        return {
            "keep": False,
            "reason": "FOREGROUND_EDGE_CONTEXT"
        }

    # North is lower direct relevance for a
    # fixed south-facing array.
    if direction == "north":

        if (
            area >= NORTH_BUILDING_MIN_AREA
            and vertical >= NORTH_BUILDING_MIN_VERTICAL
            and centrality >= NORTH_BUILDING_MIN_CENTRALITY
            and edge_context <= NORTH_BUILDING_MAX_EDGE_CONTEXT
        ):
            return {
                "keep": True,
                "reason": "NORTH_MEANINGFUL_BUILDING"
            }

        return {
            "keep": False,
            "reason": "NORTH_CONTEXT_OR_LOW_RELEVANCE"
        }

    if (
        area >= BUILDING_MIN_AREA
        and vertical >= BUILDING_MIN_VERTICAL_FRACTION
        and centrality >= BUILDING_MIN_CENTRALITY
    ):
        return {
            "keep": True,
            "reason": "MEANINGFUL_BUILDING"
        }

    return {
        "keep": False,
        "reason": "SMALL_OR_DISTANT_BUILDING"
    }


# ============================================================
# PROXIMITY SCREEN
# ============================================================

def proximity_screen(
    class_name: str,
    features: Dict[str, float],
    direction: str
) -> Dict[str, Any]:

    name = class_name.lower()

    if "building" in name:
        return analyze_building_context(
            features,
            direction
        )

    if "tree" in name:

        if (
            features["area"] >= TREE_MIN_AREA
            and features["vertical_fraction"] >= TREE_MIN_VERTICAL
        ):
            return {
                "keep": True,
                "reason": "MEANINGFUL_TREE"
            }

        return {
            "keep": False,
            "reason": "SMALL_TREE"
        }

    if "water tank" in name:

        if features["area"] >= TANK_MIN_AREA:
            return {
                "keep": True,
                "reason": "MEANINGFUL_WATER_TANK"
            }

        return {
            "keep": False,
            "reason": "SMALL_WATER_TANK"
        }

    if (
        "tower" in name
        or "telecom" in name
    ):

        if (
            features["area"] >= TOWER_MIN_AREA
            and features["vertical_fraction"] >= TOWER_MIN_VERTICAL
        ):
            return {
                "keep": True,
                "reason": "MEANINGFUL_TOWER"
            }

        return {
            "keep": False,
            "reason": "SMALL_TOWER"
        }

    if "pole" in name:

        if features["vertical_fraction"] >= POLE_MIN_VERTICAL:
            return {
                "keep": True,
                "reason": "MEANINGFUL_POLE"
            }

        return {
            "keep": False,
            "reason": "SMALL_POLE"
        }

    return {
        "keep": False,
        "reason": "UNSUPPORTED_OBJECT"
    }


# ============================================================
# IOU
# ============================================================

def calculate_iou(
    box_a: List[float],
    box_b: List[float]
) -> float:

    ax1, ay1, ax2, ay2 = box_a
    bx1, by1, bx2, by2 = box_b

    ix1 = max(
        ax1,
        bx1
    )

    iy1 = max(
        ay1,
        by1
    )

    ix2 = min(
        ax2,
        bx2
    )

    iy2 = min(
        ay2,
        by2
    )

    iw = max(
        0.0,
        ix2 - ix1
    )

    ih = max(
        0.0,
        iy2 - iy1
    )

    intersection = (
        iw * ih
    )

    area_a = (
        max(0.0, ax2 - ax1)
        * max(0.0, ay2 - ay1)
    )

    area_b = (
        max(0.0, bx2 - bx1)
        * max(0.0, by2 - by1)
    )

    union = (
        area_a
        + area_b
        - intersection
    )

    if union <= 0:
        return 0.0

    return (
        intersection / union
    )


# ============================================================
# YOLO DETECTION
# ============================================================

def detect_objects(
    image: Image.Image,
    direction: str
) -> Dict[str, Any]:

    if model is None:

        return {
            "status": "error",
            "message": "YOLOWorld model is not loaded.",
            "candidates": [],
            "raw_detections": []
        }

    image_rgb = image.convert(
        "RGB"
    )

    try:

        model.set_classes(
            VISION_CLASSES
        )

        results = model.predict(
            image_rgb,
            conf=DETECTION_CONFIDENCE,
            verbose=False
        )

    except Exception as e:

        return {
            "status": "error",
            "message": str(e),
            "candidates": [],
            "raw_detections": []
        }

    if not results:

        return {
            "status": "completed",
            "candidates": [],
            "raw_detections": []
        }

    result = results[0]
    boxes = result.boxes

    if boxes is None:

        return {
            "status": "completed",
            "candidates": [],
            "raw_detections": []
        }

    image_width, image_height = (
        image_rgb.size
    )

    candidates = []
    raw_detections = []

    for i in range(len(boxes)):

        try:

            xyxy = (
                boxes.xyxy[i]
                .cpu()
                .numpy()
                .tolist()
            )

            confidence = float(
                boxes.conf[i]
                .cpu()
                .item()
            )

            class_id = int(
                boxes.cls[i]
                .cpu()
                .item()
            )

            if (
                class_id < 0
                or class_id >= len(VISION_CLASSES)
            ):
                continue

            class_name = (
                VISION_CLASSES[class_id]
            )

        except Exception:
            continue

        x1, y1, x2, y2 = xyxy

        nx1 = clamp(
            x1 / image_width,
            0.0,
            1.0
        )

        ny1 = clamp(
            y1 / image_height,
            0.0,
            1.0
        )

        nx2 = clamp(
            x2 / image_width,
            0.0,
            1.0
        )

        ny2 = clamp(
            y2 / image_height,
            0.0,
            1.0
        )

        features = calculate_visual_features(
            nx1,
            ny1,
            nx2,
            ny2
        )

        screening = proximity_screen(
            class_name,
            features,
            direction
        )

        visual_features = {}

        for key, value in features.items():

            if isinstance(value, float):
                visual_features[key] = round(
                    value,
                    4
                )
            else:
                visual_features[key] = value

        raw_item = {
            "class": class_name,
            "confidence": round(
                confidence,
                4
            ),
            "box": [
                round(nx1, 4),
                round(ny1, 4),
                round(nx2, 4),
                round(ny2, 4)
            ],
            **visual_features,
            "screening": screening
        }

        raw_detections.append(
            raw_item
        )

        if screening["keep"]:

            candidates.append({
                "class": class_name,
                "confidence": round(
                    confidence,
                    4
                ),
                "box": raw_item["box"],
                "visual_features": visual_features,
                "screening_reason": screening[
                    "reason"
                ]
            })

    candidates.sort(
        key=lambda item: (
            item["visual_features"]["area"],
            item["confidence"]
        ),
        reverse=True
    )

    final_candidates = []

    for candidate in candidates:

        duplicate = False

        for existing in final_candidates:

            if calculate_iou(
                candidate["box"],
                existing["box"]
            ) >= IOU_THRESHOLD:

                duplicate = True
                break

        if duplicate:
            continue

        final_candidates.append(
            candidate
        )

        if (
            len(final_candidates)
            >= MAX_CANDIDATES_PER_PHOTO
        ):
            break

    return {
        "status": "completed",
        "candidates": final_candidates,
        "raw_detections": raw_detections
    }


# ============================================================
# VISION ENDPOINT
# ============================================================

@app.post(
    "/api/shadow/vision/analyze"
)
async def analyze_shadow_vision(
    north: Optional[UploadFile] = File(None),
    east: Optional[UploadFile] = File(None),
    south: Optional[UploadFile] = File(None),
    west: Optional[UploadFile] = File(None)
):

    uploads = {
        "north": north,
        "east": east,
        "south": south,
        "west": west
    }

    results = {}

    for direction, upload in uploads.items():

        if upload is None:

            results[direction] = {
                "status": "not_uploaded",
                "candidates": []
            }

            continue

        try:

            data = await upload.read()

            image = Image.open(
                io.BytesIO(data)
            ).convert("RGB")

            analysis = detect_objects(
                image,
                direction
            )

            results[direction] = {
                "filename": upload.filename,
                **analysis
            }

        except Exception as e:

            results[direction] = {
                "status": "error",
                "message": str(e),
                "candidates": []
            }

    total = sum(
        len(
            results[direction].get(
                "candidates",
                []
            )
        )
        for direction in results
    )

    return {
        "service": "SolarIQ+ Shadow Vision Analysis",
        "status": "completed",

        "summary": {
            "total_directional_candidates": total,

            "directions": {
                direction: len(
                    results[direction].get(
                        "candidates",
                        []
                    )
                )
                for direction in results
            }
        },

        "results": results
    }


# ============================================================
# SOLAR POSITION
# ============================================================

def solar_position(
    latitude: float,
    longitude: float,
    local_date: date,
    local_time: time,
    timezone_offset_hours: float
) -> Dict[str, float]:

    day_of_year = (
        local_date
        .timetuple()
        .tm_yday
    )

    local_decimal_hour = (
        local_time.hour
        + local_time.minute / 60.0
        + local_time.second / 3600.0
    )

    # --------------------------------------------------------
    # NOAA fractional-year calculation
    # --------------------------------------------------------

    gamma = (
        2.0
        * math.pi
        / 365.0
        * (
            day_of_year
            - 1
            + (
                local_decimal_hour
                - 12.0
            ) / 24.0
        )
    )

    equation_of_time = (
        229.18
        * (
            0.000075
            + 0.001868 * math.cos(gamma)
            - 0.032077 * math.sin(gamma)
            - 0.014615 * math.cos(2.0 * gamma)
            - 0.040849 * math.sin(2.0 * gamma)
        )
    )

    declination_rad = (
        0.006918
        - 0.399912 * math.cos(gamma)
        + 0.070257 * math.sin(gamma)
        - 0.006758 * math.cos(2.0 * gamma)
        + 0.000907 * math.sin(2.0 * gamma)
        - 0.002697 * math.cos(3.0 * gamma)
        + 0.001480 * math.sin(3.0 * gamma)
    )

    declination_deg = math.degrees(
        declination_rad
    )

    # --------------------------------------------------------
    # Solar time
    # --------------------------------------------------------

    time_offset = (
        equation_of_time
        + 4.0 * longitude
        - 60.0 * timezone_offset_hours
    )

    true_solar_time_minutes = (
        local_decimal_hour * 60.0
        + time_offset
    )

    # Keep within 0-1440 minutes.
    true_solar_time_minutes %= 1440.0

    hour_angle_deg = (
        true_solar_time_minutes / 4.0
        - 180.0
    )

    hour_angle_rad = math.radians(
        hour_angle_deg
    )

    latitude_rad = math.radians(
        latitude
    )

    # --------------------------------------------------------
    # Solar elevation
    # --------------------------------------------------------

    sin_elevation = (
        math.sin(latitude_rad)
        * math.sin(declination_rad)
        +
        math.cos(latitude_rad)
        * math.cos(declination_rad)
        * math.cos(hour_angle_rad)
    )

    sin_elevation = clamp(
        sin_elevation,
        -1.0,
        1.0
    )

    elevation_rad = math.asin(
        sin_elevation
    )

    elevation_deg = math.degrees(
        elevation_rad
    )

    # --------------------------------------------------------
    # IMPORTANT:
    #
    # Azimuth is measured clockwise from North:
    #
    # 0   = North
    # 90  = East
    # 180 = South
    # 270 = West
    #
    # This atan2 formulation avoids the old
    # acos/cos_azimuth ambiguity.
    # --------------------------------------------------------

    azimuth_rad = math.atan2(
        math.sin(hour_angle_rad),
        (
            math.cos(hour_angle_rad)
            * math.sin(latitude_rad)
            -
            math.tan(declination_rad)
            * math.cos(latitude_rad)
        )
    )

    solar_azimuth_deg = (
        math.degrees(azimuth_rad)
        + 180.0
    )

    solar_azimuth_deg = normalize_azimuth(
        solar_azimuth_deg
    )

    return {
        "day_of_year": day_of_year,

        "declination_deg": round(
            declination_deg,
            4
        ),

        "equation_of_time_min": round(
            equation_of_time,
            4
        ),

        "solar_time_hours": round(
            true_solar_time_minutes / 60.0,
            4
        ),

        "hour_angle_deg": round(
            hour_angle_deg,
            4
        ),

        "solar_elevation_deg": round(
            elevation_deg,
            4
        ),

        "solar_azimuth_deg": round(
            solar_azimuth_deg,
            4
        )
    }


# ============================================================
# BASIC SHADOW GEOMETRY
# ============================================================

def calculate_shadow_geometry(
    solar: Dict[str, float],
    bearing_deg: float,
    distance_m: float,
    height_m: float,
    panel_azimuth: float,
    panel_tilt: float,
    alignment_tolerance: float
) -> Dict[str, Any]:

    solar_azimuth = solar[
        "solar_azimuth_deg"
    ]

    solar_elevation = solar[
        "solar_elevation_deg"
    ]

    bearing = normalize_azimuth(
        bearing_deg
    )

    distance_m = max(
        0.001,
        distance_m
    )

    height_m = max(
        0.0,
        height_m
    )

    obstacle_angle = math.degrees(
        math.atan2(
            height_m,
            distance_m
        )
    )

    if solar_elevation > 0.01:

        shadow_length = (
            height_m
            /
            math.tan(
                math.radians(
                    solar_elevation
                )
            )
        )

    else:

        shadow_length = float(
            "inf"
        )

    alignment = angular_difference_deg(
        solar_azimuth,
        bearing
    )

    directionally_aligned = (
        alignment
        <= alignment_tolerance
    )

    partial_alignment = (
        alignment
        <= PARTIAL_ARRAY_ALIGNMENT_TOLERANCE
    )

    reaches_reference = (
        shadow_length
        >= distance_m
    )

    angular_block = (
        solar_elevation > 0
        and obstacle_angle
        >= solar_elevation
    )

    alignment_factor = clamp(
        1.0
        - alignment / 90.0,
        0.0,
        1.0
    )

    vertical_margin = (
        obstacle_angle
        - solar_elevation
    )

    if solar_elevation <= 0:

        status = "SUN_BELOW_HORIZON"

    elif (
        directionally_aligned
        and reaches_reference
        and angular_block
    ):

        status = "REFERENCE_POINT_IMPACT"

    elif (
        partial_alignment
        and reaches_reference
        and angular_block
    ):

        status = (
            "POTENTIAL_PARTIAL_ARRAY_IMPACT"
        )

    elif (
        partial_alignment
        and angular_block
    ):

        status = (
            "POTENTIAL_GEOMETRIC_INTERFERENCE"
        )

    else:

        status = (
            "LOW_DIRECT_SHADOW_ALIGNMENT"
        )

    return {

        "status": status,

        "obstacle_bearing_deg": round(
            bearing,
            2
        ),

        "obstacle_distance_m": round(
            distance_m,
            2
        ),

        "obstacle_height_m": round(
            height_m,
            2
        ),

        "obstacle_elevation_angle_deg": round(
            obstacle_angle,
            2
        ),

        "shadow_length_m": (
            round(
                shadow_length,
                2
            )
            if math.isfinite(
                shadow_length
            )
            else None
        ),

        "azimuth_alignment_deg": round(
            alignment,
            2
        ),

        "directionally_aligned": (
            directionally_aligned
        ),

        "partial_array_alignment": (
            partial_alignment
        ),

        "reaches_reference_point": (
            reaches_reference
        ),

        "angularly_blocks_sun": (
            angular_block
        ),

        "alignment_factor": round(
            alignment_factor,
            3
        ),

        "vertical_blocking_margin_deg": round(
            vertical_margin,
            2
        ),

        "panel_azimuth_deg": round(
            panel_azimuth,
            2
        ),

        "panel_tilt_deg": round(
            panel_tilt,
            2
        )
    }


# ============================================================
# ============================================================
# PV ARRAY GEOMETRY + 3D SHADOW PROJECTION
# ============================================================

def vec_add(a: List[float], b: List[float]) -> List[float]:
    return [a[i] + b[i] for i in range(3)]


def vec_sub(a: List[float], b: List[float]) -> List[float]:
    return [a[i] - b[i] for i in range(3)]


def vec_scale(a: List[float], s: float) -> List[float]:
    return [a[i] * s for i in range(3)]


def dot3(a: List[float], b: List[float]) -> float:
    return (
        a[0] * b[0]
        + a[1] * b[1]
        + a[2] * b[2]
    )


def cross3(a: List[float], b: List[float]) -> List[float]:
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]


def norm3(a: List[float]) -> float:
    return math.sqrt(dot3(a, a))


def normalize3(a: List[float]) -> List[float]:
    n = norm3(a)
    if n <= 1e-12:
        return [0.0, 0.0, 0.0]
    return [x / n for x in a]


def pv_plane_basis(
    panel_azimuth_deg: float,
    panel_tilt_deg: float
) -> Dict[str, List[float]]:
    """
    Local ENU coordinates:
      x = East
      y = North
      z = Up

    u = across-panel direction.
    v = direction up the tilted panel surface.
    n = panel normal, pointing toward the sky.
    """
    az = math.radians(
        normalize_azimuth(panel_azimuth_deg)
    )
    tilt = math.radians(
        clamp(panel_tilt_deg, 0.0, 90.0)
    )

    u = [
        math.cos(az),
        -math.sin(az),
        0.0
    ]

    # v points uphill on the panel, opposite the facing
    # horizontal direction, with a vertical component.
    v = [
        -math.cos(tilt) * math.sin(az),
        -math.cos(tilt) * math.cos(az),
        math.sin(tilt)
    ]

    n = normalize3(
        cross3(v, u)
    )

    return {
        "u": normalize3(u),
        "v": normalize3(v),
        "n": n
    }


def solar_direction_vector(
    solar_azimuth_deg: float,
    solar_elevation_deg: float
) -> List[float]:
    """
    Unit vector from the reference point toward the sun
    in local ENU coordinates.
    """
    az = math.radians(
        solar_azimuth_deg
    )
    elev = math.radians(
        solar_elevation_deg
    )

    horizontal = math.cos(elev)

    return normalize3([
        horizontal * math.sin(az),
        horizontal * math.cos(az),
        math.sin(elev)
    ])


def project_point_to_pv_plane(
    point: List[float],
    ray_direction: List[float],
    plane_origin: List[float],
    plane_normal: List[float]
) -> Optional[List[float]]:
    """
    Intersect a ray with the tilted PV plane.

    point + t * ray_direction
    plane: dot(X - plane_origin, plane_normal) = 0
    """
    denominator = dot3(
        plane_normal,
        ray_direction
    )

    if abs(denominator) <= 1e-10:
        return None

    numerator = dot3(
        plane_normal,
        vec_sub(plane_origin, point)
    )

    t = numerator / denominator

    if t < -1e-8:
        return None

    return vec_add(
        point,
        vec_scale(ray_direction, t)
    )


def convex_hull_2d(
    points: List[List[float]]
) -> List[List[float]]:
    """
    Monotonic-chain convex hull.
    Returns counter-clockwise points.
    """
    unique = sorted(
        {
            (
                round(float(p[0]), 10),
                round(float(p[1]), 10)
            )
            for p in points
        }
    )

    if len(unique) <= 1:
        return [
            [p[0], p[1]]
            for p in unique
        ]

    def cross(
        o: tuple,
        a: tuple,
        b: tuple
    ) -> float:
        return (
            (a[0] - o[0]) * (b[1] - o[1])
            - (a[1] - o[1]) * (b[0] - o[0])
        )

    lower = []
    for p in unique:
        while (
            len(lower) >= 2
            and cross(
                lower[-2],
                lower[-1],
                p
            ) <= 0
        ):
            lower.pop()
        lower.append(p)

    upper = []
    for p in reversed(unique):
        while (
            len(upper) >= 2
            and cross(
                upper[-2],
                upper[-1],
                p
            ) <= 0
        ):
            upper.pop()
        upper.append(p)

    hull = lower[:-1] + upper[:-1]

    return [
        [p[0], p[1]]
        for p in hull
    ]


def polygon_area_2d(
    polygon: List[List[float]]
) -> float:
    if len(polygon) < 3:
        return 0.0

    area = 0.0

    for i in range(len(polygon)):
        x1, y1 = polygon[i]
        x2, y2 = polygon[
            (i + 1) % len(polygon)
        ]

        area += (
            x1 * y2
            - x2 * y1
        )

    return abs(area) * 0.5


def clip_polygon_against_edge(
    polygon: List[List[float]],
    edge_start: List[float],
    edge_end: List[float]
) -> List[List[float]]:
    """
    Sutherland-Hodgman clipping for convex polygons.
    The clip polygon is assumed CCW.
    """
    if not polygon:
        return []

    ex = edge_end[0] - edge_start[0]
    ey = edge_end[1] - edge_start[1]

    def inside(p: List[float]) -> bool:
        return (
            ex * (p[1] - edge_start[1])
            - ey * (p[0] - edge_start[0])
        ) >= -1e-10

    def intersection(
        a: List[float],
        b: List[float]
    ) -> List[float]:
        dx = b[0] - a[0]
        dy = b[1] - a[1]

        denominator = (
            ex * dy
            - ey * dx
        )

        if abs(denominator) <= 1e-12:
            return [
                b[0],
                b[1]
            ]

        t = (
            ex * (edge_start[1] - a[1])
            - ey * (edge_start[0] - a[0])
        ) / denominator

        return [
            a[0] + t * dx,
            a[1] + t * dy
        ]

    output = []

    previous = polygon[-1]
    previous_inside = inside(previous)

    for current in polygon:
        current_inside = inside(current)

        if current_inside:
            if not previous_inside:
                output.append(
                    intersection(
                        previous,
                        current
                    )
                )

            output.append(current)

        elif previous_inside:
            output.append(
                intersection(
                    previous,
                    current
                )
            )

        previous = current
        previous_inside = current_inside

    return output


def polygon_intersection_area(
    subject_polygon: List[List[float]],
    clip_polygon: List[List[float]]
) -> float:
    """
    Exact polygon intersection area for convex polygons.
    """
    if (
        len(subject_polygon) < 3
        or len(clip_polygon) < 3
    ):
        return 0.0

    result = [
        [float(p[0]), float(p[1])]
        for p in subject_polygon
    ]

    for i in range(len(clip_polygon)):
        result = clip_polygon_against_edge(
            result,
            clip_polygon[i],
            clip_polygon[
                (i + 1) % len(clip_polygon)
            ]
        )

        if len(result) < 3:
            return 0.0

    return polygon_area_2d(result)


def build_pv_array(
    modules_per_row: int,
    number_of_rows: int,
    module_width_m: float,
    module_height_m: float,
    row_spacing_m: float,
    array_height_m: float,
    panel_azimuth_deg: float,
    panel_tilt_deg: float
) -> List[Dict[str, Any]]:
    """
    Build module centers in the tilted PV coordinate system.

    row_spacing_m is the center-to-center pitch between adjacent rows.

    x_m / y_m are retained as legacy layout coordinates:
      x_m = across-panel coordinate
      y_m = along-panel coordinate

    center_3d is the actual ENU location on the tilted PV plane.
    """
    basis = pv_plane_basis(
        panel_azimuth_deg,
        panel_tilt_deg
    )

    u = basis["u"]
    v = basis["v"]

    array_width = (
        modules_per_row
        * module_width_m
    )

    # row_spacing_m is the row-to-row module pitch (center-to-center).
    # Therefore the physical occupied depth is one module height plus
    # the pitch across the remaining row intervals.
    array_depth = (
        module_height_m
        + (number_of_rows - 1) * row_spacing_m
    )

    modules = []

    for row in range(number_of_rows):
        v_center = (
            -array_depth / 2.0
            + module_height_m / 2.0
            + row * row_spacing_m
        )

        for col in range(modules_per_row):
            u_center = (
                -array_width / 2.0
                + (col + 0.5)
                * module_width_m
            )

            center = vec_add(
                [0.0, 0.0, array_height_m],
                vec_add(
                    vec_scale(u, u_center),
                    vec_scale(v, v_center)
                )
            )

            modules.append({
                "module_id":
                    f"R{row + 1}C{col + 1}",

                "row":
                    row + 1,

                "column":
                    col + 1,

                "x_m":
                    round(
                        u_center
                        + array_width / 2.0,
                        3
                    ),

                "y_m":
                    round(
                        v_center
                        + array_depth / 2.0,
                        3
                    ),

                "z_m":
                    round(
                        center[2],
                        3
                    ),

                "width_m":
                    module_width_m,

                "height_m":
                    module_height_m,

                "center_3d":
                    [
                        round(center[0], 4),
                        round(center[1], 4),
                        round(center[2], 4)
                    ]
            })

    return modules


def module_polygon_uv(
    module: Dict[str, Any],
    module_width_m: float,
    module_height_m: float,
    array_width_m: float,
    array_depth_m: float
) -> List[List[float]]:
    """
    Module rectangle in the local tilted PV plane.
    """
    # x_m/y_m are stored from the lower-left layout origin.
    # Reconstruct the SAME centered u/v coordinates used by build_pv_array.
    # IMPORTANT: row spacing is not the same as module height.
    u_center = (
        module["x_m"]
        - array_width_m / 2.0
    )
    v_center = (
        module["y_m"]
        - array_depth_m / 2.0
    )

    half_u = module_width_m / 2.0
    half_v = module_height_m / 2.0

    return [
        [
            u_center - half_u,
            v_center - half_v
        ],
        [
            u_center + half_u,
            v_center - half_v
        ],
        [
            u_center + half_u,
            v_center + half_v
        ],
        [
            u_center - half_u,
            v_center + half_v
        ]
    ]


def obstacle_vertices_3d(
    bearing_deg: float,
    distance_m: float,
    height_m: float,
    obstacle_width_m: float,
    obstacle_depth_m: float
) -> List[List[float]]:
    """
    Build a rectangular vertical obstacle.

    Width is measured perpendicular to the obstacle bearing.
    Depth is measured along the bearing.
    """
    bearing = math.radians(
        normalize_azimuth(bearing_deg)
    )

    along = [
        math.sin(bearing),
        math.cos(bearing),
        0.0
    ]

    across = [
        math.cos(bearing),
        -math.sin(bearing),
        0.0
    ]

    center = [
        distance_m * along[0],
        distance_m * along[1],
        0.0
    ]

    vertices = []

    for z in [0.0, height_m]:
        for side_depth in [-1.0, 1.0]:
            for side_width in [-1.0, 1.0]:
                point = vec_add(
                    center,
                    vec_add(
                        vec_scale(
                            along,
                            side_depth
                            * obstacle_depth_m
                            / 2.0
                        ),
                        vec_scale(
                            across,
                            side_width
                            * obstacle_width_m
                            / 2.0
                        )
                    )
                )

                point[2] = z
                vertices.append(point)

    return vertices


def project_obstacle_shadow_3d(
    solar_azimuth_deg: float,
    solar_elevation_deg: float,
    obstacle_bearing_deg: float,
    obstacle_distance_m: float,
    obstacle_height_m: float,
    obstacle_width_m: float,
    obstacle_depth_m: float,
    panel_azimuth_deg: float,
    panel_tilt_deg: float,
    array_height_m: float
) -> Dict[str, Any]:
    """
    True 3D shadow projection.

    1. Construct the obstacle as a 3D rectangular prism.
    2. Construct the tilted PV plane.
    3. Cast rays from obstacle vertices opposite the sun vector.
    4. Intersect rays with the PV plane.
    5. Take the convex hull in PV-plane coordinates.
    """
    if solar_elevation_deg <= 0.0:
        return {
            "shadow_exists": False,
            "reason": "SUN_BELOW_HORIZON",
            "shadow_polygon": [],
            "shadow_polygon_enu": [],
            "projected_points": []
        }

    basis = pv_plane_basis(
        panel_azimuth_deg,
        panel_tilt_deg
    )

    u = basis["u"]
    v = basis["v"]
    n = basis["n"]

    plane_origin = [
        0.0,
        0.0,
        array_height_m
    ]

    sun_vector = solar_direction_vector(
        solar_azimuth_deg,
        solar_elevation_deg
    )

    # Shadow travels away from the sun.
    shadow_ray = vec_scale(
        sun_vector,
        -1.0
    )

    vertices = obstacle_vertices_3d(
        bearing_deg=obstacle_bearing_deg,
        distance_m=obstacle_distance_m,
        height_m=obstacle_height_m,
        obstacle_width_m=obstacle_width_m,
        obstacle_depth_m=obstacle_depth_m
    )

    projected_3d = []
    projected_uv = []

    for vertex in vertices:
        point = project_point_to_pv_plane(
            point=vertex,
            ray_direction=shadow_ray,
            plane_origin=plane_origin,
            plane_normal=n
        )

        if point is None:
            continue

        relative = vec_sub(
            point,
            plane_origin
        )

        u_coord = dot3(
            relative,
            u
        )

        v_coord = dot3(
            relative,
            v
        )

        projected_3d.append(point)
        projected_uv.append([
            u_coord,
            v_coord
        ])

    if len(projected_uv) < 3:
        return {
            "shadow_exists": False,
            "reason": "NO_VALID_RAY_PLANE_INTERSECTION",
            "shadow_polygon": [],
            "shadow_polygon_enu": [],
            "projected_points": []
        }

    hull_uv = convex_hull_2d(
        projected_uv
    )

    if len(hull_uv) < 3:
        return {
            "shadow_exists": False,
            "reason": "DEGENERATE_SHADOW_PROJECTION",
            "shadow_polygon": [],
            "shadow_polygon_enu": [],
            "projected_points": []
        }

    # Convert hull back to ENU for diagnostics.
    hull_enu = []

    for uv in hull_uv:
        point = vec_add(
            plane_origin,
            vec_add(
                vec_scale(u, uv[0]),
                vec_scale(v, uv[1])
            )
        )

        hull_enu.append([
            round(point[0], 4),
            round(point[1], 4),
            round(point[2], 4)
        ])

    projected_diagnostics = []

    for point, uv in zip(
        projected_3d,
        projected_uv
    ):
        projected_diagnostics.append({
            "enu": [
                round(point[0], 4),
                round(point[1], 4),
                round(point[2], 4)
            ],
            "pv_plane_uv": [
                round(uv[0], 4),
                round(uv[1], 4)
            ]
        })

    return {
        "shadow_exists": True,
        "reason": "3D_SHADOW_INTERSECTS_TILTED_PV_PLANE",
        "coordinate_system":
            "PV_PLANE_UV",
        "shadow_polygon": [
            [
                round(p[0], 4),
                round(p[1], 4)
            ]
            for p in hull_uv
        ],
        "shadow_polygon_enu":
            hull_enu,
        "projected_points":
            projected_diagnostics,
        "pv_plane": {
            "origin_enu": [
                round(x, 4)
                for x in plane_origin
            ],
            "normal_enu": [
                round(x, 6)
                for x in n
            ],
            "u_axis_enu": [
                round(x, 6)
                for x in u
            ],
            "v_axis_enu": [
                round(x, 6)
                for x in v
            ]
        },
        "shadow_area_on_pv_plane_m2":
            round(
                polygon_area_2d(hull_uv),
                4
            )
    }


def estimate_module_shading_3d(
    modules: List[Dict[str, Any]],
    module_width_m: float,
    module_height_m: float,
    array_width_m: float,
    array_depth_m: float,
    shadow_polygon_uv: List[List[float]]
) -> List[Dict[str, Any]]:
    """
    Calculate exact 2D polygon overlap after the shadow has
    already been projected onto the real tilted PV plane.
    """
    results = []

    for module in modules:
        module_polygon = module_polygon_uv(
            module,
            module_width_m,
            module_height_m,
            array_width_m,
            array_depth_m
        )

        module_area = (
            module_width_m
            * module_height_m
        )

        intersection_area = polygon_intersection_area(
            module_polygon,
            shadow_polygon_uv
        )

        fraction = clamp(
            intersection_area / module_area
            if module_area > 0
            else 0.0,
            0.0,
            1.0
        )

        if fraction >= 0.75:
            status = "FULLY_OR_MOSTLY_SHADED"
        elif fraction >= 0.20:
            status = "PARTIALLY_SHADED"
        elif fraction > 0.0:
            status = "LIGHTLY_SHADED"
        else:
            status = "UNSHADED"

        results.append({
            **module,
            "shading_status": status,
            "estimated_shaded_fraction":
                round(fraction, 4),
            "intersection_area_m2":
                round(intersection_area, 4)
        })

    return results


def calculate_array_shading(
    solar: Dict[str, float],
    bearing_deg: float,
    distance_m: float,
    height_m: float,
    modules_per_row: int,
    number_of_rows: int,
    module_width_m: float,
    module_height_m: float,
    row_spacing_m: float,
    array_height_m: float,
    obstacle_width_m: float,
    obstacle_depth_m: float,
    panel_azimuth_deg: float = DEFAULT_PANEL_AZIMUTH,
    panel_tilt_deg: float = DEFAULT_PANEL_TILT
) -> Dict[str, Any]:

    array_width = (
        modules_per_row
        * module_width_m
    )

    # row_spacing_m is the row-to-row module pitch (center-to-center).
    # Therefore the physical occupied depth is one module height plus
    # the pitch across the remaining row intervals.
    array_depth = (
        module_height_m
        + (number_of_rows - 1) * row_spacing_m
    )

    modules = build_pv_array(
        modules_per_row=modules_per_row,
        number_of_rows=number_of_rows,
        module_width_m=module_width_m,
        module_height_m=module_height_m,
        row_spacing_m=row_spacing_m,
        array_height_m=array_height_m,
        panel_azimuth_deg=panel_azimuth_deg,
        panel_tilt_deg=panel_tilt_deg
    )

    projection = project_obstacle_shadow_3d(
        solar_azimuth_deg=solar[
            "solar_azimuth_deg"
        ],
        solar_elevation_deg=solar[
            "solar_elevation_deg"
        ],
        obstacle_bearing_deg=bearing_deg,
        obstacle_distance_m=distance_m,
        obstacle_height_m=height_m,
        obstacle_width_m=obstacle_width_m,
        obstacle_depth_m=obstacle_depth_m,
        panel_azimuth_deg=panel_azimuth_deg,
        panel_tilt_deg=panel_tilt_deg,
        array_height_m=array_height_m
    )

    shadow_polygon = projection.get(
        "shadow_polygon",
        []
    )

    # Determine actual overlap with the finite PV array
    # in the tilted plane.
    array_min_u = -array_width / 2.0
    array_max_u = array_width / 2.0
    array_min_v = -array_depth / 2.0
    array_max_v = array_depth / 2.0

    array_polygon = [
        [array_min_u, array_min_v],
        [array_max_u, array_min_v],
        [array_max_u, array_max_v],
        [array_min_u, array_max_v]
    ]

    array_intersection_area = polygon_intersection_area(
        shadow_polygon,
        array_polygon
    )

    shadow_area = polygon_area_2d(
        shadow_polygon
    )

    shadow_intersects_array = (
        array_intersection_area > 1e-8
    )

    if not shadow_intersects_array:
        projection["shadow_exists"] = False
        projection["reason"] = (
            "SHADOW_MISSES_FINITE_PV_ARRAY"
        )

    module_results = estimate_module_shading_3d(
        modules=modules,
        module_width_m=module_width_m,
        module_height_m=module_height_m,
        array_width_m=array_width,
        array_depth_m=array_depth,
        shadow_polygon_uv=(
            shadow_polygon
            if shadow_intersects_array
            else []
        )
    )

    total_modules = len(
        module_results
    )

    shaded_modules = [
        module
        for module in module_results
        if module[
            "estimated_shaded_fraction"
        ] > 0
    ]

    significantly_shaded = [
        module
        for module in module_results
        if module[
            "estimated_shaded_fraction"
        ] >= 0.20
    ]

    total_shaded_fraction = 0.0

    if total_modules > 0:
        total_shaded_fraction = (
            sum(
                module[
                    "estimated_shaded_fraction"
                ]
                for module in module_results
            )
            / total_modules
        )

    if total_shaded_fraction <= 0.0:
        array_status = "NO_SHADOW"
    elif total_shaded_fraction < 0.20:
        array_status = "PARTIAL_ARRAY_SHADOW"
    elif total_shaded_fraction < 0.60:
        array_status = "SIGNIFICANT_ARRAY_SHADOW"
    else:
        array_status = "HIGH_ARRAY_SHADOW"

    projection["array_intersection_area_m2"] = round(
        array_intersection_area,
        4
    )

    projection["shadow_area_on_pv_plane_m2"] = round(
        shadow_area,
        4
    )

    projection["array_area_on_pv_plane_m2"] = round(
        array_width * array_depth,
        4
    )

    # The array footprint includes inter-row gaps, while module shading
    # is calculated only over physical module surfaces. Report both so
    # the distinction is explicit.
    total_module_surface_area = (
        total_modules
        * module_width_m
        * module_height_m
    )
    total_module_intersection_area = sum(
        module["intersection_area_m2"]
        for module in module_results
    )

    projection["module_surface_area_m2"] = round(
        total_module_surface_area,
        4
    )
    projection["module_intersection_area_m2"] = round(
        total_module_intersection_area,
        4
    )
    projection["uncovered_array_gap_area_m2"] = round(
        max(0.0, array_width * array_depth - total_module_surface_area),
        4
    )

    return {
        "array_status": array_status,

        "array_geometry": {
            "modules_per_row":
                modules_per_row,

            "number_of_rows":
                number_of_rows,

            "total_modules":
                total_modules,

            "module_width_m":
                module_width_m,

            "module_height_m":
                module_height_m,

            "row_spacing_m":
                row_spacing_m,

            "array_width_m":
                round(
                    array_width,
                    3
                ),

            "array_depth_m":
                round(
                    array_depth,
                    3
                ),

            "array_height_m":
                round(
                    array_height_m,
                    3
                ),

            "panel_azimuth_deg":
                round(
                    panel_azimuth_deg,
                    3
                ),

            "panel_tilt_deg":
                round(
                    panel_tilt_deg,
                    3
                )
        },

        "shadow_projection":
            projection,

        "shading_summary": {
            "total_modules":
                total_modules,

            "modules_with_any_estimated_shading":
                len(shaded_modules),

            "modules_with_significant_shading":
                len(significantly_shaded),

            "average_module_shaded_fraction":
                round(
                    total_shaded_fraction,
                    4
                ),

            "estimated_array_shading_percent":
                round(
                    total_shaded_fraction
                    * 100.0,
                    2
                )
        },

        "modules":
            module_results,

        "engineering_note": (
            "This version uses a true 3D obstacle "
            "footprint, sun-ray projection and "
            "intersection with the configured "
            "tilted PV plane. Module shading is "
            "computed from polygon overlap on that "
            "PV plane. It is still a geometric "
            "shading model: it does not yet model "
            "module electrical mismatch, bypass "
            "diodes, irradiance transposition or "
            "annual energy loss."
        )
    }



# INPUT PARSER
# ============================================================

def parse_geometry_inputs(
    payload: Dict[str, Any]
) -> Dict[str, Any]:

    latitude = safe_float(
        payload.get(
            "latitude",
            DEFAULT_SITE_LATITUDE
        )
    )

    longitude = safe_float(
        payload.get(
            "longitude",
            DEFAULT_SITE_LONGITUDE
        )
    )

    timezone_offset = safe_float(
        payload.get(
            "timezone_offset_hours",
            DEFAULT_TIMEZONE_OFFSET
        )
    )

    bearing = normalize_azimuth(
        safe_float(
            payload.get(
                "bearing_deg",
                DEFAULT_OBSTACLE_BEARING
            )
        )
    )

    distance = max(
        0.001,
        safe_float(
            payload.get(
                "distance_m",
                DEFAULT_OBSTACLE_DISTANCE
            )
        )
    )

    height = max(
        0.0,
        safe_float(
            payload.get(
                "height_m",
                DEFAULT_OBSTACLE_HEIGHT
            )
        )
    )

    obstacle_width = max(
        0.1,
        safe_float(
            payload.get(
                "obstacle_width_m",
                DEFAULT_OBSTACLE_WIDTH_M
            )
        )
    )

    obstacle_depth = max(
        0.1,
        safe_float(
            payload.get(
                "obstacle_depth_m",
                DEFAULT_OBSTACLE_DEPTH_M
            )
        )
    )

    panel_azimuth = normalize_azimuth(
        safe_float(
            payload.get(
                "panel_azimuth",
                DEFAULT_PANEL_AZIMUTH
            )
        )
    )

    panel_tilt = clamp(
        safe_float(
            payload.get(
                "panel_tilt",
                DEFAULT_PANEL_TILT
            )
        ),
        0.0,
        90.0
    )

    modules_per_row = max(
        1,
        safe_int(
            payload.get(
                "modules_per_row",
                DEFAULT_MODULES_PER_ROW
            ),
            DEFAULT_MODULES_PER_ROW
        )
    )

    number_of_rows = max(
        1,
        safe_int(
            payload.get(
                "number_of_rows",
                DEFAULT_NUMBER_OF_ROWS
            ),
            DEFAULT_NUMBER_OF_ROWS
        )
    )

    module_width = max(
        0.01,
        safe_float(
            payload.get(
                "module_width_m",
                DEFAULT_MODULE_WIDTH_M
            )
        )
    )

    module_height = max(
        0.01,
        safe_float(
            payload.get(
                "module_height_m",
                DEFAULT_MODULE_HEIGHT_M
            )
        )
    )

    row_spacing = max(
        0.01,
        safe_float(
            payload.get(
                "row_spacing_m",
                DEFAULT_ROW_SPACING_M
            )
        )
    )

    array_height = max(
        0.0,
        safe_float(
            payload.get(
                "array_height_m",
                DEFAULT_ARRAY_HEIGHT_M
            )
        )
    )

    alignment_tolerance = clamp(
        safe_float(
            payload.get(
                "alignment_tolerance_deg",
                DEFAULT_ALIGNMENT_TOLERANCE
            )
        ),
        0.0,
        90.0
    )

    return {

        "latitude": latitude,

        "longitude": longitude,

        "timezone_offset": (
            timezone_offset
        ),

        "bearing": bearing,

        "distance": distance,

        "height": height,

        "obstacle_width": (
            obstacle_width
        ),

        "obstacle_depth": (
            obstacle_depth
        ),

        "panel_azimuth": (
            panel_azimuth
        ),

        "panel_tilt": (
            panel_tilt
        ),

        "modules_per_row": (
            modules_per_row
        ),

        "number_of_rows": (
            number_of_rows
        ),

        "module_width": (
            module_width
        ),

        "module_height": (
            module_height
        ),

        "row_spacing": (
            row_spacing
        ),

        "array_height": (
            array_height
        ),

        "alignment_tolerance": (
            alignment_tolerance
        )
    }


# ============================================================
# SINGLE GEOMETRY ENDPOINT
# ============================================================

@app.post(
    "/api/shadow/geometry/calculate"
)
async def calculate_geometry(
    payload: Dict[str, Any]
):

    inputs = parse_geometry_inputs(
        payload
    )

    date_string = payload.get(
        "date",
        "2026-09-29"
    )

    time_string = payload.get(
        "time",
        "08:00"
    )

    try:

        local_date = date.fromisoformat(
            date_string
        )

        local_time = time.fromisoformat(
            time_string
        )

    except Exception as e:

        return {
            "service":
                "SolarIQ+ Shadow Vision Analysis",

            "status":
                "error",

            "message":
                str(e)
        }

    solar = solar_position(
        latitude=inputs["latitude"],

        longitude=inputs["longitude"],

        local_date=local_date,

        local_time=local_time,

        timezone_offset_hours=(
            inputs["timezone_offset"]
        )
    )

    shadow = calculate_shadow_geometry(
        solar=solar,

        bearing_deg=inputs["bearing"],

        distance_m=inputs["distance"],

        height_m=inputs["height"],

        panel_azimuth=(
            inputs["panel_azimuth"]
        ),

        panel_tilt=(
            inputs["panel_tilt"]
        ),

        alignment_tolerance=(
            inputs["alignment_tolerance"]
        )
    )

    return {

        "service":
            "SolarIQ+ Shadow Vision Analysis",

        "status":
            "completed",

        "inputs": {

            "latitude":
                inputs["latitude"],

            "longitude":
                inputs["longitude"],

            "timezone_offset_hours":
                inputs["timezone_offset"],

            "date":
                date_string,

            "time":
                time_string,

            "obstacle": {

                "bearing_deg":
                    inputs["bearing"],

                "distance_m":
                    inputs["distance"],

                "height_m":
                    inputs["height"]
            },

            "panel": {

                "azimuth_deg":
                    inputs["panel_azimuth"],

                "tilt_deg":
                    inputs["panel_tilt"]
            }
        },

        "solar_position":
            solar,

        "shadow_geometry":
            shadow
    }


# ============================================================
# DAILY GEOMETRY ENDPOINT
# ============================================================

@app.post(
    "/api/shadow/geometry/day-calculate"
)
async def calculate_day_geometry(
    payload: Dict[str, Any]
):

    inputs = parse_geometry_inputs(
        payload
    )

    date_string = payload.get(
        "date"
    )

    if not date_string:

        return {
            "service":
                "SolarIQ+ Shadow Vision Analysis",

            "status":
                "error",

            "message":
                "date is required."
        }

    try:

        local_date = date.fromisoformat(
            date_string
        )

    except Exception:

        return {
            "service":
                "SolarIQ+ Shadow Vision Analysis",

            "status":
                "error",

            "message":
                "Invalid date. Use YYYY-MM-DD."
        }

    start_string = payload.get(
        "start_time",
        "08:00"
    )

    end_string = payload.get(
        "end_time",
        "17:00"
    )

    interval_minutes = max(
        1,
        safe_int(
            payload.get(
                "interval_minutes",
                30
            ),
            30
        )
    )

    try:

        start_time = time.fromisoformat(
            start_string
        )

        end_time = time.fromisoformat(
            end_string
        )

    except Exception:

        return {
            "service":
                "SolarIQ+ Shadow Vision Analysis",

            "status":
                "error",

            "message":
                "Invalid start_time/end_time."
        }

    start_minutes = (
        start_time.hour * 60
        + start_time.minute
    )

    end_minutes = (
        end_time.hour * 60
        + end_time.minute
    )

    if start_minutes > end_minutes:

        return {
            "service":
                "SolarIQ+ Shadow Vision Analysis",

            "status":
                "error",

            "message":
                "start_time must be before end_time."
        }

    results = []

    current = start_minutes

    while current <= end_minutes:

        current_time = time(
            hour=current // 60,
            minute=current % 60
        )

        solar = solar_position(
            latitude=inputs["latitude"],

            longitude=inputs["longitude"],

            local_date=local_date,

            local_time=current_time,

            timezone_offset_hours=(
                inputs["timezone_offset"]
            )
        )

        shadow = calculate_shadow_geometry(
            solar=solar,

            bearing_deg=inputs["bearing"],

            distance_m=inputs["distance"],

            height_m=inputs["height"],

            panel_azimuth=(
                inputs["panel_azimuth"]
            ),

            panel_tilt=(
                inputs["panel_tilt"]
            ),

            alignment_tolerance=(
                inputs["alignment_tolerance"]
            )
        )

        results.append({

            "time":
                current_time.strftime(
                    "%H:%M"
                ),

            "solar_position":
                solar,

            "shadow_geometry":
                shadow
        })

        current += interval_minutes

    impact_times = [
        item
        for item in results
        if item[
            "shadow_geometry"
        ][
            "status"
        ]
        in [
            "REFERENCE_POINT_IMPACT",
            "POTENTIAL_PARTIAL_ARRAY_IMPACT",
            "POTENTIAL_GEOMETRIC_INTERFERENCE"
        ]
    ]

    return {

        "service":
            "SolarIQ+ Shadow Vision Analysis",

        "status":
            "completed",

        "inputs": {

            "date":
                date_string,

            "start_time":
                start_string,

            "end_time":
                end_string,

            "interval_minutes":
                interval_minutes,

            "obstacle": {

                "bearing_deg":
                    inputs["bearing"],

                "distance_m":
                    inputs["distance"],

                "height_m":
                    inputs["height"]
            }
        },

        "daily_summary": {

            "total_time_points":
                len(results),

            "timeline":
                timeline,

            "potential_impact_time_points":
                len(impact_times),

            "impact_times":
                [
                    item["time"]
                    for item in impact_times
                ]
        },

        "results":
            results
    }


# ============================================================
# SINGLE ARRAY GEOMETRY ENDPOINT
# ============================================================

@app.post(
    "/api/shadow/geometry/array-calculate"
)
async def calculate_array_geometry(
    payload: Dict[str, Any]
):

    inputs = parse_geometry_inputs(
        payload
    )

    date_string = payload.get(
        "date",
        "2026-09-29"
    )

    time_string = payload.get(
        "time",
        "08:00"
    )

    try:

        local_date = date.fromisoformat(
            date_string
        )

        local_time = time.fromisoformat(
            time_string
        )

    except Exception as e:

        return {
            "service":
                "SolarIQ+ Shadow Vision Analysis",

            "status":
                "error",

            "message":
                str(e)
        }

    solar = solar_position(
        latitude=inputs["latitude"],

        longitude=inputs["longitude"],

        local_date=local_date,

        local_time=local_time,

        timezone_offset_hours=(
            inputs["timezone_offset"]
        )
    )

    shadow = calculate_shadow_geometry(
        solar=solar,

        bearing_deg=inputs["bearing"],

        distance_m=inputs["distance"],

        height_m=inputs["height"],

        panel_azimuth=(
            inputs["panel_azimuth"]
        ),

        panel_tilt=(
            inputs["panel_tilt"]
        ),

        alignment_tolerance=(
            inputs["alignment_tolerance"]
        )
    )

    array = calculate_array_shading(
        solar=solar,

        bearing_deg=inputs["bearing"],

        distance_m=inputs["distance"],

        height_m=inputs["height"],

        modules_per_row=(
            inputs["modules_per_row"]
        ),

        number_of_rows=(
            inputs["number_of_rows"]
        ),

        module_width_m=(
            inputs["module_width"]
        ),

        module_height_m=(
            inputs["module_height"]
        ),

        row_spacing_m=(
            inputs["row_spacing"]
        ),

        array_height_m=(
            inputs["array_height"]
        ),

        panel_azimuth_deg=(
            inputs["panel_azimuth"]
        ),

        panel_tilt_deg=(
            inputs["panel_tilt"]
        ),

        obstacle_width_m=(
            inputs["obstacle_width"]
        ),

        obstacle_depth_m=(
            inputs["obstacle_depth"]
        )
    )

    return {

        "service":
            "SolarIQ+ Shadow Vision Analysis",

        "status":
            "completed",

        "inputs": {

            "latitude":
                inputs["latitude"],

            "longitude":
                inputs["longitude"],

            "timezone_offset_hours":
                inputs["timezone_offset"],

            "date":
                date_string,

            "time":
                time_string,

            "obstacle": {

                "bearing_deg":
                    inputs["bearing"],

                "distance_m":
                    inputs["distance"],

                "height_m":
                    inputs["height"],

                "width_m":
                    inputs["obstacle_width"],

                "depth_m":
                    inputs["obstacle_depth"]
            },

            "panel": {

                "azimuth_deg":
                    inputs["panel_azimuth"],

                "tilt_deg":
                    inputs["panel_tilt"]
            }
        },

        "solar_position":
            solar,

        "reference_point_geometry":
            shadow,

        "pv_array_analysis":
            array
    }


# ============================================================
# DAILY ARRAY GEOMETRY
# ============================================================

@app.post(
    "/api/shadow/geometry/array-day-calculate"
)
async def calculate_array_day(
    payload: Dict[str, Any]
):

    inputs = parse_geometry_inputs(
        payload
    )

    date_string = payload.get(
        "date"
    )

    if not date_string:

        return {
            "service":
                "SolarIQ+ Shadow Vision Analysis",

            "status":
                "error",

            "message":
                "date is required."
        }

    try:

        local_date = date.fromisoformat(
            date_string
        )

    except Exception:

        return {
            "service":
                "SolarIQ+ Shadow Vision Analysis",

            "status":
                "error",

            "message":
                "Invalid date. Use YYYY-MM-DD."
        }

    start_string = payload.get(
        "start_time",
        "08:00"
    )

    end_string = payload.get(
        "end_time",
        "17:00"
    )

    interval_minutes = max(
        1,
        safe_int(
            payload.get(
                "interval_minutes",
                30
            ),
            30
        )
    )

    try:

        start_time = time.fromisoformat(
            start_string
        )

        end_time = time.fromisoformat(
            end_string
        )

    except Exception:

        return {
            "service":
                "SolarIQ+ Shadow Vision Analysis",

            "status":
                "error",

            "message":
                "Invalid start_time/end_time."
        }

    start_minutes = (
        start_time.hour * 60
        + start_time.minute
    )

    end_minutes = (
        end_time.hour * 60
        + end_time.minute
    )

    if start_minutes > end_minutes:

        return {
            "service":
                "SolarIQ+ Shadow Vision Analysis",

            "status":
                "error",

            "message":
                "start_time must be before end_time."
        }

    results = []

    current = start_minutes

    while current <= end_minutes:

        current_time = time(
            hour=current // 60,
            minute=current % 60
        )

        solar = solar_position(
            latitude=inputs["latitude"],

            longitude=inputs["longitude"],

            local_date=local_date,

            local_time=current_time,

            timezone_offset_hours=(
                inputs["timezone_offset"]
            )
        )

        array = calculate_array_shading(
            solar=solar,

            bearing_deg=inputs["bearing"],

            distance_m=inputs["distance"],

            height_m=inputs["height"],

            modules_per_row=(
                inputs["modules_per_row"]
            ),

            number_of_rows=(
                inputs["number_of_rows"]
            ),

            module_width_m=(
                inputs["module_width"]
            ),

            module_height_m=(
                inputs["module_height"]
            ),

            row_spacing_m=(
                inputs["row_spacing"]
            ),

            array_height_m=(
                inputs["array_height"]
            ),

            panel_azimuth_deg=(
                inputs["panel_azimuth"]
            ),

            panel_tilt_deg=(
                inputs["panel_tilt"]
            ),

            obstacle_width_m=(
                inputs["obstacle_width"]
            ),

            obstacle_depth_m=(
                inputs["obstacle_depth"]
            )
        )

        results.append({

            "time":
                current_time.strftime(
                    "%H:%M"
                ),

            "solar_position":
                solar,

            "array_status":
                array["array_status"],

            "shading_summary":
                array["shading_summary"],

            "shadow_projection":
                array["shadow_projection"],

            "modules":
                array["modules"]
        })

        current += interval_minutes

    # --------------------------------------------------------
    # Compact timeline for day-level validation
    # --------------------------------------------------------

    timeline = []

    for item in results:

        solar = item["solar_position"]
        summary = item["shading_summary"]
        projection = item["shadow_projection"]

        timeline.append({

            "time": item["time"],

            "solar_elevation_deg": round(
                solar["solar_elevation_deg"], 2
            ),

            "solar_azimuth_deg": round(
                solar["solar_azimuth_deg"], 2
            ),

            "shadow_exists": projection["shadow_exists"],

            "array_status": item["array_status"],

            "modules_with_any_shading": summary[
                "modules_with_any_estimated_shading"
            ],

            "modules_with_significant_shading": summary[
                "modules_with_significant_shading"
            ],

            "array_shading_percent": round(
                summary["estimated_array_shading_percent"],
                2
            ),

            "average_module_shaded_fraction": round(
                summary["average_module_shaded_fraction"],
                4
            )
        })

    # --------------------------------------------------------
    # Daily summary
    # --------------------------------------------------------

    impact_results = [
        item
        for item in results
        if item[
            "shading_summary"
        ][
            "estimated_array_shading_percent"
        ] > 0
    ]

    significant_results = [
        item
        for item in results
        if item[
            "shading_summary"
        ][
            "estimated_array_shading_percent"
        ] >= 20.0
    ]

    maximum_shading = 0.0
    maximum_time = None

    if results:

        maximum_item = max(
            results,
            key=lambda item:
                item[
                    "shading_summary"
                ][
                    "estimated_array_shading_percent"
                ]
        )

        maximum_shading = (
            maximum_item[
                "shading_summary"
            ][
                "estimated_array_shading_percent"
            ]
        )

        maximum_time = (
            maximum_item["time"]
        )

    return {

        "service":
            "SolarIQ+ Shadow Vision Analysis",

        "status":
            "completed",

        "inputs": {

            "latitude":
                inputs["latitude"],

            "longitude":
                inputs["longitude"],

            "timezone_offset_hours":
                inputs["timezone_offset"],

            "date":
                date_string,

            "obstacle": {

                "bearing_deg":
                    inputs["bearing"],

                "distance_m":
                    inputs["distance"],

                "height_m":
                    inputs["height"],

                "width_m":
                    inputs["obstacle_width"],

                "depth_m":
                    inputs["obstacle_depth"]
            },

            "panel": {

                "azimuth_deg":
                    inputs["panel_azimuth"],

                "tilt_deg":
                    inputs["panel_tilt"]
            },

            "array": {

                "modules_per_row":
                    inputs["modules_per_row"],

                "number_of_rows":
                    inputs["number_of_rows"],

                "module_width_m":
                    inputs["module_width"],

                "module_height_m":
                    inputs["module_height"],

                "row_spacing_m":
                    inputs["row_spacing"],

                "array_height_m":
                    inputs["array_height"]
            },

            "time_range": {

                "start_time":
                    start_string,

                "end_time":
                    end_string,

                "interval_minutes":
                    interval_minutes
            }
        },

        "daily_summary": {

            "total_time_points":
                len(results),

            "times_with_any_estimated_array_shading":
                len(impact_results),

            "times_with_significant_estimated_shading":
                len(significant_results),

            "maximum_estimated_array_shading_percent":
                round(
                    maximum_shading,
                    2
                ),

            "maximum_shading_time":
                maximum_time,

            "impact_times":
                [
                    item["time"]
                    for item in impact_results
                ]
        },

        "results":
            results,

        "engineering_note": (
            "This is a first-stage PV-array "
            "screening calculation. The "
            "current shadow footprint and "
            "module intersection model are "
            "simplified. It does not yet "
            "calculate irradiance loss, "
            "bypass-diode behavior, "
            "electrical mismatch, row-to-row "
            "self-shading, annual energy loss "
            "or financial loss."
        )
    }


# ============================================================
# HEALTH
# ============================================================

@app.get(
    "/api/shadow/vision/health"
)
async def health():

    return {

        "service":
            "SolarIQ+ Shadow Vision Analysis",

        "status":
            "healthy",

        "model":
            MODEL_NAME,

        "model_loaded":
            model is not None,

        "solar_convention": {
            "azimuth_reference":
                "clockwise from North",

            "north_deg":
                0,

            "east_deg":
                90,

            "south_deg":
                180,

            "west_deg":
                270
        },

        "default_site": {

            "latitude":
                DEFAULT_SITE_LATITUDE,

            "longitude":
                DEFAULT_SITE_LONGITUDE,

            "timezone_offset_hours":
                DEFAULT_TIMEZONE_OFFSET
        },

        "default_panel": {

            "azimuth_deg":
                DEFAULT_PANEL_AZIMUTH,

            "tilt_deg":
                DEFAULT_PANEL_TILT
        },

        "default_obstacle": {

            "bearing_deg":
                DEFAULT_OBSTACLE_BEARING,

            "distance_m":
                DEFAULT_OBSTACLE_DISTANCE,

            "height_m":
                DEFAULT_OBSTACLE_HEIGHT,

            "width_m":
                DEFAULT_OBSTACLE_WIDTH_M,

            "depth_m":
                DEFAULT_OBSTACLE_DEPTH_M
        },

        "default_array": {

            "modules_per_row":
                DEFAULT_MODULES_PER_ROW,

            "number_of_rows":
                DEFAULT_NUMBER_OF_ROWS,

            "module_width_m":
                DEFAULT_MODULE_WIDTH_M,

            "module_height_m":
                DEFAULT_MODULE_HEIGHT_M,

            "row_spacing_m":
                DEFAULT_ROW_SPACING_M,

            "array_height_m":
                DEFAULT_ARRAY_HEIGHT_M
        }
    }


# ============================================================
# ROOT
# ============================================================

@app.get(
    "/api/shadow/vision/"
)
async def root():

    return {

        "service":
            "SolarIQ+ Shadow Vision Analysis",

        "status":
            "running",

        "version":
            "4.0.0",

        "endpoints": {

            "health":
                "/api/shadow/vision/health",

            "vision_analysis":
                "/api/shadow/vision/analyze",

            "single_geometry":
                "/api/shadow/geometry/calculate",

            "daily_geometry":
                "/api/shadow/geometry/day-calculate",

            "single_array":
                "/api/shadow/geometry/array-calculate",

            "daily_array":
                "/api/shadow/geometry/array-day-calculate",

            "docs":
                "/docs"
        }
    }


# ============================================================
# START SERVER
# ============================================================

if __name__ == "__main__":

    import uvicorn

    print()
    print("=" * 70)
    print(
        "SolarIQ+ Shadow Vision + PV Array Shading Server"
    )
    print("=" * 70)

    print(
        f"Model: {MODEL_NAME}"
    )

    print(
        "Solar azimuth convention: "
        "0° North | 90° East | "
        "180° South | 270° West"
    )

    print(
        f"Panel: "
        f"azimuth={DEFAULT_PANEL_AZIMUTH}°, "
        f"tilt={DEFAULT_PANEL_TILT}°"
    )

    print(
        "Test Array: "
        f"{DEFAULT_MODULES_PER_ROW} modules/row × "
        f"{DEFAULT_NUMBER_OF_ROWS} rows"
    )

    print(
        f"Module: "
        f"{DEFAULT_MODULE_WIDTH_M}m × "
        f"{DEFAULT_MODULE_HEIGHT_M}m"
    )

    print(
        f"Row spacing: "
        f"{DEFAULT_ROW_SPACING_M}m"
    )

    print(
        f"Test obstacle: "
        f"bearing={DEFAULT_OBSTACLE_BEARING}°, "
        f"distance={DEFAULT_OBSTACLE_DISTANCE}m, "
        f"height={DEFAULT_OBSTACLE_HEIGHT}m"
    )

    print("=" * 70)
    print()

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8003
    )