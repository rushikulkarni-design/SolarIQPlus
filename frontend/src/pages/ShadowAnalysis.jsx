import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Compass,
  Crosshair,
  Image as ImageIcon,
  Loader2,
  MapPin,
  Navigation,
  RefreshCw,
  ScanSearch,
  Sun,
  Upload,
  X,
} from "lucide-react";
import {
  MapContainer,
  Marker,
  TileLayer,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const BACKEND_URL =
  process.env.REACT_APP_BACKEND_URL || "http://127.0.0.1:8000";

const VISION_SERVER_URL =
  process.env.REACT_APP_SHADOW_VISION_URL ||
  "http://127.0.0.1:8001";

const DIRECTIONS = [
  { key: "north", label: "North", description: "North-side rooftop view" },
  { key: "east", label: "East", description: "East-side rooftop view" },
  { key: "south", label: "South", description: "South-side rooftop view" },
  { key: "west", label: "West", description: "West-side rooftop view" },
];

const STORAGE_KEY = "siq_shadow_location";

const DEFAULT_LOCATION = {
  latitude: 19.8762,
  longitude: 75.3433,
  accuracy: null,
};

const DEFAULT_CANDIDATE_STATE = {
  bearing_deg: "",
  distance_m: "",
  height_m: "",
  width_m: "",
  depth_m: "",
};

function createMarkerIcon() {
  return L.divIcon({
    className: "siq-rooftop-marker",
    html: `
      <div style="
        width:34px;
        height:34px;
        border-radius:50%;
        background:#172554;
        border:4px solid white;
        box-shadow:0 4px 14px rgba(0,0,0,.3);
        display:flex;
        align-items:center;
        justify-content:center;
        color:white;
        font-size:16px;
      ">☀</div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

const rooftopIcon = createMarkerIcon();

function MapLocationPicker({ onSelect, mode }) {
  useMapEvents({
    click(event) {
      onSelect({
        latitude: event.latlng.lat,
        longitude: event.latlng.lng,
        accuracy: null,
      }, mode);
    },
  });

  return null;
}

function createObstacleIcon(selected = false) {
  return L.divIcon({
    className: "siq-obstacle-marker",
    html: `<div style="width:30px;height:30px;border-radius:50%;background:${selected ? '#dc2626' : '#f59e0b'};border:3px solid white;box-shadow:0 3px 12px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;color:white;font-weight:800;font-size:13px">!</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function calculateBearingAndDistance(from, to) {
  const lat1 = Number(from.latitude) * Math.PI / 180;
  const lat2 = Number(to.latitude) * Math.PI / 180;
  const dLat = (Number(to.latitude) - Number(from.latitude)) * Math.PI / 180;
  const dLon = (Number(to.longitude) - Number(from.longitude)) * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const bearing = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const distance = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return { bearing_deg: Number(bearing.toFixed(1)), distance_m: Number(distance.toFixed(1)) };
}

function SectionHeader({
  number,
  title,
  description,
  icon: Icon,
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
          <Icon className="h-4 w-4" />
        </div>

        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            {number}
          </div>

          <h2 className="text-base font-bold text-slate-900">
            {title}
          </h2>

          {description ? (
            <p className="mt-0.5 text-sm text-slate-500">
              {description}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ children, warning = false }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
        warning
          ? "bg-amber-100 text-amber-800"
          : "bg-emerald-100 text-emerald-800"
      }`}
    >
      {children}
    </span>
  );
}

function normalizeVisionResponse(data) {
  const safe =
    data && typeof data === "object"
      ? data
      : {};

  /*
   * Current vision backend response shape:
   *
   * {
   *   status: "completed",
   *   directions: {
   *     north: { candidates: [...] },
   *     east:  { candidates: [...] },
   *     south: { candidates: [...] },
   *     west:  { candidates: [...] }
   *   }
   * }
   *
   * Older frontend code expected `photos` and `candidates` at the
   * top level. Normalize the real backend response into that shape
   * so the rest of the component can continue to use one contract.
   */
  const directionResults =
    safe.directions &&
    typeof safe.directions === "object" &&
    !Array.isArray(safe.directions)
      ? safe.directions
      : {};

  const photosFromDirections = DIRECTIONS.map(
    (direction) => {
      const result =
        directionResults[direction.key] &&
        typeof directionResults[direction.key] === "object"
          ? directionResults[direction.key]
          : {};

      const directionCandidates =
        Array.isArray(result.candidates)
          ? result.candidates.map((candidate, index) => ({
              ...candidate,
              direction:
                candidate?.direction ||
                direction.key,
              id:
                candidate?.id ||
                `${direction.key}-${index}`,
            }))
          : [];

      return {
        ...result,
        direction: direction.key,
        label: result.label || direction.label,
        candidates: directionCandidates,
        candidate_count:
          typeof result.candidate_count === "number"
            ? result.candidate_count
            : directionCandidates.length,
      };
    }
  );

  const legacyPhotos = Array.isArray(safe.photos)
    ? safe.photos
    : [];

  const photos =
    Object.keys(directionResults).length > 0
      ? photosFromDirections
      : legacyPhotos;

  const candidatesFromDirections = photos.flatMap(
    (photo) =>
      Array.isArray(photo?.candidates)
        ? photo.candidates.map((candidate, index) => ({
            ...candidate,
            direction:
              candidate?.direction ||
              photo?.direction ||
              "unknown",
            id:
              candidate?.id ||
              `${photo?.direction || "object"}-${index}`,
          }))
        : []
  );

  const legacyCandidates = Array.isArray(
    safe.candidates
  )
    ? safe.candidates
    : [];

  const candidates =
    candidatesFromDirections.length > 0
      ? candidatesFromDirections
      : legacyCandidates;

  return {
    ...safe,
    photos,
    candidates,
    candidate_count:
      typeof safe.candidate_count === "number"
        ? safe.candidate_count
        : candidates.length,
    has_potential_obstacles:
      typeof safe.has_potential_obstacles === "boolean"
        ? safe.has_potential_obstacles
        : candidates.length > 0,
    high_relevance_count:
      typeof safe.high_relevance_count === "number"
        ? safe.high_relevance_count
        : candidates.filter(
            (item) => item?.solar_relevance === "HIGH"
          ).length,
    review_count:
      typeof safe.review_count === "number"
        ? safe.review_count
        : candidates.filter(
            (item) => item?.solar_relevance === "REVIEW"
          ).length,
  };
}


/*
 * Normalizes the actual response returned by backend/shadow_server.py.
 *
 * Important backend field:
 *   overall_geometric_shadow_risk
 *
 * The backend does NOT return:
 *   risk
 *   overall_risk
 *
 * So this function explicitly supports the real API contract.
 */
function normalizeShadowResponse(data) {
  const safe =
    data && typeof data === "object"
      ? data
      : {};

  const risk =
    safe.overall_geometric_shadow_risk ||
    safe.risk ||
    safe.overall_risk ||
    safe.shadow_risk ||
    "UNKNOWN";

  const scope =
    safe.analysis_scope &&
    typeof safe.analysis_scope === "object"
      ? safe.analysis_scope
      : {};

  const panel =
    safe.panel_configuration &&
    typeof safe.panel_configuration === "object"
      ? safe.panel_configuration
      : {};

  const dataQuality =
    safe.data_quality &&
    typeof safe.data_quality === "object"
      ? safe.data_quality
      : {};

  const method =
    safe.method &&
    typeof safe.method === "object"
      ? safe.method
      : {};

  const limitations = Array.isArray(safe.limitations)
    ? safe.limitations
    : [];

  /*
   * Current shadow backend calculates overall risk and does not return
   * a separate seasonal exposure-hours dictionary.
   *
   * Therefore we do NOT invent seasonal exposure values.
   */
  const seasonalExposure =
    safe.seasonal_exposure_hours &&
    typeof safe.seasonal_exposure_hours === "object"
      ? safe.seasonal_exposure_hours
      : null;

  const seasons = seasonalExposure
    ? Object.entries(seasonalExposure).map(
        ([season, value]) => ({
          season,
          hours:
            typeof value === "number"
              ? value
              : Number(
                  value?.hours ??
                    value?.exposure_hours ??
                    0
                ),
        })
      )
    : [];

  const windows = Array.isArray(
    safe.shadow_windows
  )
    ? safe.shadow_windows
    : Array.isArray(safe.shadowWindows)
    ? safe.shadowWindows
    : [];

  /*
   * With no obstruction the current backend has no numerical exposure
   * field. Because the UI needs to show the result clearly, zero is
   * valid only when obstruction_count is explicitly zero.
   */
  const obstructionCount =
    typeof scope.obstruction_count === "number"
      ? scope.obstruction_count
      : Array.isArray(safe.obstructions)
      ? safe.obstructions.length
      : 0;

  let totalExposureHours = null;

  if (
    typeof safe.total_exposure_hours ===
    "number"
  ) {
    totalExposureHours =
      safe.total_exposure_hours;
  } else if (
    typeof safe.totalExposureHours ===
    "number"
  ) {
    totalExposureHours =
      safe.totalExposureHours;
  } else if (seasons.length > 0) {
    totalExposureHours = seasons.reduce(
      (sum, item) => sum + item.hours,
      0
    );
  } else if (obstructionCount === 0) {
    totalExposureHours = 0;
  }

  return {
    raw: safe,
    risk: String(risk).toUpperCase(),
    totalExposureHours,
    seasons,
    windows,
    obstructionCount,
    seasonalSamples:
      typeof scope.seasonal_samples ===
      "number"
        ? scope.seasonal_samples
        : Array.isArray(
            safe.seasonal_dates
          )
        ? safe.seasonal_dates.length
        : 0,
    sampleIntervalMinutes:
      typeof scope.sample_interval_minutes ===
      "number"
        ? scope.sample_interval_minutes
        : null,
    timeRange:
      scope.time_range ||
      null,
    seasonalDates: Array.isArray(
      safe.seasonal_dates
    )
      ? safe.seasonal_dates
      : [],
    panelConfiguration: panel,
    dataQuality,
    method,
    limitations,
    note:
      safe.important_note ||
      "Geometric shadow risk is not an exact annual generation-loss percentage.",
  };
}

export default function ShadowAnalysis() {
  const navigate = useNavigate();
  const [location, setLocation] = useState(() => {
    try {
      const saved =
        localStorage.getItem(STORAGE_KEY);

      return saved
        ? JSON.parse(saved)
        : DEFAULT_LOCATION;
    } catch {
      return DEFAULT_LOCATION;
    }
  });

  const [mapMode, setMapMode] = useState("roof");
  const [mapLayer, setMapLayer] = useState("satellite");
  const [obstacleMarkers, setObstacleMarkers] = useState([]);
  const [selectedObstacleId, setSelectedObstacleId] = useState("");
  const [mapDetectionBusy, setMapDetectionBusy] = useState({});
  const [satelliteAnalyzed, setSatelliteAnalyzed] = useState(false);
  const [satelliteAnalysisLoading, setSatelliteAnalysisLoading] = useState(false);
  const [satelliteAnalysisError, setSatelliteAnalysisError] = useState("");
  const [satelliteAnalysisResults, setSatelliteAnalysisResults] = useState([]);
  const [additionalObstacleChoice, setAdditionalObstacleChoice] = useState("");
  const [additionalDirection, setAdditionalDirection] = useState("north");
  const [additionalImages, setAdditionalImages] = useState([]);
  const [additionalPreviews, setAdditionalPreviews] = useState([]);

  const [photos, setPhotos] = useState({
    north: null,
    east: null,
    south: null,
    west: null,
  });

  const [photoPreviews, setPhotoPreviews] =
    useState({
      north: null,
      east: null,
      south: null,
      west: null,
    });

  const [gpsLoading, setGpsLoading] =
    useState(false);

  const [gpsError, setGpsError] =
    useState("");

  const [compassHeading, setCompassHeading] =
    useState(null);

  const [panelAzimuth, setPanelAzimuth] =
    useState(180);

  const [panelTilt, setPanelTilt] =
    useState(20);

  const [visionLoading, setVisionLoading] =
    useState(false);

  const [visionError, setVisionError] =
    useState("");

  const [visionResult, setVisionResult] =
    useState(null);

  const [candidateForms, setCandidateForms] =
    useState({});

  const [shadowLoading, setShadowLoading] =
    useState(false);

  const [shadowError, setShadowError] =
    useState("");

  const [shadowResult, setShadowResult] =
    useState(null);

  const [engineeringResults, setEngineeringResults] =
    useState({});

  const [engineeringLoading, setEngineeringLoading] =
    useState({});

  const [orientationEnabled, setOrientationEnabled] =
    useState(false);

  const safeVision = useMemo(
    () => normalizeVisionResponse(visionResult),
    [visionResult]
  );

  const candidateList = safeVision.candidates;

  const allPhotosReady = DIRECTIONS.every(
    (direction) => photos[direction.key]
  );

  const locationText = useMemo(() => {
    if (!location) {
      return "Location not selected";
    }

    return `${Number(
      location.latitude
    ).toFixed(6)}, ${Number(
      location.longitude
    ).toFixed(6)}`;
  }, [location]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(location)
      );
    } catch {
      // Ignore storage failures.
    }
  }, [location]);

  useEffect(() => {
    return () => {
      Object.values(photoPreviews).forEach(
        (url) => {
          if (url) {
            try {
              URL.revokeObjectURL(url);
            } catch {
              // Ignore.
            }
          }
        }
      );
    };
  }, []);

  // Every new Shadow Analysis page session starts with empty upload slots.
  // Photo files and blob previews are intentionally kept only in memory.
  useEffect(() => {
    setPhotos({
      north: null,
      east: null,
      south: null,
      west: null,
    });

    setPhotoPreviews({
      north: null,
      east: null,
      south: null,
      west: null,
    });
  }, []);

  useEffect(() => {
    if (!orientationEnabled) return;

    const handleOrientation = (event) => {
      let heading = null;

      if (
        typeof event.webkitCompassHeading ===
        "number"
      ) {
        heading =
          event.webkitCompassHeading;
      } else if (
        typeof event.alpha === "number"
      ) {
        heading =
          (360 - event.alpha) % 360;
      }

      if (
        typeof heading === "number" &&
        Number.isFinite(heading)
      ) {
        setCompassHeading(
          Math.round(heading)
        );
      }
    };

    window.addEventListener(
      "deviceorientationabsolute",
      handleOrientation,
      true
    );

    window.addEventListener(
      "deviceorientation",
      handleOrientation,
      true
    );

    return () => {
      window.removeEventListener(
        "deviceorientationabsolute",
        handleOrientation,
        true
      );

      window.removeEventListener(
        "deviceorientation",
        handleOrientation,
        true
      );
    };
  }, [orientationEnabled]);

  const handleLocationSelect = (
    nextLocation,
    requestedMode = mapMode
  ) => {
    if (requestedMode === "obstacle") {
      const id = `map-obstacle-${Date.now()}-${Math.round(Math.random() * 10000)}`;
      const marker = {
        id,
        latitude: Number(nextLocation.latitude),
        longitude: Number(nextLocation.longitude),
        height_m: 10,
        obstacle_type: "unknown",
        ...calculateBearingAndDistance(location, nextLocation),
      };
      setObstacleMarkers((current) => [...current, marker]);
      setSelectedObstacleId(id);
      setMapMode("obstacle");
      setShadowResult(null);
      setMapDetectionBusy((current) => ({ ...current, [id]: true }));
      fetch(`${VISION_SERVER_URL}/api/shadow/vision/detect-map-obstacle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude: marker.latitude, longitude: marker.longitude, zoom: 19 }),
      })
        .then(async (response) => {
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data?.detail || data?.message || "YOLO map detection failed");
          setObstacleMarkers((current) => current.map((item) => item.id === id ? {
            ...item,
            obstacle_type: data?.detected ? (data.obstacle_type || "unknown") : "unknown",
            detection_status: data?.status === "completed" ? (data?.detected ? "detected" : "not_detected") : "error",
            detection_label: data?.label || "",
            detection_confidence: Number(data?.confidence || 0),
            detection_message: data?.message || "",
          } : item));
        })
        .catch((error) => {
          setObstacleMarkers((current) => current.map((item) => item.id === id ? { ...item, detection_status: "error", detection_message: error?.message || "YOLO detection failed" } : item));
        })
        .finally(() => setMapDetectionBusy((current) => ({ ...current, [id]: false })));
      return;
    }

    setLocation(nextLocation);
    setGpsError("");
    setShadowResult(null);
    // Keep obstacle geometry synchronized when the rooftop pin moves.
    setObstacleMarkers((current) => current.map((marker) => ({
      ...marker,
      ...calculateBearingAndDistance(nextLocation, marker),
    })));
  };

  const applySelectedMarkerToCandidate = (candidate, index) => {
    const candidateKey = candidate?.id || `${candidate?.direction || "object"}-${index}`;
    const marker = obstacleMarkers.find((item) => item.id === selectedObstacleId);
    if (!marker) {
      setShadowError("Mark an obstacle on the satellite map and select its marker first.");
      return;
    }
    setCandidateForms((current) => ({
      ...current,
      [candidateKey]: {
        ...(current[candidateKey] || DEFAULT_CANDIDATE_STATE),
        bearing_deg: String(marker.bearing_deg),
        distance_m: String(marker.distance_m),
      },
    }));
    setShadowError("");
  };

  const useCurrentLocation = () => {
    setGpsError("");

    if (!navigator.geolocation) {
      setGpsError(
        "This browser does not provide GPS location."
      );
      return;
    }

    setGpsLoading(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude:
            position.coords.latitude,
          longitude:
            position.coords.longitude,
          accuracy:
            typeof position.coords
              .accuracy === "number"
              ? position.coords.accuracy
              : null,
        });

        setGpsLoading(false);
        setGpsError("");
        setShadowResult(null);
      },
      (error) => {
        setGpsLoading(false);

        if (
          error.code ===
          error.PERMISSION_DENIED
        ) {
          setGpsError(
            "Location permission was denied. You can select the rooftop manually on the map."
          );
        } else {
          setGpsError(
            "Current location could not be obtained. You can select the rooftop manually on the map."
          );
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  };

  const enableCompass = async () => {
    try {
      if (
        typeof DeviceOrientationEvent !==
          "undefined" &&
        typeof DeviceOrientationEvent.requestPermission ===
          "function"
      ) {
        const permission =
          await DeviceOrientationEvent.requestPermission();

        if (permission !== "granted") {
          setGpsError(
            "Compass permission was not granted."
          );
          return;
        }
      }

      setOrientationEnabled(true);
      setGpsError("");
    } catch {
      setGpsError(
        "Compass access could not be enabled on this device."
      );
    }
  };

  const handlePhotoChange = (
    direction,
    file
  ) => {
    if (!file) return;

    const oldPreview =
      photoPreviews[direction];

    if (oldPreview) {
      try {
        URL.revokeObjectURL(oldPreview);
      } catch {
        // Ignore.
      }
    }

    const preview =
      URL.createObjectURL(file);

    const nextPhotos = {
      ...photos,
      [direction]: file,
    };

    const nextPreviews = {
      ...photoPreviews,
      [direction]: preview,
    };

    setPhotos(nextPhotos);
    setPhotoPreviews(nextPreviews);

    setVisionResult(null);
    setVisionError("");
    setShadowResult(null);
    setShadowError("");
    setEngineeringResults({});
    setEngineeringLoading({});

  };

  const removePhoto = (direction) => {
    const oldPreview =
      photoPreviews[direction];

    if (oldPreview) {
      try {
        URL.revokeObjectURL(oldPreview);
      } catch {
        // Ignore.
      }
    }

    setPhotos({
      ...photos,
      [direction]: null,
    });

    setPhotoPreviews({
      ...photoPreviews,
      [direction]: null,
    });

    setVisionResult(null);
    setVisionError("");
    setShadowResult(null);
    setShadowError("");
    setEngineeringResults({});
    setEngineeringLoading({});
  };

  const analyzeSurroundings = async () => {
    setVisionLoading(true);
    setVisionError("");
    setShadowResult(null);

    try {
      const formData = new FormData();

      DIRECTIONS.forEach(
        (direction) => {
          const file =
            photos[direction.key];

          if (file) {
            formData.append(
              direction.key,
              file
            );
          }
        }
      );

      const response = await fetch(
        `${VISION_SERVER_URL}/api/shadow/vision/analyze`,
        {
          method: "POST",
          body: formData,
        }
      );

      const data =
        await response
          .json()
          .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data?.detail ||
            data?.message ||
            "AI surroundings analysis failed."
        );
      }

      const normalized =
        normalizeVisionResponse(data);

      setVisionResult(normalized);

      const initialForms = {};

      normalized.candidates.forEach(
        (candidate, index) => {
          const key =
            candidate?.id ||
            `${candidate?.direction || "object"}-${index}`;

          initialForms[key] = {
            ...DEFAULT_CANDIDATE_STATE,
          };
        }
      );

      setCandidateForms(
        initialForms
      );
    } catch (error) {
      setVisionError(
        error?.message ||
          "Could not complete AI surroundings analysis."
      );

      setVisionResult(null);
    } finally {
      setVisionLoading(false);
    }
  };

  const updateCandidateField = (
    candidateKey,
    field,
    value
  ) => {
    setCandidateForms((current) => ({
      ...current,
      [candidateKey]: {
        ...(current[candidateKey] ||
          DEFAULT_CANDIDATE_STATE),
        [field]: value,
      },
    }));
  };

  const getCandidateEngineeringValues = (
    candidate,
    index
  ) => {
    const candidateKey =
      candidate?.id ||
      `${candidate?.direction || "object"}-${index}`;

    const form =
      candidateForms[candidateKey] ||
      DEFAULT_CANDIDATE_STATE;

    return {
      candidateKey,
      bearing: Number(form.bearing_deg),
      distance: Number(form.distance_m),
      height: Number(form.height_m),
      width: Number(form.width_m),
      depth: Number(form.depth_m),
    };
  };

  const confirmAndAnalyzeCandidate = async (
    candidate,
    index
  ) => {
    const {
      candidateKey,
      bearing,
      distance,
      height,
      width,
      depth,
    } = getCandidateEngineeringValues(
      candidate,
      index
    );

    if (
      !Number.isFinite(bearing) ||
      !Number.isFinite(distance) ||
      !Number.isFinite(height) ||
      !Number.isFinite(width) ||
      !Number.isFinite(depth) ||
      bearing < 0 ||
      bearing > 360 ||
      distance <= 0 ||
      height <= 0 ||
      width <= 0 ||
      depth <= 0
    ) {
      setShadowError(
        "Enter valid bearing, distance, height, width and depth values before confirming the obstacle."
      );
      return;
    }

    setShadowError("");
    setEngineeringLoading((current) => ({
      ...current,
      [candidateKey]: true,
    }));

    try {
      const today = new Date();
      const dateString =
        `${today.getFullYear()}-${String(
          today.getMonth() + 1
        ).padStart(2, "0")}-${String(
          today.getDate()
        ).padStart(2, "0")}`;

      const payload = {
        direction: String(
          candidate?.direction || "unknown"
        ).toLowerCase(),
        obstacle_label:
          candidate?.label ||
          candidate?.object_type ||
          "Detected object",
        vision_confidence:
          typeof candidate?.confidence === "number"
            ? candidate.confidence
            : null,
        bearing_deg: bearing,
        distance_m: distance,
        height_m: height,
        width_m: width,
        depth_m: depth,
        date: dateString,
        start_time: "08:00",
        end_time: "17:00",
        interval_minutes: 30,
        source: "user_confirmed",
      };

      const response = await fetch(
        `${VISION_SERVER_URL}/api/shadow/engineering/confirm-and-analyze`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      const data = await response
        .json()
        .catch(() => ({}));

      if (!response.ok || data?.status !== "completed") {
        throw new Error(
          data?.message ||
            data?.detail ||
            "Engineering shadow and energy analysis failed."
        );
      }

      setEngineeringResults((current) => ({
        ...current,
        [candidateKey]: data,
      }));

      // Keep the old result state populated for compatibility
      // with the existing result area while the new engineering
      // result cards are shown below.
      setShadowResult(null);
    } catch (error) {
      setShadowError(
        error?.message ||
          "Could not complete engineering shadow and energy analysis."
      );
    } finally {
      setEngineeringLoading((current) => ({
        ...current,
        [candidateKey]: false,
      }));
    }
  };

  const getEngineeringSummary = (result) => {
    const summary =
      result?.calculation?.daily_summary ||
      {};

    return {
      maxShading:
        Number(
          summary
            .maximum_estimated_array_shading_percent
        ) || 0,
      maxTime:
        summary.maximum_shading_time ||
        "—",
      lossKwh:
        Number(
          summary
            .estimated_shading_energy_loss_kwh
        ) || 0,
      lossPercent:
        Number(
          summary
            .estimated_shading_energy_loss_percent
        ) || 0,
      unshadedKwh:
        Number(
          summary
            .clear_sky_unshaded_energy_kwh
        ) || 0,
      shadedKwh:
        Number(
          summary
            .clear_sky_energy_after_shading_kwh
        ) || 0,
      impactTimes:
        Array.isArray(summary.impact_times)
          ? summary.impact_times
          : [],
    };
  };

  const clearEngineeringResult = (
    candidateKey
  ) => {
    setEngineeringResults((current) => {
      const next = {
        ...current,
      };
      delete next[candidateKey];
      return next;
    });
  };

  const clearAnalysis = () => {
    setVisionResult(null);
    setVisionError("");
    setShadowResult(null);
    setShadowError("");
    setEngineeringResults({});
    setEngineeringLoading({});
    setCandidateForms({});
    setEngineeringResults({});
    setEngineeringLoading({});
  };

  const allEngineeringConfirmed =
    candidateList.length === 0 ||
    candidateList.every((candidate, index) => {
      const candidateKey =
        candidate?.id ||
        `${candidate?.direction || "object"}-${index}`;
      return Boolean(engineeringResults[candidateKey]);
    });

  const analyzeMarkedSatelliteObstacles = async () => {
    const pending = obstacleMarkers.filter((marker) =>
      ["building", "tree", "water_tank", "tower", "other"].includes(String(marker.obstacle_type || "").toLowerCase())
    );
    if (!obstacleMarkers.length) {
      setSatelliteAnalysisError("Mark at least one obstacle on the satellite map first.");
      return;
    }
    if (Object.values(mapDetectionBusy).some(Boolean)) {
      setSatelliteAnalysisError("Wait for all satellite detections to finish before analyzing.");
      return;
    }
    setSatelliteAnalysisLoading(true);
    setSatelliteAnalysisError("");
    setSatelliteAnalysisResults([]);
    setSatelliteAnalyzed(false);
    setAdditionalObstacleChoice("");
    try {
      const today = new Date();
      const dateString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const results = await Promise.all(obstacleMarkers.map(async (marker, index) => {
        const type = String(marker.obstacle_type || "unknown").toLowerCase();
        if (type === "land") {
          return { id: marker.id, index: index + 1, label: "Land / open ground", type, prominent: false, lossPercent: 0, summary: null, data: null, message: "The marked point appears to be land/open ground, not a prominent elevated obstacle. It is excluded from obstacle shadow calculations." };
        }
        if (!pending.includes(marker)) {
          return { id: marker.id, index: index + 1, label: "Unclassified obstacle", type, prominent: null, message: "YOLO could not confidently classify this marker. Move the marker onto the object or review the detection before using it in shadow calculations.", data: null };
        }
        const distance = Number(marker.distance_m);
        const bearing = Number(marker.bearing_deg);
        const height = Number(marker.height_m);
        if (![distance, bearing, height].every(Number.isFinite) || distance <= 0 || height <= 0) {
          return { id: marker.id, index: index + 1, label: type, type, prominent: null, message: "Valid distance, bearing and height are required for the geometric shadow estimate.", data: null };
        }
        const response = await fetch(`${VISION_SERVER_URL}/api/shadow/engineering/confirm-and-analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            // Engineering API expects a compass cardinal direction, not the YOLO class label.
            direction: (() => { const b = ((bearing % 360) + 360) % 360; if (b >= 315 || b < 45) return "north"; if (b >= 45 && b < 135) return "east"; if (b >= 135 && b < 225) return "south"; return "west"; })(),
            obstacle_label: type.replaceAll("_", " "),
            vision_confidence: Number(marker.detection_confidence || 0),
            bearing_deg: bearing,
            distance_m: distance,
            height_m: height,
            width_m: type === "tree" ? 5 : 10,
            depth_m: type === "tree" ? 5 : 5,
            date: dateString,
            start_time: "08:00",
            end_time: "17:00",
            interval_minutes: 30,
            source: "satellite_marker"
          })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data?.status !== "completed") throw new Error(data?.message || data?.detail || `Obstacle ${index + 1} analysis failed.`);
        const summary = data?.calculation?.daily_summary || data?.daily_summary || {};
        const lossPercent = Number(summary.estimated_shading_energy_loss_percent ?? data?.estimated_shading_energy_loss_percent ?? 0);
        const maxShadingPercent = Number(summary.maximum_estimated_array_shading_percent ?? summary.maximum_shading_percent ?? 0);
        const impactTimes = Array.isArray(summary.impact_times) ? summary.impact_times : [];
        // Do not flag an obstacle just because the engine reports a time point or a maximum time.
        // Only label it prominent when calculated shading magnitude crosses a meaningful threshold.
        const hasValidMetrics = Number.isFinite(lossPercent) && Number.isFinite(maxShadingPercent);
        const prominent = hasValidMetrics && (lossPercent >= 2.0 || maxShadingPercent >= 10.0);
        const metrics = { lossPercent, maxShadingPercent, impactTimes };
        const message = !hasValidMetrics
          ? "The shadow engine did not return enough valid metrics to classify this obstacle."
          : prominent
            ? "The model estimates meaningful shading for the supplied height and geometry. Review the times and percentages below."
            : "No prominent shadow impact was estimated for the supplied height and geometry. Minor geometric overlap, if any, is below the current reporting thresholds.";
        return { id: marker.id, index: index + 1, label: type.replaceAll("_", " "), type, prominent: hasValidMetrics ? prominent : null, lossPercent, maxShadingPercent, summary, data, message };
      }));
      setSatelliteAnalysisResults(results);
      setSatelliteAnalyzed(true);
    } catch (error) {
      setSatelliteAnalysisError(error?.message || "Satellite obstacle analysis failed. Check that the shadow backend is running.");
    } finally {
      setSatelliteAnalysisLoading(false);
    }
  };

  const canContinueToAnalysis =
    (satelliteAnalyzed && additionalObstacleChoice === "no") ||
    (Boolean(visionResult) && allEngineeringConfirmed);

  return (
    <div className="space-y-6 pb-12">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-700">
          Solar Planner · Step 04
        </div>

        <h1 className="mt-1 text-2xl font-bold text-slate-950">
          Shadow Analysis
        </h1>

        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
          Select the rooftop, detect nearby obstacles from satellite imagery, analyze the results, and optionally add close-range photos for obstacles not visible from above.
        </p>
      </div>

      {/* 01 LOCATION */}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <SectionHeader
          number="01"
          title="Rooftop Location"
          description="Choose the rooftop, switch to obstacle mode to mark nearby structures, and use 3D Earth for an oblique building view."
          icon={MapPin}
        />

        <div className="mt-5 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setMapMode("roof")} className={`rounded-lg px-3 py-2 text-xs font-bold ${mapMode === "roof" ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700"}`}>
                <MapPin className="mr-1 inline h-3.5 w-3.5" /> Select rooftop
              </button>
              <button type="button" onClick={() => setMapMode("obstacle")} className={`rounded-lg px-3 py-2 text-xs font-bold ${mapMode === "obstacle" ? "bg-amber-500 text-white" : "border border-slate-300 bg-white text-slate-700"}`}>
                <Crosshair className="mr-1 inline h-3.5 w-3.5" /> Add obstacle marker
              </button>
              <button type="button" onClick={() => setMapLayer((layer) => layer === "satellite" ? "streets" : "satellite")} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700">
                {mapLayer === "satellite" ? "Switch to streets" : "Switch to satellite"}
              </button>
              <a href={`https://earth.google.com/web/@${Number(location.latitude)},${Number(location.longitude)},120a,35y,0h,0t,0r`} target="_blank" rel="noreferrer" className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100">
                Open 3D Earth view ↗
              </a>
            </div>
            <div className="mb-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {mapMode === "roof" ? "Click the target rooftop or drag the sun marker to position it." : "Obstacle mode active: click each nearby building, tree, pole or fixed structure to add a marker."}
            </div>
            <div className="h-[390px] overflow-hidden rounded-xl border border-slate-200">
              <MapContainer
                center={[
                  Number(
                    location.latitude
                  ),
                  Number(
                    location.longitude
                  ),
                ]}
                zoom={17}
                scrollWheelZoom
                style={{
                  height: "100%",
                  width: "100%",
                }}
              >
                <TileLayer
                  attribution={mapLayer === "satellite" ? "Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics" : "&copy; OpenStreetMap contributors"}
                  url={mapLayer === "satellite" ? "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"}
                  maxZoom={19}
                />

                <MapLocationPicker
                  onSelect={handleLocationSelect}
                  mode={mapMode}
                />

                <Marker
                  position={[
                    Number(
                      location.latitude
                    ),
                    Number(
                      location.longitude
                    ),
                  ]}
                  icon={rooftopIcon}
                  draggable
                  eventHandlers={{
                    dragend: (event) => {
                      const position =
                        event.target.getLatLng();

                      handleLocationSelect({
                        latitude:
                          position.lat,
                        longitude:
                          position.lng,
                        accuracy: null,
                      }, "roof");
                    },
                  }}
                />

                {obstacleMarkers.map((marker, markerIndex) => (
                  <Marker
                    key={marker.id}
                    position={[marker.latitude, marker.longitude]}
                    icon={createObstacleIcon(marker.id === selectedObstacleId)}
                    eventHandlers={{ click: () => setSelectedObstacleId(marker.id) }}
                  />
                ))}
              </MapContainer>
            </div>

            <p className="mt-2 text-xs text-slate-500">
              Satellite imagery is the map layer. Use “Open 3D Earth view” for the provider's separate 3D globe/building view where available.
            </p>
            {obstacleMarkers.length > 0 ? (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-xs font-bold uppercase tracking-wide text-amber-900">Marked obstacles ({obstacleMarkers.length})</div>
                  <button type="button" onClick={() => { setObstacleMarkers([]); setSelectedObstacleId(""); }} className="text-xs font-semibold text-red-700 hover:underline">Clear all</button>
                </div>
                <div className="space-y-2">
                  {obstacleMarkers.map((marker, markerIndex) => (
                    <div key={marker.id} className={`rounded-lg border p-3 ${marker.id === selectedObstacleId ? "border-amber-400 bg-white" : "border-amber-100 bg-white/70"}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <button type="button" onClick={() => setSelectedObstacleId(marker.id)} className="text-left text-xs font-semibold text-slate-800">Obstacle {markerIndex + 1} · {marker.distance_m} m · {marker.bearing_deg}° ({Number(marker.bearing_deg) < 22.5 || Number(marker.bearing_deg) >= 337.5 ? "N" : Number(marker.bearing_deg) < 67.5 ? "NE" : Number(marker.bearing_deg) < 112.5 ? "E" : Number(marker.bearing_deg) < 157.5 ? "SE" : Number(marker.bearing_deg) < 202.5 ? "S" : Number(marker.bearing_deg) < 247.5 ? "SW" : Number(marker.bearing_deg) < 292.5 ? "W" : "NW"})</button>
                        <button type="button" onClick={() => { setObstacleMarkers((current) => current.filter((item) => item.id !== marker.id)); if (selectedObstacleId === marker.id) setSelectedObstacleId(""); }} className="rounded px-2 py-1 text-xs text-red-700 hover:bg-red-50">Remove</button>
                      </div>
                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="text-[11px] font-semibold text-slate-600">YOLO-World detection
                          <div className="mt-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-2 text-xs text-slate-800">
                            {mapDetectionBusy[marker.id] ? "Detecting from satellite imagery…" : marker.detection_status === "detected" ? `${({ building: "Building", tree: "Tree", land: "Land / open ground", water_tank: "Water tank", tower: "Tower / pole", solar_panel_array: "Solar panel array", other: "Other structure" })[marker.obstacle_type] || marker.obstacle_type} · ${(Number(marker.detection_confidence || 0) * 100).toFixed(0)}% confidence` : marker.detection_status === "not_detected" ? "No confident object detected — move marker onto the object" : marker.detection_status === "error" ? (marker.detection_message || "Detection failed; retry by removing and marking again") : "Waiting for detection…"}
                          </div>
                          {marker.detection_label ? <div className="mt-1 text-[10px] text-slate-500">Model label: {marker.detection_label}</div> : null}
                          {marker.detection_status === "not_detected" || marker.detection_status === "error" ? <label className="mt-2 block text-[10px] font-medium text-slate-500">Correct label manually only if AI is wrong
                            <select value={marker.obstacle_type || "unknown"} onChange={(event) => setObstacleMarkers((current) => current.map((item) => item.id === marker.id ? { ...item, obstacle_type: event.target.value } : item))} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-xs text-slate-800">
                              <option value="unknown">Leave unclassified</option><option value="building">Building</option><option value="tree">Tree</option><option value="land">Land / open ground</option><option value="water_tank">Water tank</option><option value="tower">Tower / pole</option><option value="other">Other structure</option>
                            </select>
                          </label> : null}
                        </div>
                        <label className="text-[11px] font-semibold text-slate-600">Height above rooftop (m)
                          <input type="number" min="0.5" max="300" step="0.5" value={marker.height_m ?? 10} onChange={(event) => { const value = Number(event.target.value); setObstacleMarkers((current) => current.map((item) => item.id === marker.id ? { ...item, height_m: Number.isFinite(value) && value > 0 ? value : "" } : item)); }} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-xs text-slate-800" />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[11px] leading-4 text-amber-900">When you mark an obstacle, YOLO-World analyzes satellite imagery around that point and proposes its type. If the object is not detected, move the marker onto the object or correct the label manually. Distance and bearing come from map coordinates; height above the rooftop remains a user estimate.</p>
              </div>
            ) : null}
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Selected rooftop
              </div>

              <div className="mt-2 flex items-start gap-3">
                <MapPin className="mt-0.5 h-5 w-5 text-amber-600" />

                <div>
                  <div className="font-mono text-sm font-semibold text-slate-900">
                    {locationText}
                  </div>

                  {location.accuracy ? (
                    <div className="mt-1 text-xs text-slate-500">
                      GPS accuracy: ±
                      {Math.round(
                        location.accuracy
                      )}{" "}
                      m
                    </div>
                  ) : (
                    <div className="mt-1 text-xs text-slate-500">
                      Manual map position
                    </div>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={
                useCurrentLocation
              }
              disabled={gpsLoading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {gpsLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Crosshair className="h-4 w-4" />
              )}

              {gpsLoading
                ? "Getting current location…"
                : "Use my current location"}
            </button>

            {gpsError ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                {gpsError}
              </div>
            ) : null}

            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-800">
              The location is used for
              solar-position calculations.
              The map position can always be
              corrected manually.
            </div>
          </div>
        </div>
      </section>

      {/* 02 COMPASS */}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <SectionHeader
          number="02"
          title="Rooftop Orientation"
          description="Use the device compass as an orientation aid."
          icon={Compass}
        />

        <div className="mt-5 grid gap-5 md:grid-cols-[220px_1fr]">
          <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-5">
            <div
              className="relative flex h-32 w-32 items-center justify-center rounded-full border-4 border-slate-300 bg-white"
              style={{
                transform:
                  compassHeading !== null
                    ? `rotate(${compassHeading}deg)`
                    : "none",
              }}
            >
              <span className="absolute top-2 text-xs font-bold text-red-600">
                N
              </span>

              <span className="absolute right-2 text-xs font-bold text-slate-500">
                E
              </span>

              <span className="absolute bottom-2 text-xs font-bold text-slate-500">
                S
              </span>

              <span className="absolute left-2 text-xs font-bold text-slate-500">
                W
              </span>

              <Navigation className="h-8 w-8 fill-current text-amber-600" />
            </div>

            <div className="mt-3 text-center">
              <div className="text-xs text-slate-500">
                Compass heading
              </div>

              <div className="mt-1 text-lg font-bold text-slate-900">
                {compassHeading !== null
                  ? `${compassHeading}°`
                  : "Not available"}
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-center">
            <p className="max-w-xl text-sm leading-6 text-slate-600">
              The compass is an orientation aid.
              Final panel orientation is entered
              below and is used by the geometric
              shadow calculation.
            </p>

            <button
              type="button"
              onClick={enableCompass}
              className="mt-4 flex w-fit items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              <Compass className="h-4 w-4" />
              {orientationEnabled
                ? "Compass enabled"
                : "Enable device compass"}
            </button>
          </div>
        </div>
      </section>

      {/* 03 SATELLITE ANALYSIS + OPTIONAL IMAGE FOLLOW-UP */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <SectionHeader
          number="03"
          title="Satellite Obstacle Analysis"
          description="Review the automatically detected obstacles marked on the satellite map before running the shadow analysis."
          icon={ScanSearch}
        />
        <div className="mt-4 rounded-lg border border-amber-100 bg-amber-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-amber-950">Detected satellite obstacles: {obstacleMarkers.length}</div>
              <p className="mt-1 text-xs leading-5 text-amber-900">YOLO predictions are shown beside each marker above. Land or uncertain areas should remain unclassified rather than being treated as a tree or building.</p>
            </div>
            <button type="button" onClick={analyzeMarkedSatelliteObstacles} disabled={obstacleMarkers.length === 0 || Object.values(mapDetectionBusy).some(Boolean) || satelliteAnalysisLoading} className="rounded-lg bg-amber-600 px-5 py-3 text-sm font-bold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50">
              {Object.values(mapDetectionBusy).some(Boolean) ? "Waiting for detections…" : satelliteAnalysisLoading ? "Analyzing marked obstacles…" : "Analyze Satellite Obstacles"}
            </button>
          </div>
        </div>
        {satelliteAnalysisError ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{satelliteAnalysisError}</div> : null}
        {satelliteAnalyzed ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <h3 className="font-bold text-emerald-950">Satellite shadow analysis results</h3>
            <p className="mt-1 text-sm leading-6 text-emerald-900">The marked objects have been analyzed using their detected type, map distance/bearing, entered height and the current geometric shadow engine.</p>
            <div className="mt-3 space-y-2">
              {satelliteAnalysisResults.map((item) => <div key={item.id} className="rounded-lg border border-emerald-100 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold capitalize text-slate-900">Obstacle {item.index}: {item.label}</span><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${item.prominent === true ? "bg-amber-100 text-amber-900" : item.prominent === false ? "bg-emerald-100 text-emerald-900" : "bg-slate-100 text-slate-700"}`}>{item.prominent === true ? "Potential shadow risk" : item.prominent === false ? "No prominent shadow estimated" : "Needs review"}</span></div>
                <p className="mt-1 text-sm text-slate-700">{item.message}</p>
                {Number.isFinite(item.lossPercent) ? <p className="mt-1 text-xs text-slate-500">Estimated daily shading energy loss: {item.lossPercent.toFixed(2)}% (clear-sky model; not a validated annual yield prediction).</p> : null}
                {Number.isFinite(item.maxShadingPercent) ? <p className="mt-1 text-xs text-slate-500">Maximum estimated array shading: {item.maxShadingPercent.toFixed(2)}%{item.summary?.maximum_shading_time ? ` at ${item.summary.maximum_shading_time}` : ""}.</p> : null}
                <p className="mt-1 text-xs text-slate-500">Prominent-risk rule for this prototype: daily loss ≥ 2% or maximum array shading ≥ 10%. These are reporting thresholds, not universal engineering standards.</p>
              </div>)}
            </div>
            <p className="mt-4 text-sm leading-6 text-emerald-950">Were there any additional nearby obstacles not captured in the satellite view, such as poles, pipes, water tanks, cables or small structures?</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => { setAdditionalObstacleChoice("no"); setVisionResult(null); }} className={`rounded-lg px-5 py-2.5 text-sm font-bold ${additionalObstacleChoice === "no" ? "bg-emerald-700 text-white" : "border border-emerald-300 bg-white text-emerald-900"}`}>No, continue</button>
              <button type="button" onClick={() => { setAdditionalObstacleChoice("yes"); setVisionResult(null); setVisionError(""); }} className={`rounded-lg px-5 py-2.5 text-sm font-bold ${additionalObstacleChoice === "yes" ? "bg-indigo-700 text-white" : "border border-indigo-300 bg-white text-indigo-900"}`}>Yes, add images</button>
            </div>
            {additionalObstacleChoice === "no" ? <p className="mt-3 text-sm font-semibold text-emerald-800">No extra image analysis needed. Continue to the next planner step when ready.</p> : null}
          </div>
        ) : null}
      </section>

      {satelliteAnalyzed && additionalObstacleChoice === "yes" ? (
        <section className="rounded-xl border border-indigo-200 bg-white p-5 shadow-sm">
          <SectionHeader number="04" title="Additional Close-Range Obstacle Images" description="This optional image workflow is separate from satellite detection." icon={ImageIcon} />
          <p className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-xs leading-5 text-indigo-900">Choose the direction from the target rooftop toward these additional obstacles, then upload one or more photos. YOLO will screen visible objects; image appearance alone cannot reliably measure physical distance.</p>
          <label className="mt-4 block max-w-sm text-sm font-semibold text-slate-800">Obstacle direction from rooftop
            <select value={additionalDirection} onChange={(e) => setAdditionalDirection(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm">
              <option value="north">North</option><option value="north-east">North-East</option><option value="east">East</option><option value="south-east">South-East</option><option value="south">South</option><option value="south-west">South-West</option><option value="west">West</option><option value="north-west">North-West</option>
            </select>
          </label>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {additionalPreviews.map((src, index) => <div key={`${src}-${index}`} className="relative overflow-hidden rounded-lg border border-slate-200"><img src={src} alt={`Additional obstacle ${index + 1}`} className="h-44 w-full object-cover" /><button type="button" onClick={() => { setAdditionalImages((files) => files.filter((_, i) => i !== index)); setAdditionalPreviews((items) => items.filter((_, i) => i !== index)); }} className="absolute right-2 top-2 rounded-full bg-white p-2 text-slate-700 shadow"><X className="h-4 w-4" /></button><div className="p-2 text-xs font-semibold">Image {index + 1}</div></div>)}
            <label className="flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-indigo-300 bg-indigo-50/50 p-4 text-center hover:bg-indigo-50"><Upload className="h-8 w-8 text-indigo-500"/><span className="mt-2 text-sm font-bold text-indigo-900">Add image(s)</span><span className="mt-1 text-xs text-slate-500">Select multiple photos at once</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => { const files = Array.from(e.target.files || []); setAdditionalImages((prev) => [...prev, ...files]); setAdditionalPreviews((prev) => [...prev, ...files.map((file) => URL.createObjectURL(file))]); e.target.value = ""; }} /></label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" onClick={async () => { if (!additionalImages.length) { setVisionError("Add at least one image first."); return; } setVisionLoading(true); setVisionError(""); setVisionResult(null); try { const fd = new FormData(); const keys = ["north", "east", "south", "west"]; additionalImages.slice(0, 4).forEach((file, i) => fd.append(keys[i], file)); const response = await fetch(`${VISION_SERVER_URL}/api/shadow/vision/analyze`, { method: "POST", body: fd }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data?.detail || data?.message || "Image analysis failed."); const normalized = normalizeVisionResponse(data); setVisionResult({ ...normalized, additionalDirection }); const forms = {}; normalized.candidates.forEach((candidate, index) => { const key = candidate?.id || `${candidate?.direction || "object"}-${index}`; forms[key] = { ...DEFAULT_CANDIDATE_STATE, bearing_deg: "", distance_m: "" }; }); setCandidateForms(forms); } catch (error) { setVisionError(error?.message || "Could not analyze the uploaded images."); } finally { setVisionLoading(false); } }} disabled={visionLoading || additionalImages.length === 0} className="rounded-lg bg-indigo-700 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-800 disabled:opacity-50">{visionLoading ? "Analyzing images…" : "Analyze Additional Images"}</button>
            <span className="text-xs text-slate-500">{additionalImages.length} image(s) selected · current backend analyzes up to four per request.</span>
          </div>
          {visionError ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{visionError}</div> : null}
        </section>
      ) : null}

      {/* 04 AI ANALYSIS */}

      {visionResult ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <SectionHeader
              number="04"
              title="AI Surroundings Analysis"
              description="Visual screening results from YOLO-World plus SolarIQ+ relevance filtering."
              icon={ScanSearch}
            />

            <StatusBadge
              warning={
                candidateList.length > 0
              }
            >
              {candidateList.length >
              0
                ? "Potential obstacles"
                : "No significant candidates"}
            </StatusBadge>
          </div>

          <div
            className={`mt-5 rounded-lg border p-4 ${
              candidateList.length >
              0
                ? "border-amber-200 bg-amber-50"
                : "border-emerald-200 bg-emerald-50"
            }`}
          >
            <div className="flex gap-3">
              {candidateList.length >
              0 ? (
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
              )}

              <div className="text-sm leading-6">
                {candidateList.length >
                0 ? (
                  <p className="font-semibold text-amber-900">
                    The visual screening
                    identified{" "}
                    {
                      candidateList.length
                    }{" "}
                    solar-relevant
                    candidate
                    obstruction
                    {candidateList.length ===
                    1
                      ? ""
                      : "s"}
                    .
                  </p>
                ) : (
                  <p className="font-semibold text-emerald-900">
                    No significant
                    solar-relevant
                    obstruction
                    candidate was
                    detected in the
                    analyzed
                    photographs.
                  </p>
                )}

                <p className="mt-1 text-xs text-slate-600">
                  Apparent size and image
                  position are visual proxies,
                  not physical distance
                  measurements. SolarIQ+ does
                  not invent physical height or
                  distance from a photograph.
                </p>
              </div>
            </div>
          </div>

          {candidateList.length >
          0 ? (
            <div className="mt-6">
              <div className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                Candidate detections
              </div>

              <div className="space-y-4">
                {candidateList.map(
                  (
                    candidate,
                    index
                  ) => {
                    const candidateKey =
                      candidate?.id ||
                      `${candidate?.direction || "object"}-${index}`;

                    const form =
                      candidateForms[
                        candidateKey
                      ] ||
                      DEFAULT_CANDIDATE_STATE;

                    return (
                      <div
                        key={
                          candidateKey
                        }
                        className="rounded-xl border border-amber-200 bg-white p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-slate-900">
                              {candidate?.label ||
                                candidate?.object_type ||
                                "Detected object"}
                            </div>

                            <div className="mt-1 text-xs text-slate-500">
                              {candidate?.direction ||
                                "Unknown"}{" "}
                              photo · Detection
                              confidence{" "}
                              {typeof candidate?.confidence ===
                              "number"
                                ? `${candidate.confidence}%`
                                : "—"}
                            </div>
                          </div>

                          <div className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
                            {typeof candidate?.solar_relevance_score ===
                            "number"
                              ? `${candidate.solar_relevance_score}%`
                              : "Review"}
                          </div>
                        </div>

                        {Array.isArray(
                          candidate?.relevance_reasons
                        ) ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {candidate.relevance_reasons
                              .slice(0, 4)
                              .map(
                                (
                                  reason,
                                  reasonIndex
                                ) => (
                                  <span
                                    key={`${candidateKey}-${reasonIndex}`}
                                    className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] text-slate-600"
                                  >
                                    {reason}
                                  </span>
                                )
                              )}
                          </div>
                        ) : null}

                        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                            Confirm before
                            geometric
                            analysis
                          </div>

                          <div className="mt-1 text-xs leading-5 text-slate-500">
                            Enter only values
                            you can reasonably
                            confirm. SolarIQ+
                            does not estimate
                            physical height or
                            distance from the
                            photograph.
                          </div>

                          <div className="mt-4 flex flex-wrap items-center gap-2">
                            <button type="button" onClick={() => applySelectedMarkerToCandidate(candidate, index)} disabled={!selectedObstacleId} className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50">
                              Use selected map marker for bearing + distance
                            </button>
                            <span className="text-[11px] text-slate-500">{selectedObstacleId ? "Selected marker will fill these two fields." : "Select an obstacle marker on the map first."}</span>
                          </div>

                          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                            <label>
                              <span className="text-xs font-semibold text-slate-700">
                                Bearing (°)
                              </span>

                              <input
                                type="number"
                                min="0"
                                max="360"
                                step="0.1"
                                value={form.bearing_deg}
                                onChange={(event) =>
                                  updateCandidateField(
                                    candidateKey,
                                    "bearing_deg",
                                    event.target.value
                                  )
                                }
                                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                                placeholder="e.g. 90"
                              />
                            </label>

                            <label>
                              <span className="text-xs font-semibold text-slate-700">
                                Distance (m)
                              </span>

                              <input
                                type="number"
                                min="0.1"
                                max="1000"
                                step="0.1"
                                value={form.distance_m}
                                onChange={(event) =>
                                  updateCandidateField(
                                    candidateKey,
                                    "distance_m",
                                    event.target.value
                                  )
                                }
                                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                                placeholder="e.g. 25"
                              />
                            </label>

                            <label>
                              <span className="text-xs font-semibold text-slate-700">
                                Height above panel plane (m)
                              </span>

                              <input
                                type="number"
                                min="0.1"
                                max="500"
                                step="0.1"
                                value={form.height_m}
                                onChange={(event) =>
                                  updateCandidateField(
                                    candidateKey,
                                    "height_m",
                                    event.target.value
                                  )
                                }
                                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                                placeholder="e.g. 6"
                              />
                            </label>

                            <label>
                              <span className="text-xs font-semibold text-slate-700">
                                Width (m)
                              </span>

                              <input
                                type="number"
                                min="0.1"
                                max="1000"
                                step="0.1"
                                value={form.width_m}
                                onChange={(event) =>
                                  updateCandidateField(
                                    candidateKey,
                                    "width_m",
                                    event.target.value
                                  )
                                }
                                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                                placeholder="e.g. 10"
                              />
                            </label>

                            <label>
                              <span className="text-xs font-semibold text-slate-700">
                                Depth (m)
                              </span>

                              <input
                                type="number"
                                min="0.1"
                                max="1000"
                                step="0.1"
                                value={form.depth_m}
                                onChange={(event) =>
                                  updateCandidateField(
                                    candidateKey,
                                    "depth_m",
                                    event.target.value
                                  )
                                }
                                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                                placeholder="e.g. 5"
                              />
                            </label>
                          </div>

                          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                            <div className="text-xs text-slate-500">
                              These are engineering confirmation values. They are not inferred from the photograph.
                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                confirmAndAnalyzeCandidate(
                                  candidate,
                                  index
                                )
                              }
                              disabled={
                                engineeringLoading[
                                  candidateKey
                                ]
                              }
                              className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {engineeringLoading[
                                candidateKey
                              ] ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Sun className="h-4 w-4" />
                              )}

                              {engineeringLoading[
                                candidateKey
                              ]
                                ? "Analyzing…"
                                : "Confirm & Analyze"}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* 05 PANEL CONFIGURATION */}

      {visionResult ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <SectionHeader
            number="05"
            title="Solar Panel Configuration"
            description="These values provide the panel orientation context for the shadow calculation."
            icon={Sun}
          />

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label>
              <span className="text-sm font-semibold text-slate-800">
                Panel azimuth
              </span>

              <span className="mt-1 block text-xs text-slate-500">
                0° = North, 90° = East,
                180° = South, 270° = West
              </span>

              <input
                type="number"
                min="0"
                max="359.99"
                step="0.1"
                value={
                  panelAzimuth
                }
                onChange={(event) =>
                  setPanelAzimuth(
                    event.target.value
                  )
                }
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
              />
            </label>

            <label>
              <span className="text-sm font-semibold text-slate-800">
                Panel tilt
              </span>

              <span className="mt-1 block text-xs text-slate-500">
                Panel tilt angle from
                horizontal.
              </span>

              <input
                type="number"
                min="0"
                max="90"
                step="0.1"
                value={panelTilt}
                onChange={(event) =>
                  setPanelTilt(
                    event.target.value
                  )
                }
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
              />
            </label>
          </div>

          <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
            {candidateList.length > 0 ? (
              <>
                <div className="font-semibold">
                  Engineering analysis is available for each detected obstacle.
                </div>
                <div className="mt-1 text-xs text-emerald-800">
                  Enter the confirmed physical dimensions above and click
                  <strong> Confirm & Analyze </strong>
                  to run solar geometry, 3D shadow projection, module shading,
                  irradiance and energy-impact calculations.
                </div>
              </>
            ) : (
              <>
                <div className="font-semibold">
                  No engineering obstacle analysis is required.
                </div>
                <div className="mt-1 text-xs text-emerald-800">
                  No solar-relevant obstruction was identified in the analyzed
                  photographs, so there is no obstacle to confirm for the
                  geometric shadow analysis.
                </div>
              </>
            )}
          </div>

          {shadowError ? (
            <div className="mt-4 flex gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>{shadowError}</div>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* 07 ENGINEERING RESULTS */}

      {Object.keys(engineeringResults).length > 0 ? (
        <section className="rounded-xl border border-emerald-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <SectionHeader
              number="07"
              title="Shadow + Irradiance + Energy Result"
              description="Engineering results returned by the confirmed obstacle pipeline."
              icon={Sun}
            />

            <StatusBadge>
              Analysis completed
            </StatusBadge>
          </div>

          <div className="mt-5 space-y-5">
            {Object.entries(engineeringResults).map(
              ([candidateKey, result]) => {
                const summary =
                  getEngineeringSummary(result);

                const confirmation =
                  result?.engineering_confirmation ||
                  {};

                const candidate =
                  result?.vision_candidate ||
                  {};

                return (
                  <div
                    key={candidateKey}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-bold text-slate-900">
                          {candidate.label ||
                            "Confirmed obstacle"}
                        </div>

                        <div className="mt-1 text-xs text-slate-500">
                          {String(
                            confirmation.direction ||
                              candidate.direction ||
                              "unknown"
                          ).toUpperCase()}{" "}
                          · bearing{" "}
                          {confirmation.bearing_deg ?? "—"}°
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          clearEngineeringResult(
                            candidateKey
                          )
                        }
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        Clear result
                      </button>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-lg border border-slate-200 bg-white p-4">
                        <div className="text-xs font-semibold text-slate-500">
                          Maximum array shading
                        </div>
                        <div className="mt-1 text-2xl font-bold text-slate-900">
                          {summary.maxShading.toFixed(2)}%
                        </div>
                        <div className="mt-1 text-[11px] text-slate-500">
                          Peak at {summary.maxTime}
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-white p-4">
                        <div className="text-xs font-semibold text-slate-500">
                          Estimated energy loss
                        </div>
                        <div className="mt-1 text-2xl font-bold text-amber-700">
                          {summary.lossKwh.toFixed(4)} kWh
                        </div>
                        <div className="mt-1 text-[11px] text-slate-500">
                          {summary.lossPercent.toFixed(2)}% of clear-sky estimate
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-white p-4">
                        <div className="text-xs font-semibold text-slate-500">
                          Energy after shading
                        </div>
                        <div className="mt-1 text-2xl font-bold text-emerald-700">
                          {summary.shadedKwh.toFixed(4)} kWh
                        </div>
                        <div className="mt-1 text-[11px] text-slate-500">
                          Clear-sky unshaded: {summary.unshadedKwh.toFixed(4)} kWh
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-white p-4">
                        <div className="text-xs font-semibold text-slate-500">
                          Shading impact times
                        </div>
                        <div className="mt-1 text-2xl font-bold text-slate-900">
                          {summary.impactTimes.length}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-500">
                          {summary.impactTimes.length
                            ? summary.impactTimes.join(", ")
                            : "No estimated shading"}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                      <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <div className="text-[11px] text-slate-500">
                          Distance
                        </div>
                        <div className="font-semibold text-slate-900">
                          {confirmation.distance_m ?? "—"} m
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <div className="text-[11px] text-slate-500">
                          Height
                        </div>
                        <div className="font-semibold text-slate-900">
                          {confirmation.height_m ?? "—"} m
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <div className="text-[11px] text-slate-500">
                          Width
                        </div>
                        <div className="font-semibold text-slate-900">
                          {confirmation.width_m ?? "—"} m
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <div className="text-[11px] text-slate-500">
                          Depth
                        </div>
                        <div className="font-semibold text-slate-900">
                          {confirmation.depth_m ?? "—"} m
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <div className="text-[11px] text-slate-500">
                          Pipeline
                        </div>
                        <div className="font-semibold text-emerald-700">
                          Complete
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
                      <div className="text-xs font-bold uppercase tracking-wider text-blue-800">
                        Interpretation
                      </div>
                      <div className="mt-1 text-xs leading-5 text-blue-900">
                        {result?.calculation?.engineering_note ||
                          "Geometric shading plus clear-sky irradiance estimate."}
                      </div>
                    </div>

                    {Array.isArray(
                      result?.calculation?.daily_summary?.timeline
                    ) ? (
                      <details className="mt-4 rounded-lg border border-slate-200 bg-white">
                        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-800">
                          View time-by-time solar and shading timeline
                        </summary>

                        <div className="overflow-x-auto border-t border-slate-200">
                          <table className="min-w-full text-left text-xs">
                            <thead className="bg-slate-50">
                              <tr>
                                <th className="px-3 py-2">Time</th>
                                <th className="px-3 py-2">Solar elev.</th>
                                <th className="px-3 py-2">Solar az.</th>
                                <th className="px-3 py-2">Shading</th>
                                <th className="px-3 py-2">POA</th>
                                <th className="px-3 py-2">Loss</th>
                              </tr>
                            </thead>
                            <tbody>
                              {result.calculation.daily_summary.timeline.map(
                                (item, timelineIndex) => (
                                  <tr
                                    key={`${candidateKey}-timeline-${timelineIndex}`}
                                    className="border-t border-slate-100"
                                  >
                                    <td className="px-3 py-2 font-medium">
                                      {item.time}
                                    </td>
                                    <td className="px-3 py-2">
                                      {Number(
                                        item.solar_elevation_deg
                                      ).toFixed(2)}°
                                    </td>
                                    <td className="px-3 py-2">
                                      {Number(
                                        item.solar_azimuth_deg
                                      ).toFixed(2)}°
                                    </td>
                                    <td className="px-3 py-2">
                                      {Number(
                                        item.array_shading_percent
                                      ).toFixed(2)}%
                                    </td>
                                    <td className="px-3 py-2">
                                      {Number(
                                        item.poa_irradiance_w_m2
                                      ).toFixed(2)}
                                    </td>
                                    <td className="px-3 py-2">
                                      {Number(
                                        item.estimated_shading_energy_loss_kwh
                                      ).toFixed(4)} kWh
                                    </td>
                                  </tr>
                                )
                              )}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    ) : null}
                  </div>
                );
              }
            )}
          </div>
        </section>
      ) : null}

      {/* 08 LEGACY RESULT */}

      {shadowResult ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <SectionHeader
              number="07"
              title="Shadow Analysis Result"
              description="Geometric seasonal exposure calculated from the confirmed site geometry."
              icon={ShieldCheck}
            />

            <StatusBadge
              warning={
                shadowResult.risk !==
                "LOW"
              }
            >
              {shadowResult.risk}
            </StatusBadge>
          </div>

          {/* Main result cards */}

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold text-slate-500">
                Overall geometric risk
              </div>

              <div
                className={`mt-1 text-2xl font-bold ${
                  shadowResult.risk ===
                  "LOW"
                    ? "text-emerald-700"
                    : "text-amber-700"
                }`}
              >
                {shadowResult.risk}
              </div>

              <div className="mt-1 text-[11px] text-slate-500">
                From the pvlib geometric
                shadow engine
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold text-slate-500">
                Sampled exposure
              </div>

              <div className="mt-1 text-2xl font-bold text-slate-900">
                {shadowResult.totalExposureHours ===
                null
                  ? "Not returned"
                  : `${Number(
                      shadowResult.totalExposureHours
                    ).toFixed(2)} h`}
              </div>

              <div className="mt-1 text-[11px] text-slate-500">
                Based on confirmed obstruction
                geometry
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold text-slate-500">
                Confirmed obstructions
              </div>

              <div className="mt-1 text-2xl font-bold text-slate-900">
                {
                  shadowResult.obstructionCount
                }
              </div>

              <div className="mt-1 text-[11px] text-slate-500">
                User/map supplied
              </div>
            </div>
          </div>

          {/* Analysis scope */}

          <div className="mt-6">
            <div className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">
              Analysis scope
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="text-[11px] text-slate-500">
                  Seasonal samples
                </div>

                <div className="mt-1 font-semibold text-slate-900">
                  {
                    shadowResult.seasonalSamples
                  }
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 p-3">
                <div className="text-[11px] text-slate-500">
                  Sample interval
                </div>

                <div className="mt-1 font-semibold text-slate-900">
                  {shadowResult.sampleIntervalMinutes !==
                  null
                    ? `${shadowResult.sampleIntervalMinutes} min`
                    : "—"}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 p-3">
                <div className="text-[11px] text-slate-500">
                  Time range
                </div>

                <div className="mt-1 font-semibold text-slate-900">
                  {shadowResult.timeRange ||
                    "—"}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 p-3">
                <div className="text-[11px] text-slate-500">
                  Solar position
                </div>

                <div className="mt-1 font-semibold text-slate-900">
                  pvlib
                </div>
              </div>
            </div>
          </div>

          {/* Seasonal reference dates */}

          {shadowResult.seasonalDates
            .length > 0 ? (
            <div className="mt-6">
              <div className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                Seasonal reference dates
              </div>

              <div className="flex flex-wrap gap-2">
                {shadowResult.seasonalDates.map(
                  (date) => (
                    <span
                      key={date}
                      className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700"
                    >
                      {date}
                    </span>
                  )
                )}
              </div>
            </div>
          ) : null}

          {/* Panel configuration */}

          <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Panel configuration used
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-[11px] text-slate-500">
                  Azimuth
                </div>

                <div className="font-semibold text-slate-900">
                  {shadowResult
                    .panelConfiguration
                    .azimuth_deg ??
                    panelAzimuth}
                  °
                </div>
              </div>

              <div>
                <div className="text-[11px] text-slate-500">
                  Tilt
                </div>

                <div className="font-semibold text-slate-900">
                  {shadowResult
                    .panelConfiguration
                    .tilt_deg ??
                    panelTilt}
                  °
                </div>
              </div>
            </div>
          </div>

          {/* Important backend note */}

          <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div className="flex gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />

              <div className="text-xs leading-5 text-blue-900">
                <div className="font-bold">
                  Result interpretation
                </div>

                <div className="mt-1">
                  {shadowResult.note}
                </div>
              </div>
            </div>
          </div>

          {/* Engineering limitation */}

          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />

              <div className="text-xs leading-5 text-amber-900">
                <div className="font-bold">
                  Engineering limitation
                </div>

                <div className="mt-1">
                  This is a geometric sampled
                  shadow-risk assessment. It is
                  not an exact annual
                  generation-loss calculation.
                  The result depends on the
                  confirmed obstacle dimensions,
                  bearings, rooftop location and
                  seasonal sampling used by the
                  shadow engine.
                </div>
              </div>
            </div>
          </div>

          {/* Backend limitations */}

          {shadowResult.limitations
            .length > 0 ? (
            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Analysis limitations
              </div>

              <ul className="mt-2 space-y-1.5 text-xs leading-5 text-slate-600">
                {shadowResult.limitations.map(
                  (item, index) => (
                    <li
                      key={`limitation-${index}`}
                      className="flex gap-2"
                    >
                      <span>•</span>
                      <span>{item}</span>
                    </li>
                  )
                )}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* STEP NAVIGATION */}
      <div className="flex items-center justify-between border-t border-slate-200 pt-5">
        <button
          type="button"
          onClick={() => navigate("/planner/rooftop")}
          className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
          data-testid="step-back"
        >
          ← Back
        </button>

        <button
          type="button"
          disabled={!canContinueToAnalysis}
          onClick={() => navigate("/planner/analysis")}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          data-testid="step-next"
        >
          Continue to Analysis →
        </button>
      </div>
    </div>
  );
}