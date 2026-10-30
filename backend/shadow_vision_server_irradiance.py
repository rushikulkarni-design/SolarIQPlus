import io
import math
from datetime import date, time
from typing import Optional, Dict, List, Any

import numpy as np
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

try:
    from ultralytics import YOLOWorld
except Exception:
    YOLOWorld = None


# ============================================================
# SolarIQ+ Shadow Vision + PV Array Shading Server
# ============================================================

app = FastAPI(
    title="SolarIQ+ Shadow Vision Analysis",
    version="4.1.0"
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
    if YOLOWorld is not None:
        model = YOLOWorld(MODEL_NAME)
        print(f"[OK] YOLOWorld model loaded: {MODEL_NAME}")
    else:
        model = None
        print("[WARN] Ultralytics YOLOWorld unavailable")
except Exception as e:
    model = None
    print(f"[WARN] YOLOWorld model load failed: {e}")


# ============================================================
# PROJECT DEFAULTS
# ============================================================

# These are project/test defaults.
# They are configurable API inputs.

DEFAULT_SITE_LATITUDE = 19.8762
DEFAULT_SITE_LONGITUDE = 75.3433
DEFAULT_TIMEZONE_OFFSET = 5.5

DEFAULT_PANEL_AZIMUTH = 180.0
DEFAULT_PANEL_TILT = 20.0


# ============================================================
# PV ARRAY DEFAULTS
# ============================================================

DEFAULT_MODULES_PER_ROW = 8
DEFAULT_NUMBER_OF_ROWS = 4

DEFAULT_MODULE_WIDTH_M = 2.0
DEFAULT_MODULE_HEIGHT_M = 1.0

# Center-to-center row pitch
DEFAULT_ROW_SPACING_M = 1.2

DEFAULT_ARRAY_HEIGHT_M = 1.0


# ============================================================
# OBSTACLE DEFAULTS
# ============================================================

DEFAULT_OBSTACLE_BEARING = 90.0
DEFAULT_OBSTACLE_DISTANCE = 25.0
DEFAULT_OBSTACLE_HEIGHT = 12.0

# Test assumptions.
# Eventually these should come from confirmed site measurements.
DEFAULT_OBSTACLE_WIDTH_M = 10.0
DEFAULT_OBSTACLE_DEPTH_M = 5.0


# ============================================================
# SHADOW SETTINGS
# ============================================================

DEFAULT_ALIGNMENT_TOLERANCE = 15.0
PARTIAL_ARRAY_ALIGNMENT_TOLERANCE = 30.0


# ============================================================
# VISION SETTINGS
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


# ============================================================
# CONFIGURE YOLO WORLD CLASSES ONCE
# ============================================================
#
# YOLOWorld uses one shared model instance. Configure the
# vocabulary once during application startup instead of
# mutating the model for every uploaded image.
#
if model is not None:
    try:
        model.set_classes(VISION_CLASSES)
        print(
            f"[OK] YOLOWorld classes configured: "
            f"{len(VISION_CLASSES)} classes"
        )
    except Exception as e:
        print(
            f"[WARN] YOLOWorld class configuration failed: {e}"
        )


# ============================================================
# GENERAL HELPERS
# ============================================================

def clamp(value, minimum, maximum):
    return max(minimum, min(maximum, value))


def safe_float(value, default=0.0):
    try:
        return float(value)
    except Exception:
        return float(default)


def safe_int(value, default=0):
    try:
        return int(value)
    except Exception:
        return int(default)


def normalize_azimuth(value):
    return float(value) % 360.0


def angular_difference_deg(a, b):
    difference = abs(
        normalize_azimuth(a)
        - normalize_azimuth(b)
    )

    return min(
        difference,
        360.0 - difference
    )


# ============================================================
# 3D VECTOR HELPERS
# ============================================================

def vec_add(a, b):
    return [
        a[i] + b[i]
        for i in range(3)
    ]


def vec_sub(a, b):
    return [
        a[i] - b[i]
        for i in range(3)
    ]


def vec_scale(a, scalar):
    return [
        value * scalar
        for value in a
    ]


def dot3(a, b):
    return (
        a[0] * b[0]
        + a[1] * b[1]
        + a[2] * b[2]
    )


def cross3(a, b):
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]


def norm3(vector):
    return math.sqrt(
        dot3(vector, vector)
    )


def normalize3(vector):
    magnitude = norm3(vector)

    if magnitude <= 1e-12:
        return [0.0, 0.0, 0.0]

    return [
        value / magnitude
        for value in vector
    ]


# ============================================================
# SOLAR POSITION
# ============================================================

def solar_position(
    latitude,
    longitude,
    local_date,
    local_time,
    timezone_offset_hours
):
    """
    NOAA fractional-year solar position.

    Azimuth convention:
        0   = North
        90  = East
        180 = South
        270 = West
    """

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

    time_offset = (
        equation_of_time
        + 4.0 * longitude
        - 60.0 * timezone_offset_hours
    )

    true_solar_time_minutes = (
        local_decimal_hour * 60.0
        + time_offset
    )

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

    solar_azimuth_deg = normalize_azimuth(
        math.degrees(azimuth_rad)
        + 180.0
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
# REFERENCE-POINT SHADOW GEOMETRY
# ============================================================

def calculate_shadow_geometry(
    solar,
    bearing_deg,
    distance_m,
    height_m,
    panel_azimuth,
    panel_tilt,
    alignment_tolerance
):
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
        and obstacle_angle >= solar_elevation
    )

    alignment_factor = clamp(
        1.0 - alignment / 90.0,
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

        "obstacle_bearing_deg":
            round(bearing, 2),

        "obstacle_distance_m":
            round(distance_m, 2),

        "obstacle_height_m":
            round(height_m, 2),

        "obstacle_elevation_angle_deg":
            round(obstacle_angle, 2),

        "shadow_length_m":
            (
                round(shadow_length, 2)
                if math.isfinite(shadow_length)
                else None
            ),

        "azimuth_alignment_deg":
            round(alignment, 2),

        "directionally_aligned":
            directionally_aligned,

        "partial_array_alignment":
            partial_alignment,

        "reaches_reference_point":
            reaches_reference,

        "angularly_blocks_sun":
            angular_block,

        "alignment_factor":
            round(alignment_factor, 3),

        "vertical_blocking_margin_deg":
            round(vertical_margin, 2),

        "panel_azimuth_deg":
            round(panel_azimuth, 2),

        "panel_tilt_deg":
            round(panel_tilt, 2)
    }


# ============================================================
# PV PLANE BASIS
# ============================================================

def pv_plane_basis(
    panel_azimuth_deg,
    panel_tilt_deg
):
    """
    Local ENU:
        x = East
        y = North
        z = Up

    u = across-panel axis
    v = up-slope panel axis
    n = panel normal
    """

    azimuth = math.radians(
        normalize_azimuth(
            panel_azimuth_deg
        )
    )

    tilt = math.radians(
        clamp(
            panel_tilt_deg,
            0.0,
            90.0
        )
    )

    u = normalize3([
        math.cos(azimuth),
        -math.sin(azimuth),
        0.0
    ])

    v = normalize3([
        -math.cos(tilt)
        * math.sin(azimuth),

        -math.cos(tilt)
        * math.cos(azimuth),

        math.sin(tilt)
    ])

    n = normalize3(
        cross3(v, u)
    )

    return {
        "u": u,
        "v": v,
        "n": n
    }


# ============================================================
# SUN VECTOR
# ============================================================

def solar_direction_vector(
    solar_azimuth_deg,
    solar_elevation_deg
):
    azimuth = math.radians(
        solar_azimuth_deg
    )

    elevation = math.radians(
        solar_elevation_deg
    )

    horizontal = math.cos(
        elevation
    )

    return normalize3([
        horizontal * math.sin(azimuth),
        horizontal * math.cos(azimuth),
        math.sin(elevation)
    ])


# ============================================================
# RAY / PLANE INTERSECTION
# ============================================================

def project_point_to_pv_plane(
    point,
    ray_direction,
    plane_origin,
    plane_normal
):
    denominator = dot3(
        plane_normal,
        ray_direction
    )

    if abs(denominator) <= 1e-10:
        return None

    numerator = dot3(
        plane_normal,
        vec_sub(
            plane_origin,
            point
        )
    )

    t = numerator / denominator

    if t < -1e-8:
        return None

    return vec_add(
        point,
        vec_scale(
            ray_direction,
            t
        )
    )


# ============================================================
# CONVEX HULL
# ============================================================

def convex_hull_2d(points):
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

    def cross(o, a, b):
        return (
            (a[0] - o[0])
            * (b[1] - o[1])
            -
            (a[1] - o[1])
            * (b[0] - o[0])
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

    return [
        [p[0], p[1]]
        for p in (
            lower[:-1]
            + upper[:-1]
        )
    ]


# ============================================================
# POLYGON AREA
# ============================================================

def polygon_area_2d(polygon):

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


# ============================================================
# SUTHERLAND-HODGMAN CLIPPING
# ============================================================

def clip_polygon_against_edge(
    polygon,
    edge_start,
    edge_end
):

    if not polygon:
        return []

    ex = (
        edge_end[0]
        - edge_start[0]
    )

    ey = (
        edge_end[1]
        - edge_start[1]
    )

    def inside(point):

        return (
            ex
            * (
                point[1]
                - edge_start[1]
            )
            -
            ey
            * (
                point[0]
                - edge_start[0]
            )
        ) >= -1e-10

    def intersection(a, b):

        dx = b[0] - a[0]
        dy = b[1] - a[1]

        denominator = (
            ex * dy
            - ey * dx
        )

        if abs(denominator) <= 1e-12:
            return b[:]

        t = (
            ex
            * (
                edge_start[1]
                - a[1]
            )
            -
            ey
            * (
                edge_start[0]
                - a[0]
            )
        ) / denominator

        return [
            a[0] + t * dx,
            a[1] + t * dy
        ]

    output = []

    previous = polygon[-1]

    previous_inside = inside(
        previous
    )

    for current in polygon:

        current_inside = inside(
            current
        )

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


# ============================================================
# POLYGON INTERSECTION AREA
# ============================================================

def polygon_intersection_area(
    subject_polygon,
    clip_polygon
):

    if (
        len(subject_polygon) < 3
        or len(clip_polygon) < 3
    ):
        return 0.0

    clip_area_signed = 0.0

    for i in range(len(clip_polygon)):

        x1, y1 = clip_polygon[i]

        x2, y2 = clip_polygon[
            (i + 1) % len(clip_polygon)
        ]

        clip_area_signed += (
            x1 * y2
            - x2 * y1
        )

    if clip_area_signed < 0:

        clip_polygon = list(
            reversed(clip_polygon)
        )

    result = [
        p[:]
        for p in subject_polygon
    ]

    for i in range(len(clip_polygon)):

        result = clip_polygon_against_edge(
            result,
            clip_polygon[i],
            clip_polygon[
                (i + 1)
                % len(clip_polygon)
            ]
        )

        if len(result) < 3:
            return 0.0

    return polygon_area_2d(
        result
    )


# ============================================================
# BUILD PV ARRAY
# ============================================================

def build_pv_array(
    modules_per_row,
    number_of_rows,
    module_width_m,
    module_height_m,
    row_spacing_m,
    array_height_m,
    panel_azimuth_deg,
    panel_tilt_deg
):

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

    # IMPORTANT:
    #
    # row_spacing_m = center-to-center
    # row pitch.
    #
    # Therefore:
    #
    # depth =
    # module height
    # + (rows - 1) * row pitch
    #
    array_depth = (
        module_height_m
        + (
            number_of_rows - 1
        )
        * row_spacing_m
    )

    modules = []

    for row in range(
        number_of_rows
    ):

        v_center = (
            -array_depth / 2.0
            + module_height_m / 2.0
            + row * row_spacing_m
        )

        for column in range(
            modules_per_row
        ):

            u_center = (
                -array_width / 2.0
                + (
                    column + 0.5
                )
                * module_width_m
            )

            center = vec_add(
                [
                    0.0,
                    0.0,
                    array_height_m
                ],
                vec_add(
                    vec_scale(
                        u,
                        u_center
                    ),
                    vec_scale(
                        v,
                        v_center
                    )
                )
            )

            modules.append({

                "module_id":
                    f"R{row + 1}C{column + 1}",

                "row":
                    row + 1,

                "column":
                    column + 1,

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

                "center_3d": [
                    round(center[0], 4),
                    round(center[1], 4),
                    round(center[2], 4)
                ]
            })

    return modules


# ============================================================
# MODULE POLYGON
# ============================================================

def module_polygon_uv(
    module,
    module_width_m,
    module_height_m,
    array_width_m,
    array_depth_m
):

    # x_m and y_m are stored relative to
    # the lower-left array layout origin.
    #
    # Convert them back to the same centered
    # UV coordinate system used by the shadow.

    u_center = (
        module["x_m"]
        - array_width_m / 2.0
    )

    v_center = (
        module["y_m"]
        - array_depth_m / 2.0
    )

    half_u = (
        module_width_m / 2.0
    )

    half_v = (
        module_height_m / 2.0
    )

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


# ============================================================
# OBSTACLE 3D VERTICES
# ============================================================

def obstacle_vertices_3d(
    bearing_deg,
    distance_m,
    height_m,
    obstacle_width_m,
    obstacle_depth_m
):

    bearing = math.radians(
        normalize_azimuth(
            bearing_deg
        )
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

    for z in [
        0.0,
        height_m
    ]:

        for side_depth in [
            -1.0,
            1.0
        ]:

            for side_width in [
                -1.0,
                1.0
            ]:

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

                vertices.append(
                    point
                )

    return vertices


# ============================================================
# TRUE 3D SHADOW PROJECTION
# ============================================================

def project_obstacle_shadow_3d(
    solar_azimuth_deg,
    solar_elevation_deg,
    obstacle_bearing_deg,
    obstacle_distance_m,
    obstacle_height_m,
    obstacle_width_m,
    obstacle_depth_m,
    panel_azimuth_deg,
    panel_tilt_deg,
    array_height_m
):

    if solar_elevation_deg <= 0.0:

        return {
            "shadow_exists": False,
            "reason":
                "SUN_BELOW_HORIZON",
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

    # Shadow travels opposite the sun.
    shadow_ray = vec_scale(
        sun_vector,
        -1.0
    )

    vertices = obstacle_vertices_3d(
        bearing_deg=
            obstacle_bearing_deg,

        distance_m=
            obstacle_distance_m,

        height_m=
            obstacle_height_m,

        obstacle_width_m=
            obstacle_width_m,

        obstacle_depth_m=
            obstacle_depth_m
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

        u_coordinate = dot3(
            relative,
            u
        )

        v_coordinate = dot3(
            relative,
            v
        )

        projected_3d.append(
            point
        )

        projected_uv.append([
            u_coordinate,
            v_coordinate
        ])

    if len(projected_uv) < 3:

        return {
            "shadow_exists": False,
            "reason":
                "NO_VALID_RAY_PLANE_INTERSECTION",
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
            "reason":
                "DEGENERATE_SHADOW_PROJECTION",
            "shadow_polygon": [],
            "shadow_polygon_enu": [],
            "projected_points": []
        }

    hull_enu = []

    for uv in hull_uv:

        point = vec_add(
            plane_origin,
            vec_add(
                vec_scale(
                    u,
                    uv[0]
                ),
                vec_scale(
                    v,
                    uv[1]
                )
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

        "reason":
            "3D_SHADOW_INTERSECTS_TILTED_PV_PLANE",

        "coordinate_system":
            "PV_PLANE_UV",

        "shadow_polygon": [
            [
                round(point[0], 4),
                round(point[1], 4)
            ]
            for point in hull_uv
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
                polygon_area_2d(
                    hull_uv
                ),
                4
            )
    }


# ============================================================
# MODULE SHADING
# ============================================================

def estimate_module_shading_3d(
    modules,
    module_width_m,
    module_height_m,
    array_width_m,
    array_depth_m,
    shadow_polygon_uv
):

    results = []

    module_area = (
        module_width_m
        * module_height_m
    )

    for module in modules:

        module_polygon = (
            module_polygon_uv(
                module,
                module_width_m,
                module_height_m,
                array_width_m,
                array_depth_m
            )
        )

        intersection_area = (
            polygon_intersection_area(
                module_polygon,
                shadow_polygon_uv
            )
        )

        fraction = clamp(
            (
                intersection_area
                / module_area
            )
            if module_area > 0
            else 0.0,
            0.0,
            1.0
        )

        if fraction >= 0.75:

            status = (
                "FULLY_OR_MOSTLY_SHADED"
            )

        elif fraction >= 0.20:

            status = (
                "PARTIALLY_SHADED"
            )

        elif fraction > 0.0:

            status = (
                "LIGHTLY_SHADED"
            )

        else:

            status = "UNSHADED"

        results.append({

            **module,

            "shading_status":
                status,

            "estimated_shaded_fraction":
                round(fraction, 4),

            "intersection_area_m2":
                round(intersection_area, 4)
        })

    return results


# ============================================================
# COMPLETE ARRAY SHADING CALCULATION
# ============================================================

def calculate_array_shading(
    solar,
    bearing_deg,
    distance_m,
    height_m,
    modules_per_row,
    number_of_rows,
    module_width_m,
    module_height_m,
    row_spacing_m,
    array_height_m,
    obstacle_width_m,
    obstacle_depth_m,
    panel_azimuth_deg=DEFAULT_PANEL_AZIMUTH,
    panel_tilt_deg=DEFAULT_PANEL_TILT
):

    array_width = (
        modules_per_row
        * module_width_m
    )

    # IMPORTANT:
    #
    # row_spacing_m is CENTER-TO-CENTER
    # row pitch.
    #
    # Therefore:
    #
    # array depth =
    # module height
    # +
    # (rows - 1) * row spacing
    #
    array_depth = (
        module_height_m
        + (
            number_of_rows - 1
        )
        * row_spacing_m
    )

    modules = build_pv_array(
        modules_per_row=
            modules_per_row,

        number_of_rows=
            number_of_rows,

        module_width_m=
            module_width_m,

        module_height_m=
            module_height_m,

        row_spacing_m=
            row_spacing_m,

        array_height_m=
            array_height_m,

        panel_azimuth_deg=
            panel_azimuth_deg,

        panel_tilt_deg=
            panel_tilt_deg
    )

    projection = (
        project_obstacle_shadow_3d(
            solar_azimuth_deg=
                solar[
                    "solar_azimuth_deg"
                ],

            solar_elevation_deg=
                solar[
                    "solar_elevation_deg"
                ],

            obstacle_bearing_deg=
                bearing_deg,

            obstacle_distance_m=
                distance_m,

            obstacle_height_m=
                height_m,

            obstacle_width_m=
                obstacle_width_m,

            obstacle_depth_m=
                obstacle_depth_m,

            panel_azimuth_deg=
                panel_azimuth_deg,

            panel_tilt_deg=
                panel_tilt_deg,

            array_height_m=
                array_height_m
        )
    )

    shadow_polygon = projection.get(
        "shadow_polygon",
        []
    )

    array_polygon = [

        [
            -array_width / 2.0,
            -array_depth / 2.0
        ],

        [
            array_width / 2.0,
            -array_depth / 2.0
        ],

        [
            array_width / 2.0,
            array_depth / 2.0
        ],

        [
            -array_width / 2.0,
            array_depth / 2.0
        ]
    ]

    array_intersection_area = (
        polygon_intersection_area(
            shadow_polygon,
            array_polygon
        )
    )

    shadow_area = (
        polygon_area_2d(
            shadow_polygon
        )
    )

    shadow_intersects_array = (
        array_intersection_area
        > 1e-8
    )

    if not shadow_intersects_array:

        projection[
            "shadow_exists"
        ] = False

        projection[
            "reason"
        ] = (
            "SHADOW_MISSES_FINITE_PV_ARRAY"
        )

    module_results = (
        estimate_module_shading_3d(
            modules=modules,

            module_width_m=
                module_width_m,

            module_height_m=
                module_height_m,

            array_width_m=
                array_width,

            array_depth_m=
                array_depth,

            shadow_polygon_uv=(
                shadow_polygon
                if shadow_intersects_array
                else []
            )
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

    average_fraction = 0.0

    if total_modules > 0:

        average_fraction = (
            sum(
                module[
                    "estimated_shaded_fraction"
                ]
                for module in module_results
            )
            / total_modules
        )

    if average_fraction <= 0:

        array_status = "NO_SHADOW"

    elif average_fraction < 0.20:

        array_status = (
            "PARTIAL_ARRAY_SHADOW"
        )

    elif average_fraction < 0.60:

        array_status = (
            "SIGNIFICANT_ARRAY_SHADOW"
        )

    else:

        array_status = (
            "HIGH_ARRAY_SHADOW"
        )

    total_module_surface_area = (
        total_modules
        * module_width_m
        * module_height_m
    )

    total_module_intersection_area = sum(
        module[
            "intersection_area_m2"
        ]
        for module in module_results
    )

    projection[
        "array_intersection_area_m2"
    ] = round(
        array_intersection_area,
        4
    )

    projection[
        "shadow_area_on_pv_plane_m2"
    ] = round(
        shadow_area,
        4
    )

    projection[
        "array_area_on_pv_plane_m2"
    ] = round(
        array_width * array_depth,
        4
    )

    projection[
        "module_surface_area_m2"
    ] = round(
        total_module_surface_area,
        4
    )

    projection[
        "module_intersection_area_m2"
    ] = round(
        total_module_intersection_area,
        4
    )

    projection[
        "uncovered_array_gap_area_m2"
    ] = round(
        max(
            0.0,
            (
                array_width
                * array_depth
                - total_module_surface_area
            )
        ),
        4
    )

    return {

        "array_status":
            array_status,

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
                    average_fraction,
                    4
                ),

            "estimated_array_shading_percent":
                round(
                    average_fraction
                    * 100.0,
                    2
                )
        },

        "modules":
            module_results,

        "engineering_note": (
            "This version uses a true 3D "
            "obstacle footprint, sun-ray "
            "projection and intersection "
            "with the configured tilted "
            "PV plane. Module shading is "
            "computed from polygon overlap "
            "on that PV plane. It is still "
            "a geometric shading model: "
            "it does not yet model module "
            "electrical mismatch, bypass "
            "diodes, irradiance transposition "
            "or annual energy loss."
        )
    }


# ============================================================
# INPUT PARSER
# ============================================================

def parse_geometry_inputs(
    payload
):

    return {

        "latitude":
            safe_float(
                payload.get(
                    "latitude",
                    DEFAULT_SITE_LATITUDE
                )
            ),

        "longitude":
            safe_float(
                payload.get(
                    "longitude",
                    DEFAULT_SITE_LONGITUDE
                )
            ),

        "timezone_offset":
            safe_float(
                payload.get(
                    "timezone_offset_hours",
                    DEFAULT_TIMEZONE_OFFSET
                )
            ),

        "bearing":
            normalize_azimuth(
                safe_float(
                    payload.get(
                        "bearing_deg",
                        DEFAULT_OBSTACLE_BEARING
                    )
                )
            ),

        "distance":
            max(
                0.001,
                safe_float(
                    payload.get(
                        "distance_m",
                        DEFAULT_OBSTACLE_DISTANCE
                    )
                )
            ),

        "height":
            max(
                0.0,
                safe_float(
                    payload.get(
                        "height_m",
                        DEFAULT_OBSTACLE_HEIGHT
                    )
                )
            ),

        "obstacle_width":
            max(
                0.1,
                safe_float(
                    payload.get(
                        "obstacle_width_m",
                        payload.get(
                            "width_m",
                            DEFAULT_OBSTACLE_WIDTH_M
                        )
                    )
                )
            ),

        "obstacle_depth":
            max(
                0.1,
                safe_float(
                    payload.get(
                        "obstacle_depth_m",
                        payload.get(
                            "depth_m",
                            DEFAULT_OBSTACLE_DEPTH_M
                        )
                    )
                )
            ),

        "panel_azimuth":
            normalize_azimuth(
                safe_float(
                    payload.get(
                        "panel_azimuth_deg",
                        payload.get(
                            "panel_azimuth",
                            DEFAULT_PANEL_AZIMUTH
                        )
                    )
                )
            ),

        "panel_tilt":
            clamp(
                safe_float(
                    payload.get(
                        "panel_tilt_deg",
                        payload.get(
                            "panel_tilt",
                            DEFAULT_PANEL_TILT
                        )
                    )
                ),
                0.0,
                90.0
            ),

        "modules_per_row":
            max(
                1,
                safe_int(
                    payload.get(
                        "modules_per_row",
                        DEFAULT_MODULES_PER_ROW
                    ),
                    DEFAULT_MODULES_PER_ROW
                )
            ),

        "number_of_rows":
            max(
                1,
                safe_int(
                    payload.get(
                        "number_of_rows",
                        DEFAULT_NUMBER_OF_ROWS
                    ),
                    DEFAULT_NUMBER_OF_ROWS
                )
            ),

        "module_width":
            max(
                0.01,
                safe_float(
                    payload.get(
                        "module_width_m",
                        DEFAULT_MODULE_WIDTH_M
                    )
                )
            ),

        "module_height":
            max(
                0.01,
                safe_float(
                    payload.get(
                        "module_height_m",
                        DEFAULT_MODULE_HEIGHT_M
                    )
                )
            ),

        "row_spacing":
            max(
                0.01,
                safe_float(
                    payload.get(
                        "row_spacing_m",
                        DEFAULT_ROW_SPACING_M
                    )
                )
            ),

        "array_height":
            max(
                0.0,
                safe_float(
                    payload.get(
                        "array_height_m",
                        DEFAULT_ARRAY_HEIGHT_M
                    )
                )
            ),

        "alignment_tolerance":
            clamp(
                safe_float(
                    payload.get(
                        "alignment_tolerance_deg",
                        DEFAULT_ALIGNMENT_TOLERANCE
                    )
                ),
                0.0,
                90.0
            )
    }


# ============================================================
# COMMON INPUT OUTPUT
# ============================================================

def format_inputs(
    inputs,
    date_string,
    time_string=None
):

    output = {

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
        }
    }

    if time_string is not None:

        output["time"] = time_string

    return output


# ============================================================
# SINGLE GEOMETRY
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

    except Exception as error:

        return {
            "service": app.title,
            "status": "error",
            "message": str(error)
        }

    solar = solar_position(
        inputs["latitude"],
        inputs["longitude"],
        local_date,
        local_time,
        inputs["timezone_offset"]
    )

    shadow = calculate_shadow_geometry(
        solar,
        inputs["bearing"],
        inputs["distance"],
        inputs["height"],
        inputs["panel_azimuth"],
        inputs["panel_tilt"],
        inputs["alignment_tolerance"]
    )

    return {

        "service": app.title,

        "status":
            "completed",

        "inputs":
            format_inputs(
                inputs,
                date_string,
                time_string
            ),

        "solar_position":
            solar,

        "reference_point_geometry":
            shadow
    }


# ============================================================
# BASIC DAY GEOMETRY
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
            "service": app.title,
            "status": "error",
            "message":
                "date is required."
        }

    try:

        local_date = date.fromisoformat(
            date_string
        )

        start_time = time.fromisoformat(
            payload.get(
                "start_time",
                "08:00"
            )
        )

        end_time = time.fromisoformat(
            payload.get(
                "end_time",
                "17:00"
            )
        )

    except Exception:

        return {
            "service": app.title,
            "status": "error",
            "message":
                "Invalid date/start_time/end_time."
        }

    start_minutes = (
        start_time.hour * 60
        + start_time.minute
    )

    end_minutes = (
        end_time.hour * 60
        + end_time.minute
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

    if start_minutes > end_minutes:

        return {
            "service": app.title,
            "status": "error",
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
            inputs["latitude"],
            inputs["longitude"],
            local_date,
            current_time,
            inputs["timezone_offset"]
        )

        shadow = calculate_shadow_geometry(
            solar,
            inputs["bearing"],
            inputs["distance"],
            inputs["height"],
            inputs["panel_azimuth"],
            inputs["panel_tilt"],
            inputs["alignment_tolerance"]
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

    return {

        "service": app.title,

        "status":
            "completed",

        "inputs":
            format_inputs(
                inputs,
                date_string
            ),

        "time_range": {

            "start_time":
                start_time.strftime(
                    "%H:%M"
                ),

            "end_time":
                end_time.strftime(
                    "%H:%M"
                ),

            "interval_minutes":
                interval_minutes
        },

        "results":
            results
    }


# ============================================================
# SINGLE ARRAY CALCULATION
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

    except Exception as error:

        return {
            "service": app.title,
            "status": "error",
            "message": str(error)
        }

    solar = solar_position(
        inputs["latitude"],
        inputs["longitude"],
        local_date,
        local_time,
        inputs["timezone_offset"]
    )

    reference_geometry = (
        calculate_shadow_geometry(
            solar,
            inputs["bearing"],
            inputs["distance"],
            inputs["height"],
            inputs["panel_azimuth"],
            inputs["panel_tilt"],
            inputs["alignment_tolerance"]
        )
    )

    array = calculate_array_shading(
        solar,

        inputs["bearing"],

        inputs["distance"],

        inputs["height"],

        inputs["modules_per_row"],

        inputs["number_of_rows"],

        inputs["module_width"],

        inputs["module_height"],

        inputs["row_spacing"],

        inputs["array_height"],

        inputs["obstacle_width"],

        inputs["obstacle_depth"],

        inputs["panel_azimuth"],

        inputs["panel_tilt"]
    )

    return {

        "service": app.title,

        "status":
            "completed",

        "inputs":
            format_inputs(
                inputs,
                date_string,
                time_string
            ),

        "solar_position":
            solar,

        "reference_point_geometry":
            reference_geometry,

        "pv_array_analysis":
            array
    }



# ============================================================
# IRRADIANCE + ENERGY IMPACT
# ============================================================

DEFAULT_MODULE_EFFICIENCY = 0.20
DEFAULT_SYSTEM_PERFORMANCE_RATIO = 0.85
DEFAULT_GROUND_ALBEDO = 0.20
DEFAULT_CLEAR_SKY_DIFFUSE_FRACTION = 0.15


def solar_incidence_angle_deg(
    solar_azimuth_deg,
    solar_elevation_deg,
    panel_azimuth_deg,
    panel_tilt_deg
):
    """
    Angle of incidence between the sun ray and the panel normal.

    Azimuth convention:
        0   = North
        90  = East
        180 = South
        270 = West
    """
    if solar_elevation_deg <= 0:
        return 90.0

    sun = solar_direction_vector(
        solar_azimuth_deg,
        solar_elevation_deg
    )

    basis = pv_plane_basis(
        panel_azimuth_deg,
        panel_tilt_deg
    )

    cosine_incidence = clamp(
        dot3(sun, basis["n"]),
        -1.0,
        1.0
    )

    return math.degrees(
        math.acos(cosine_incidence)
    )


def clear_sky_irradiance(
    solar_elevation_deg,
    solar_azimuth_deg,
    panel_azimuth_deg,
    panel_tilt_deg,
    ground_albedo=DEFAULT_GROUND_ALBEDO,
    diffuse_fraction=DEFAULT_CLEAR_SKY_DIFFUSE_FRACTION
):
    """
    Simple transparent clear-sky irradiance model.

    Haurwitz is used for clear-sky GHI. GHI is split into
    direct and diffuse components using a configurable
    clear-sky diffuse fraction. POA is then estimated with
    an isotropic diffuse + ground-reflected model.

    This is a clear-sky engineering estimate, not measured
    weather irradiance.
    """
    elevation = float(solar_elevation_deg)

    if elevation <= 0.0:
        return {
            "ghi_w_m2": 0.0,
            "dni_w_m2": 0.0,
            "dhi_w_m2": 0.0,
            "poa_irradiance_w_m2": 0.0,
            "incidence_angle_deg": 90.0
        }

    zenith_rad = math.radians(
        90.0 - elevation
    )

    cos_zenith = max(
        0.0,
        math.cos(zenith_rad)
    )

    if cos_zenith <= 1e-8:
        return {
            "ghi_w_m2": 0.0,
            "dni_w_m2": 0.0,
            "dhi_w_m2": 0.0,
            "poa_irradiance_w_m2": 0.0,
            "incidence_angle_deg": 90.0
        }

    # Haurwitz clear-sky global horizontal irradiance.
    ghi = (
        1098.0
        * cos_zenith
        * math.exp(
            -0.059 / cos_zenith
        )
    )

    diffuse_fraction = clamp(
        diffuse_fraction,
        0.0,
        0.80
    )

    dhi = ghi * diffuse_fraction

    dni = max(
        0.0,
        (ghi - dhi) / cos_zenith
    )

    incidence_angle = (
        solar_incidence_angle_deg(
            solar_azimuth_deg,
            solar_elevation_deg,
            panel_azimuth_deg,
            panel_tilt_deg
        )
    )

    cos_incidence = max(
        0.0,
        math.cos(
            math.radians(
                incidence_angle
            )
        )
    )

    tilt_rad = math.radians(
        clamp(
            panel_tilt_deg,
            0.0,
            90.0
        )
    )

    # Isotropic sky diffuse on the tilted plane.
    sky_view_factor = (
        1.0 + math.cos(tilt_rad)
    ) / 2.0

    # Ground-reflected component.
    ground_view_factor = (
        1.0 - math.cos(tilt_rad)
    ) / 2.0

    poa_beam = (
        dni * cos_incidence
    )

    poa_diffuse = (
        dhi * sky_view_factor
    )

    poa_ground = (
        ghi
        * clamp(
            ground_albedo,
            0.0,
            1.0
        )
        * ground_view_factor
    )

    poa = max(
        0.0,
        poa_beam
        + poa_diffuse
        + poa_ground
    )

    return {
        "ghi_w_m2": round(ghi, 2),
        "dni_w_m2": round(dni, 2),
        "dhi_w_m2": round(dhi, 2),
        "poa_beam_w_m2": round(poa_beam, 2),
        "poa_diffuse_w_m2": round(poa_diffuse, 2),
        "poa_ground_reflected_w_m2": round(
            poa_ground,
            2
        ),
        "poa_irradiance_w_m2": round(
            poa,
            2
        ),
        "incidence_angle_deg": round(
            incidence_angle,
            2
        )
    }


def calculate_energy_impact(
    poa_irradiance_w_m2,
    shading_fraction,
    module_surface_area_m2,
    interval_hours,
    module_efficiency=DEFAULT_MODULE_EFFICIENCY,
    performance_ratio=DEFAULT_SYSTEM_PERFORMANCE_RATIO
):
    """
    Convert POA irradiance and geometric shading into
    unshaded/shaded energy estimates for the interval.

    The difference is the estimated energy attributable
    to the geometric shading only.
    """
    shading_fraction = clamp(
        shading_fraction,
        0.0,
        1.0
    )

    module_efficiency = clamp(
        module_efficiency,
        0.01,
        0.50
    )

    performance_ratio = clamp(
        performance_ratio,
        0.50,
        1.00
    )

    unshaded_power_kw = (
        poa_irradiance_w_m2
        * module_surface_area_m2
        * module_efficiency
        * performance_ratio
        / 1000.0
    )

    shaded_power_kw = (
        unshaded_power_kw
        * (1.0 - shading_fraction)
    )

    unshaded_energy_kwh = (
        unshaded_power_kw
        * interval_hours
    )

    shaded_energy_kwh = (
        shaded_power_kw
        * interval_hours
    )

    energy_loss_kwh = max(
        0.0,
        unshaded_energy_kwh
        - shaded_energy_kwh
    )

    return {
        "unshaded_power_kw": round(
            unshaded_power_kw,
            4
        ),
        "shaded_power_kw": round(
            shaded_power_kw,
            4
        ),
        "unshaded_energy_kwh": round(
            unshaded_energy_kwh,
            4
        ),
        "shaded_energy_kwh": round(
            shaded_energy_kwh,
            4
        ),
        "estimated_shading_energy_loss_kwh": round(
            energy_loss_kwh,
            4
        )
    }


# ============================================================
# ARRAY DAY CALCULATION
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
            "service": app.title,
            "status": "error",
            "message": "date is required."
        }

    try:
        local_date = date.fromisoformat(
            date_string
        )

        start_time = time.fromisoformat(
            payload.get(
                "start_time",
                "08:00"
            )
        )

        end_time = time.fromisoformat(
            payload.get(
                "end_time",
                "17:00"
            )
        )
    except Exception:
        return {
            "service": app.title,
            "status": "error",
            "message": "Invalid date/start_time/end_time."
        }

    start_minutes = (
        start_time.hour * 60
        + start_time.minute
    )

    end_minutes = (
        end_time.hour * 60
        + end_time.minute
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

    if start_minutes > end_minutes:
        return {
            "service": app.title,
            "status": "error",
            "message": "start_time must be before end_time."
        }

    module_efficiency = clamp(
        safe_float(
            payload.get(
                "module_efficiency",
                DEFAULT_MODULE_EFFICIENCY
            ),
            DEFAULT_MODULE_EFFICIENCY
        ),
        0.01,
        0.50
    )

    performance_ratio = clamp(
        safe_float(
            payload.get(
                "performance_ratio",
                DEFAULT_SYSTEM_PERFORMANCE_RATIO
            ),
            DEFAULT_SYSTEM_PERFORMANCE_RATIO
        ),
        0.50,
        1.00
    )

    ground_albedo = clamp(
        safe_float(
            payload.get(
                "ground_albedo",
                DEFAULT_GROUND_ALBEDO
            ),
            DEFAULT_GROUND_ALBEDO
        ),
        0.0,
        1.0
    )

    diffuse_fraction = clamp(
        safe_float(
            payload.get(
                "clear_sky_diffuse_fraction",
                DEFAULT_CLEAR_SKY_DIFFUSE_FRACTION
            ),
            DEFAULT_CLEAR_SKY_DIFFUSE_FRACTION
        ),
        0.0,
        0.80
    )

    include_detailed_results = bool(
        payload.get(
            "include_detailed_results",
            False
        )
    )

    interval_hours = (
        interval_minutes / 60.0
    )

    timeline = []

    total_unshaded_energy_kwh = 0.0
    total_shaded_energy_kwh = 0.0
    total_shading_loss_kwh = 0.0

    maximum_shading_item = None

    current = start_minutes

    # --------------------------------------------------------
    # MAIN DAY LOOP
    # --------------------------------------------------------

    while current <= end_minutes:

        current_time = time(
            hour=current // 60,
            minute=current % 60
        )

        solar = solar_position(
            inputs["latitude"],
            inputs["longitude"],
            local_date,
            current_time,
            inputs["timezone_offset"]
        )

        array = calculate_array_shading(
            solar,
            inputs["bearing"],
            inputs["distance"],
            inputs["height"],
            inputs["modules_per_row"],
            inputs["number_of_rows"],
            inputs["module_width"],
            inputs["module_height"],
            inputs["row_spacing"],
            inputs["array_height"],
            inputs["obstacle_width"],
            inputs["obstacle_depth"],
            inputs["panel_azimuth"],
            inputs["panel_tilt"]
        )

        shading_summary = array[
            "shading_summary"
        ]

        shading_fraction = (
            shading_summary[
                "average_module_shaded_fraction"
            ]
        )

        irradiance = clear_sky_irradiance(
            solar["solar_elevation_deg"],
            solar["solar_azimuth_deg"],
            inputs["panel_azimuth"],
            inputs["panel_tilt"],
            ground_albedo,
            diffuse_fraction
        )

        module_surface_area = (
            array[
                "shadow_projection"
            ].get(
                "module_surface_area_m2",
                (
                    inputs["modules_per_row"]
                    * inputs["number_of_rows"]
                    * inputs["module_width"]
                    * inputs["module_height"]
                )
            )
        )

        energy = calculate_energy_impact(
            irradiance[
                "poa_irradiance_w_m2"
            ],
            shading_fraction,
            module_surface_area,
            interval_hours,
            module_efficiency,
            performance_ratio
        )

        total_unshaded_energy_kwh += (
            energy[
                "unshaded_energy_kwh"
            ]
        )

        total_shaded_energy_kwh += (
            energy[
                "shaded_energy_kwh"
            ]
        )

        total_shading_loss_kwh += (
            energy[
                "estimated_shading_energy_loss_kwh"
            ]
        )

        item = {
            "time":
                current_time.strftime(
                    "%H:%M"
                ),

            "solar_elevation_deg":
                round(
                    solar[
                        "solar_elevation_deg"
                    ],
                    2
                ),

            "solar_azimuth_deg":
                round(
                    solar[
                        "solar_azimuth_deg"
                    ],
                    2
                ),

            "shadow_exists":
                array[
                    "shadow_projection"
                ].get(
                    "shadow_exists",
                    False
                ),

            "array_status":
                array[
                    "array_status"
                ],

            "array_shading_percent":
                shading_summary[
                    "estimated_array_shading_percent"
                ],

            "modules_with_any_shading":
                shading_summary[
                    "modules_with_any_estimated_shading"
                ],

            "poa_irradiance_w_m2":
                irradiance[
                    "poa_irradiance_w_m2"
                ],

            "incidence_angle_deg":
                irradiance[
                    "incidence_angle_deg"
                ],

            "unshaded_power_kw":
                energy[
                    "unshaded_power_kw"
                ],

            "shaded_power_kw":
                energy[
                    "shaded_power_kw"
                ],

            "estimated_shading_energy_loss_kwh":
                energy[
                    "estimated_shading_energy_loss_kwh"
                ]
        }

        timeline.append(item)

        if (
            maximum_shading_item is None
            or item[
                "array_shading_percent"
            ]
            > maximum_shading_item[
                "array_shading_percent"
            ]
        ):
            maximum_shading_item = item

        current += interval_minutes

    impact_times = [
        item
        for item in timeline
        if item[
            "array_shading_percent"
        ] > 0
    ]

    significant_times = [
        item
        for item in timeline
        if item[
            "array_shading_percent"
        ] >= 20.0
    ]

    shading_energy_loss_percent = 0.0

    if total_unshaded_energy_kwh > 0:
        shading_energy_loss_percent = (
            total_shading_loss_kwh
            / total_unshaded_energy_kwh
            * 100.0
        )

    # --------------------------------------------------------
    # RESPONSE
    # --------------------------------------------------------

    response = {
        "service": app.title,

        "status": "completed",

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

            "irradiance_model": {
                "model":
                    "Haurwitz_GHI_plus_isotropic_POA",

                "module_efficiency":
                    module_efficiency,

                "performance_ratio":
                    performance_ratio,

                "ground_albedo":
                    ground_albedo,

                "clear_sky_diffuse_fraction":
                    diffuse_fraction
            },

            "time_range": {
                "start_time":
                    start_time.strftime(
                        "%H:%M"
                    ),

                "end_time":
                    end_time.strftime(
                        "%H:%M"
                    ),

                "interval_minutes":
                    interval_minutes
            }
        },

        "daily_summary": {
            "total_time_points":
                len(timeline),

            "times_with_any_estimated_array_shading":
                len(impact_times),

            "times_with_significant_estimated_shading":
                len(significant_times),

            "maximum_estimated_array_shading_percent":
                round(
                    maximum_shading_item[
                        "array_shading_percent"
                    ]
                    if maximum_shading_item
                    else 0.0,
                    2
                ),

            "maximum_shading_time":
                (
                    maximum_shading_item[
                        "time"
                    ]
                    if maximum_shading_item
                    else None
                ),

            "impact_times":
                [
                    item["time"]
                    for item in impact_times
                ],

            "clear_sky_unshaded_energy_kwh":
                round(
                    total_unshaded_energy_kwh,
                    4
                ),

            "clear_sky_energy_after_shading_kwh":
                round(
                    total_shaded_energy_kwh,
                    4
                ),

            "estimated_shading_energy_loss_kwh":
                round(
                    total_shading_loss_kwh,
                    4
                ),

            "estimated_shading_energy_loss_percent":
                round(
                    shading_energy_loss_percent,
                    2
                ),

            "timeline":
                timeline
        }
    }

    # Detailed geometry is optional so the default response
    # stays compact. Set include_detailed_results=true when
    # module-by-module geometry is needed.
    if include_detailed_results:
        detailed_results = []

        current = start_minutes

        while current <= end_minutes:

            current_time = time(
                hour=current // 60,
                minute=current % 60
            )

            solar = solar_position(
                inputs["latitude"],
                inputs["longitude"],
                local_date,
                current_time,
                inputs["timezone_offset"]
            )

            reference_geometry = (
                calculate_shadow_geometry(
                    solar,
                    inputs["bearing"],
                    inputs["distance"],
                    inputs["height"],
                    inputs["panel_azimuth"],
                    inputs["panel_tilt"],
                    inputs["alignment_tolerance"]
                )
            )

            array = calculate_array_shading(
                solar,
                inputs["bearing"],
                inputs["distance"],
                inputs["height"],
                inputs["modules_per_row"],
                inputs["number_of_rows"],
                inputs["module_width"],
                inputs["module_height"],
                inputs["row_spacing"],
                inputs["array_height"],
                inputs["obstacle_width"],
                inputs["obstacle_depth"],
                inputs["panel_azimuth"],
                inputs["panel_tilt"]
            )

            detailed_results.append({
                "time":
                    current_time.strftime(
                        "%H:%M"
                    ),

                "solar_position":
                    solar,

                "reference_point_geometry":
                    reference_geometry,

                "array_status":
                    array[
                        "array_status"
                    ],

                "shading_summary":
                    array[
                        "shading_summary"
                    ],

                "shadow_projection":
                    array[
                        "shadow_projection"
                    ],

                "modules":
                    array[
                        "modules"
                    ]
            })

            current += interval_minutes

        response[
            "results"
        ] = detailed_results

    response[
        "engineering_note"
    ] = (
        "Geometric shading is combined with "
        "a transparent clear-sky irradiance "
        "estimate. The energy-loss value "
        "represents estimated loss attributable "
        "to geometric shading under the selected "
        "clear-sky assumptions. It is not an "
        "annual measured energy-loss prediction "
        "and does not model electrical mismatch, "
        "bypass diodes, string layout, clouds, "
        "temperature or measured weather."
    )

    return response


# ============================================================
# VISION
# ============================================================

def image_features(image):

    width, height = image.size

    return {
        "image_width":
            width,

        "image_height":
            height
    }



def bbox_iou(bbox_a, bbox_b):
    """
    Calculate Intersection over Union (IoU) for two XYXY bounding boxes.

    IoU is used here to identify multiple YOLO-World text-class detections
    that refer to the same physical obstacle.
    """

    if not bbox_a or not bbox_b or len(bbox_a) != 4 or len(bbox_b) != 4:
        return 0.0

    ax1, ay1, ax2, ay2 = [float(value) for value in bbox_a]
    bx1, by1, bx2, by2 = [float(value) for value in bbox_b]

    intersection_x1 = max(ax1, bx1)
    intersection_y1 = max(ay1, by1)
    intersection_x2 = min(ax2, bx2)
    intersection_y2 = min(ay2, by2)

    intersection_width = max(0.0, intersection_x2 - intersection_x1)
    intersection_height = max(0.0, intersection_y2 - intersection_y1)
    intersection_area = intersection_width * intersection_height

    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union_area = area_a + area_b - intersection_area

    if union_area <= 0.0:
        return 0.0

    return intersection_area / union_area


def detection_category(label):
    """Map SolarIQ+ vision labels to broad physical-object categories."""

    normalized_label = str(label).strip().lower()

    if "building" in normalized_label or "structure" in normalized_label:
        return "building"

    if "tree" in normalized_label:
        return "tree"

    if "tank" in normalized_label:
        return "tank"

    if "tower" in normalized_label or "pole" in normalized_label:
        return "tower_or_pole"

    return normalized_label


def detection_specificity(label):
    """Give more specific SolarIQ+ labels a deterministic tie-break priority."""

    normalized_label = str(label).strip().lower()

    priorities = {
        "close multi-storey building": 5,
        "large foreground building": 5,
        "large rooftop structure": 5,
        "nearby building": 4,
        "building": 3,
        "nearby tree": 4,
        "tree": 3,
        "nearby water tank": 4,
        "water tank": 3,
        "nearby telecom tower": 4,
        "nearby tower": 4,
        "nearby pole": 4,
        "telecom tower": 3,
        "tower": 3,
        "pole": 3,
    }

    return priorities.get(normalized_label, 1)


def deduplicate_detections(detections, iou_threshold=0.50):
    """
    Merge overlapping YOLO-World detections that represent the same
    physical obstacle but were produced from different text classes.

    Example:
        'nearby building' + 'close multi-storey building'
        with high IoU -> one building detection.

    Detections from different physical-object categories are never merged.
    The strongest detection is retained, with label specificity used as a
    deterministic tie-breaker.
    """

    if not detections:
        return []

    valid_detections = [
        detection
        for detection in detections
        if "error" not in detection
    ]

    ordered = sorted(
        valid_detections,
        key=lambda item: (
            float(item.get("confidence", 0.0)),
            detection_specificity(item.get("label", "")),
            float(item.get("area_fraction", 0.0)),
        ),
        reverse=True,
    )

    kept = []

    for detection in ordered:
        current_category = detection_category(
            detection.get("label", "")
        )

        is_duplicate = False

        for existing in kept:
            existing_category = detection_category(
                existing.get("label", "")
            )

            if current_category != existing_category:
                continue

            overlap = bbox_iou(
                detection.get("bbox", []),
                existing.get("bbox", []),
            )

            if overlap >= iou_threshold:
                is_duplicate = True
                break

        if not is_duplicate:
            kept.append(detection)

    kept.sort(
        key=lambda item: (
            float(item.get("area_fraction", 0.0)),
            float(item.get("confidence", 0.0)),
        ),
        reverse=True,
    )

    return kept

def detect_image(image):

    if model is None:
        return []

    try:

        result = model.predict(
            image,
            conf=DETECTION_CONFIDENCE,
            verbose=False
        )[0]

        names = result.names

        detections = []

        if result.boxes is None:
            return []

        image_width, image_height = (
            image.size
        )

        for box in result.boxes:

            coordinates = (
                box.xyxy[0]
                .cpu()
                .numpy()
                .tolist()
            )

            confidence = float(
                box.conf[0]
            )

            class_id = int(
                box.cls[0]
            )

            x1, y1, x2, y2 = (
                coordinates
            )

            box_width = max(
                0.0,
                x2 - x1
            )

            box_height = max(
                0.0,
                y2 - y1
            )

            area_fraction = (
                box_width
                * box_height
                /
                (
                    image_width
                    * image_height
                )
            )

            center_x = (
                x1 + x2
            ) / (
                2.0 * image_width
            )

            center_y = (
                y1 + y2
            ) / (
                2.0 * image_height
            )

            edge_context = max(
                abs(center_x - 0.5) * 2.0,
                abs(center_y - 0.5) * 2.0
            )

            label = names.get(
                class_id,
                str(class_id)
            )

            detections.append({

                "label":
                    label,

                "confidence":
                    round(
                        confidence,
                        4
                    ),

                "bbox": [
                    round(x, 2)
                    for x in coordinates
                ],

                "area_fraction":
                    round(
                        area_fraction,
                        4
                    ),

                "center_x":
                    round(
                        center_x,
                        4
                    ),

                "center_y":
                    round(
                        center_y,
                        4
                    ),

                "vertical_fraction":
                    round(
                        box_height
                        / image_height,
                        4
                    ),

                "edge_context":
                    round(
                        edge_context,
                        4
                    )
            })

        # YOLO-World can detect the same physical obstacle multiple times
        # when different text classes describe it. For example, the East
        # image can produce both "nearby building" and "close multi-storey
        # building" for the same foreground building. Deduplicate those
        # overlapping same-category detections before limiting the output.
        detections = deduplicate_detections(
            detections,
            iou_threshold=0.50
        )

        detections.sort(
            key=lambda item: (
                item["area_fraction"],
                item["confidence"]
            ),
            reverse=True
        )

        return detections[
            :MAX_CANDIDATES_PER_PHOTO
        ]

    except Exception as error:

        return [
            {
                "error":
                    str(error)
            }
        ]


# ============================================================
# VISION CONTEXT FILTER
# ============================================================

def vision_filter(
    detections,
    direction
):

    candidates = []

    for detection in detections:

        if "error" in detection:
            continue

        label = detection[
            "label"
        ].lower()

        area = detection[
            "area_fraction"
        ]

        vertical = detection[
            "vertical_fraction"
        ]

        center_x = detection[
            "center_x"
        ]

        edge = detection[
            "edge_context"
        ]

        confidence = detection[
            "confidence"
        ]

        is_building = (
            "building"
            in label
        )

        is_tree = (
            "tree"
            in label
        )

        is_tower = (
            "tower"
            in label
            or
            "pole"
            in label
        )

        is_tank = (
            "tank"
            in label
        )

        reject = False

        rejection_reason = None

        # ----------------------------------------------------
        # DIRECTIONAL RELEVANCE
        # ----------------------------------------------------
        #
        # The configured PV array is south-facing. North-sector
        # objects are therefore treated as contextual/low-direct-
        # relevance objects and are not passed into engineering
        # shadow geometry.
        #
        if direction == "north":

            reject = True

            rejection_reason = (
                "north_sector_low_direct_shadow_relevance"
            )

        # ----------------------------------------------------
        # LARGE EDGE-ATTACHED FOREGROUND BUILDING
        # ----------------------------------------------------
        #
        # Reject only when the object has the visual signature
        # of foreground/camera context. This does not reject
        # every edge building.
        #
        if (
            not reject
            and
            is_building
            and
            area >= 0.30
            and
            vertical >= 0.65
            and
            edge >= 0.45
        ):

            reject = True

            rejection_reason = (
                "large_edge_attached_foreground_context"
            )

        # ----------------------------------------------------
        # BUILDING RELEVANCE
        # ----------------------------------------------------

        if (
            not reject
            and
            is_building
            and
            area >= 0.18
            and
            vertical >= 0.55
        ):

            relevant = True

        # ----------------------------------------------------
        # TREE RELEVANCE
        # ----------------------------------------------------
        #
        # Small/low-coverage tree detections are treated as
        # contextual noise. A tree must have meaningful image
        # coverage, vertical extent and confidence.
        #
        elif (
            not reject
            and
            is_tree
            and
            area >= 0.06
            and
            vertical >= 0.35
            and
            confidence >= 0.15
        ):

            relevant = True

        # ----------------------------------------------------
        # WATER-TANK RELEVANCE
        # ----------------------------------------------------

        elif (
            not reject
            and
            is_tank
            and
            area >= 0.035
            and
            vertical >= 0.20
            and
            confidence >= 0.12
        ):

            relevant = True

        # ----------------------------------------------------
        # TOWER / POLE RELEVANCE
        # ----------------------------------------------------
        #
        # Thin objects need both meaningful image coverage and
        # confidence before becoming engineering candidates.
        #
        elif (
            not reject
            and
            is_tower
            and
            area >= 0.06
            and
            vertical >= 0.30
            and
            confidence >= 0.15
        ):

            relevant = True

        else:

            relevant = False

        if not relevant and rejection_reason is None:

            reject = True

            rejection_reason = (
                "below_visual_relevance_threshold"
            )

        updated = {
            **detection,

            "candidate":
                not reject,

            "rejection_reason":
                rejection_reason
        }

        if not reject:

            candidates.append(
                updated
            )

    return candidates


# ============================================================
# VISION ANALYSIS ENDPOINT
# ============================================================

@app.post(
    "/api/shadow/vision/analyze"
)
async def analyze_shadow_vision(
    north: Optional[
        UploadFile
    ] = File(None),

    east: Optional[
        UploadFile
    ] = File(None),

    south: Optional[
        UploadFile
    ] = File(None),

    west: Optional[
        UploadFile
    ] = File(None)
):

    uploads = {

        "north":
            north,

        "east":
            east,

        "south":
            south,

        "west":
            west
    }

    output = {}

    for direction, upload in (
        uploads.items()
    ):

        if upload is None:

            output[
                direction
            ] = {

                "provided":
                    False,

                "candidates":
                    []
            }

            continue

        try:

            image_bytes = (
                await upload.read()
            )

            image = Image.open(
                io.BytesIO(
                    image_bytes
                )
            ).convert(
                "RGB"
            )

            detections = (
                detect_image(
                    image
                )
            )

            candidates = (
                vision_filter(
                    detections,
                    direction
                )
            )

            output[
                direction
            ] = {

                "provided":
                    True,

                "image_features":
                    image_features(
                        image
                    ),

                "detections":
                    detections,

                "candidates":
                    candidates,

                "candidate_count":
                    len(candidates)
            }

        except Exception as error:

            output[
                direction
            ] = {

                "provided":
                    True,

                "error":
                    str(error),

                "candidates":
                    []
            }

    return {

        "service":
            app.title,

        "status":
            "completed",

        "model":
            MODEL_NAME,

        "directions":
            output,

        "engineering_note": (
            "Vision provides contextual "
            "obstacle candidates. Exact "
            "physical height, distance and "
            "footprint must be confirmed "
            "before engineering-grade geometry."
        )
    }


# ============================================================
# HEALTH
# ============================================================

@app.get(
    "/api/shadow/vision/health"
)
async def vision_health():

    return {

        "service":
            app.title,

        "status":
            "healthy",

        "model":
            MODEL_NAME,

        "model_loaded":
            model is not None
    }


@app.get(
    "/api/shadow/vision/"
)
async def vision_root():

    return {

        "service":
            app.title,

        "status":
            "ready",

        "endpoints": [

            "POST /api/shadow/vision/analyze",

            "GET /api/shadow/vision/health",

            "POST /api/shadow/geometry/calculate",

            "POST /api/shadow/geometry/day-calculate",

            "POST /api/shadow/geometry/array-calculate",

            "POST /api/shadow/geometry/array-day-calculate"
        ]
    }


@app.get(
    "/api/shadow/health"
)
async def health():

    return {

        "service":
            app.title,

        "status":
            "healthy",

        "version":
            "4.1.0",

        "model_loaded":
            model is not None
    }


# ============================================================
# ROOT
# ============================================================

@app.get("/")
async def root():

    return {

        "service":
            app.title,

        "status":
            "running",

        "version":
            "4.1.0"
    }