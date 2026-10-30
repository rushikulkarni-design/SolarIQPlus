import { useEffect, useMemo, useState } from "react";
import {
  BrainCircuit,
  Activity,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  TrendingUp,
  Target,
  ShieldAlert,
  GitCompare,
  Wrench,
  Database,
  BarChart3,
  Gauge,
  CalendarDays,
} from "lucide-react";

import { useProjectContext } from "@/context/ProjectContext";
import { api } from "@/lib/api";

const MONITORING_API =
  process.env.REACT_APP_MONITORING_URL ||
  "http://127.0.0.1:8001";

const PROJECT_STORAGE_KEY = "siq_active_project";

function getValue(project, ...keys) {
  for (const key of keys) {
    if (
      project?.[key] !== undefined &&
      project?.[key] !== null &&
      project?.[key] !== ""
    ) {
      return project[key];
    }
  }

  return null;
}

function timeoutFetch(url, options = {}, timeout = 5000) {
  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort();
  }, timeout);

  return fetch(url, {
    ...options,
    signal: controller.signal,
  }).finally(() => {
    clearTimeout(timer);
  });
}

async function recoverProject() {
  const projectId =
    localStorage.getItem(PROJECT_STORAGE_KEY);

  if (!projectId) {
    return null;
  }

  try {
    const response = await api.get(
      `/projects/${projectId}`,
      {
        timeout: 5000,
      }
    );

    return response.data;
  } catch (error) {
    console.error(
      "Project recovery failed:",
      error
    );

    return null;
  }
}

async function loadGenerationHistory(projectId) {
  const response = await timeoutFetch(
    `${MONITORING_API}/api/monitoring/generation/${projectId}`,
    {},
    5000
  );

  if (!response.ok) {
    throw new Error(
      "Generation service is unavailable."
    );
  }

  return response.json();
}

async function loadWeather(location) {
  try {
    const geoResponse = await timeoutFetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
        location
      )}&count=1&language=en&format=json`,
      {},
      4000
    );

    if (!geoResponse.ok) {
      return null;
    }

    const geo = await geoResponse.json();

    if (!geo?.results?.length) {
      return null;
    }

    const place = geo.results[0];

    const weatherResponse = await timeoutFetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m,cloud_cover,wind_speed_10m&hourly=shortwave_radiation,direct_radiation&timezone=auto&forecast_days=1`,
      {},
      4000
    );

    if (!weatherResponse.ok) {
      return null;
    }

    const weather = await weatherResponse.json();

    return {
      ...weather,
      place,
    };
  } catch (error) {
    console.warn(
      "Weather unavailable:",
      error
    );

    return null;
  }
}

function getCurrentRadiation(weather) {
  if (!weather?.hourly?.time) {
    return null;
  }

  const currentTime = weather?.current?.time
    ? new Date(weather.current.time)
    : new Date();

  const currentHour = currentTime.getHours();

  const index = weather.hourly.time.findIndex(
    (time) =>
      new Date(time).getHours() === currentHour
  );

  if (index < 0) {
    return null;
  }

  const radiation =
    weather.hourly.shortwave_radiation?.[index];

  if (
    radiation === null ||
    radiation === undefined ||
    !Number.isFinite(Number(radiation))
  ) {
    return null;
  }

  return Number(radiation);
}

/*
 * Expected generation
 * -------------------
 *
 * When usable solar radiation exists, use it for the
 * weather-adjusted estimate.
 *
 * When radiation is zero/unusable, we do NOT pretend that
 * zero instantaneous radiation means zero daily generation.
 *
 * Instead, we use the registered project's own historical
 * daily-generation baseline. This keeps Actual vs Expected
 * meaningful when the current weather observation is at
 * night or otherwise reports zero radiation.
 */
function calculateExpectedGeneration({
  capacity,
  radiation,
  fallbackDailyGeneration,
}) {
  const usableRadiation =
    Number.isFinite(Number(radiation)) &&
    Number(radiation) > 25;

  if (
    capacity > 0 &&
    usableRadiation
  ) {
    const solarFactor =
      Math.max(
        0,
        Number(radiation)
      ) / 1000;

    const expected =
      capacity *
      solarFactor *
      5;

    return {
      value: Number(
        expected.toFixed(2)
      ),
      source: "weather-adjusted",
    };
  }

  if (
    fallbackDailyGeneration !== null &&
    fallbackDailyGeneration !== undefined &&
    Number.isFinite(
      Number(fallbackDailyGeneration)
    ) &&
    Number(fallbackDailyGeneration) > 0
  ) {
    return {
      value: Number(
        Number(
          fallbackDailyGeneration
        ).toFixed(2)
      ),
      source: "project-baseline",
    };
  }

  return {
    value: null,
    source: "unavailable",
  };
}

function calculatePerformance(
  actual,
  expected
) {
  if (
    actual === null ||
    actual === undefined ||
    expected === null ||
    expected === undefined ||
    expected <= 0
  ) {
    return null;
  }

  return Number(
    ((actual / expected) * 100).toFixed(1)
  );
}

function calculateDeviation(
  actual,
  expected
) {
  if (
    actual === null ||
    actual === undefined ||
    expected === null ||
    expected === undefined ||
    expected <= 0
  ) {
    return null;
  }

  return Number(
    (
      ((actual - expected) /
        expected) *
      100
    ).toFixed(1)
  );
}

/*
 * PROJECT FINGERPRINT
 *
 * Built from this project's own generation history.
 */
function buildPerformanceFingerprint(readings) {
  const values = readings
    .map((reading) =>
      Number(
        reading?.actual_generation_kwh
      )
    )
    .filter(
      (value) =>
        Number.isFinite(value) &&
        value >= 0
    );

  if (values.length < 3) {
    return {
      ready: false,
      count: values.length,
    };
  }

  const sorted = [...values].sort(
    (a, b) => a - b
  );

  const mean =
    values.reduce(
      (sum, value) =>
        sum + value,
      0
    ) / values.length;

  const median = getMedian(sorted);

  const min = sorted[0];

  const max =
    sorted[sorted.length - 1];

  const variance =
    values.reduce(
      (sum, value) =>
        sum +
        Math.pow(
          value - mean,
          2
        ),
      0
    ) / values.length;

  const standardDeviation =
    Math.sqrt(variance);

  const coefficientOfVariation =
    mean > 0
      ? (standardDeviation /
          mean) *
        100
      : 0;

  return {
    ready: true,
    count: values.length,
    mean,
    median,
    min,
    max,
    standardDeviation,
    coefficientOfVariation,
  };
}

/*
 * PROJECT ANOMALY SCREENING
 *
 * This is generation-pattern screening against the project's
 * own history. It is not presented as a weather-adjusted
 * Isolation Forest result.
 */
function screenGenerationAnomalies(
  readings,
  fingerprint
) {
  if (
    !fingerprint?.ready ||
    fingerprint.count < 5
  ) {
    return {
      ready: false,
      anomalies: [],
      normalCount: 0,
      anomalyCount: 0,
    };
  }

  const mean =
    fingerprint.mean;

  const std =
    fingerprint.standardDeviation;

  const threshold =
    Math.max(
      std * 1.75,
      mean * 0.35
    );

  const observations =
    readings
      .map((reading) => {
        const actual =
          Number(
            reading?.actual_generation_kwh
          );

        if (
          !Number.isFinite(
            actual
          )
        ) {
          return null;
        }

        const deviation =
          actual - mean;

        const isAnomaly =
          Math.abs(
            deviation
          ) > threshold;

        return {
          date:
            reading.reading_date,
          actual,
          deviation,
          deviationPercent:
            mean > 0
              ? (deviation /
                  mean) *
                100
              : 0,
          isAnomaly,
        };
      })
      .filter(Boolean);

  const anomalies =
    observations.filter(
      (item) =>
        item.isAnomaly
    );

  return {
    ready: true,
    anomalies,
    observations,
    normalCount:
      observations.length -
      anomalies.length,
    anomalyCount:
      anomalies.length,
    threshold,
  };
}

/*
 * MAINTENANCE SIGNAL
 *
 * This does not diagnose a physical fault.
 */
function buildMaintenanceSignal(
  readings,
  fingerprint,
  latestActual
) {
  if (
    !fingerprint?.ready ||
    readings.length < 5
  ) {
    return {
      status: "BUILDING",
      title:
        "Collecting project history",
      text:
        "More daily observations are needed before a persistent maintenance signal can be evaluated.",
      level: "building",
    };
  }

  const recent =
    readings.slice(-7);

  const mean =
    fingerprint.mean;

  const recentBelowBaseline =
    recent.filter(
      (reading) => {
        const actual =
          Number(
            reading?.actual_generation_kwh
          );

        return (
          Number.isFinite(
            actual
          ) &&
          actual <
            mean * 0.8
        );
      }
    );

  const latestBelow =
    Number.isFinite(
      Number(latestActual)
    ) &&
    Number(latestActual) <
      mean * 0.8;

  if (
    recentBelowBaseline.length >=
      3 &&
    latestBelow
  ) {
    return {
      status: "WATCH",
      title:
        "Persistent low-generation pattern",
      text:
        "Recent generation is repeatedly below this project's observed baseline. Review weather conditions and system status before scheduling maintenance.",
      level: "watch",
      recentLowDays:
        recentBelowBaseline.length,
    };
  }

  return {
    status: "NORMAL",
    title:
      "No persistent maintenance signal",
    text:
      "The available project generation history does not currently show a persistent low-output pattern requiring maintenance guidance.",
    level: "normal",
  };
}

function getMedian(sortedValues) {
  const middle =
    Math.floor(
      sortedValues.length / 2
    );

  if (
    sortedValues.length % 2 ===
    0
  ) {
    return (
      (sortedValues[
        middle - 1
      ] +
        sortedValues[
          middle
        ]) /
      2
    );
  }

  return sortedValues[middle];
}

function getFingerprintState(
  fingerprint
) {
  if (!fingerprint?.ready) {
    return "BUILDING";
  }

  if (
    fingerprint.count >= 30
  ) {
    return "ESTABLISHED";
  }

  return "BUILDING";
}

function getAnomalyState(
  anomalyResult
) {
  if (!anomalyResult?.ready) {
    return "BUILDING";
  }

  if (
    anomalyResult.anomalyCount ===
    0
  ) {
    return "NO UNUSUAL PATTERN";
  }

  return `${anomalyResult.anomalyCount} UNUSUAL`;
}

export default function MonitoringAI() {
  const {
    activeProject,
  } = useProjectContext();

  const [project, setProject] =
    useState(
      activeProject || null
    );

  const [
    generationHistory,
    setGenerationHistory,
  ] = useState([]);

  const [weather, setWeather] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [
    lastUpdated,
    setLastUpdated,
  ] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function resolveProject() {
      if (activeProject) {
        setProject(activeProject);
        return;
      }

      const recovered =
        await recoverProject();

      if (
        !cancelled &&
        recovered
      ) {
        setProject(recovered);
      }

      if (
        !cancelled &&
        !recovered
      ) {
        setLoading(false);
        setError(
          "The registered project could not be loaded."
        );
      }
    }

    resolveProject();

    return () => {
      cancelled = true;
    };
  }, [activeProject]);

  const projectId =
    project?.id;

  const capacity =
    Number(
      getValue(
        project,
        "capacity_kw",
        "capacityKw",
        "system_capacity_kw",
        "systemCapacityKw"
      ) || 0
    );

  const location =
    getValue(
      project,
      "location",
      "city",
      "address"
    ) || "Ahmedabad";

  async function loadMonitoring() {
    if (!projectId) {
      setLoading(false);
      setError(
        "No registered monitoring project is available."
      );
      return;
    }

    setLoading(true);
    setError("");

    try {
      const historyResponse =
        await loadGenerationHistory(
          projectId
        );

      const readings =
        Array.isArray(
          historyResponse?.readings
        )
          ? historyResponse.readings
          : [];

      setGenerationHistory(
        readings
      );
    } catch (generationError) {
      console.error(
        "Generation history loading failed:",
        generationError
      );

      setGenerationHistory([]);

      setError(
        "Generation history could not be loaded from the monitoring server."
      );

      setLoading(false);
      return;
    }

    const weatherData =
      await loadWeather(
        location
      );

    setWeather(
      weatherData
    );

    setLastUpdated(
      new Date()
    );

    setLoading(false);
  }

  useEffect(() => {
    if (projectId) {
      loadMonitoring();
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const readings =
    generationHistory;

  const latest =
    readings.length > 0
      ? readings[
          readings.length - 1
        ]
      : null;

  const actual =
    latest?.actual_generation_kwh !==
      undefined &&
    latest?.actual_generation_kwh !==
      null
      ? Number(
          latest.actual_generation_kwh
        )
      : null;

  const totalGeneration =
    readings.reduce(
      (sum, reading) =>
        sum +
        Number(
          reading?.actual_generation_kwh ||
            0
        ),
      0
    );

  const averageGeneration =
    readings.length > 0
      ? totalGeneration /
        readings.length
      : null;

  const radiation =
    getCurrentRadiation(
      weather
    );

  const expectedResult =
    calculateExpectedGeneration({
      capacity,
      radiation,
      fallbackDailyGeneration:
        averageGeneration,
    });

  const expected =
    expectedResult.value;

  const expectedSource =
    expectedResult.source;

  const performance =
    calculatePerformance(
      actual,
      expected
    );

  const deviation =
    calculateDeviation(
      actual,
      expected
    );

  let status =
    "WAITING";

  if (performance !== null) {
    if (performance >= 90) {
      status = "NORMAL";
    } else if (
      performance >= 75
    ) {
      status = "WATCH";
    } else {
      status = "ATTENTION";
    }
  }

  const fingerprint =
    useMemo(
      () =>
        buildPerformanceFingerprint(
          readings
        ),
      [readings]
    );

  const anomalyResult =
    useMemo(
      () =>
        screenGenerationAnomalies(
          readings,
          fingerprint
        ),
      [readings, fingerprint]
    );

  const maintenanceSignal =
    useMemo(
      () =>
        buildMaintenanceSignal(
          readings,
          fingerprint,
          actual
        ),
      [
        readings,
        fingerprint,
        actual,
      ]
    );

  const demoCount =
    readings.filter(
      (reading) =>
        reading?.demo === true ||
        reading?.data_mode ===
          "demo" ||
        reading?.source ===
          "demo_enphase_adapter"
    ).length;

  const temperature =
    weather?.current
      ?.temperature_2m ??
    null;

  const cloudCover =
    weather?.current
      ?.cloud_cover ??
    null;

  const windSpeed =
    weather?.current
      ?.wind_speed_10m ??
    null;

  const fingerprintState =
    getFingerprintState(
      fingerprint
    );

  const anomalyState =
    getAnomalyState(
      anomalyResult
    );

  return (
    <div className="max-w-7xl mx-auto px-5 py-7">

      {/* HEADER */}
      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-600">
            <BrainCircuit className="h-4 w-4" />
            Existing System Monitoring
          </div>

          <h1 className="mt-2 text-3xl font-extrabold text-navy-dark font-display">
            AI Insights
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Weather-adjusted performance
            intelligence for{" "}
            <span className="font-semibold text-slate-700">
              {project?.name ||
                "this solar system"}
            </span>
            .
          </p>
        </div>

        <button
          type="button"
          onClick={
            loadMonitoring
          }
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${
              loading
                ? "animate-spin"
                : ""
            }`}
          />

          Refresh analysis
        </button>
      </div>

      {/* LOADING */}
      {loading && (
        <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50 px-5 py-4 flex items-center gap-3">
          <RefreshCw className="h-5 w-5 text-blue-600 animate-spin" />

          <div>
            <div className="font-bold text-navy-dark">
              Loading project AI data...
            </div>

            <div className="mt-1 text-xs text-slate-500">
              Reading the project's generation
              history and current weather.
            </div>
          </div>
        </div>
      )}

      {/* ERROR */}
      {!loading &&
        error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-5 py-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />

            <div>
              <div className="font-bold text-red-800">
                Monitoring data unavailable
              </div>

              <div className="mt-1 text-xs text-red-700">
                {error}
              </div>
            </div>
          </div>
        )}

      {/* NO DATA */}
      {!loading &&
        !error &&
        readings.length === 0 && (
          <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50 px-5 py-5 flex items-start gap-3">
            <Activity className="h-5 w-5 text-blue-600 mt-0.5" />

            <div>
              <div className="font-bold text-navy-dark">
                Waiting for generation history
              </div>

              <div className="mt-1 text-sm text-slate-500">
                Add generation observations before
                project-specific AI analysis can
                build its fingerprint.
              </div>
            </div>
          </div>
        )}

      {/* DATA AVAILABLE */}
      {!loading &&
        !error &&
        readings.length > 0 && (
          <>
            {/* CONNECTED */}
            <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />

              <div className="flex-1">
                <div className="font-bold text-emerald-900">
                  Project generation history
                  connected
                </div>

                <div className="mt-1 text-xs text-emerald-700">
                  SolarIQ+ is using{" "}
                  {readings.length} project-linked
                  generation observations for
                  performance intelligence.
                </div>
              </div>

              <div className="hidden sm:flex items-center gap-2 rounded-full bg-white/70 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                <Database className="h-3 w-3" />

                {readings.length} records
              </div>
            </div>

            {/* DEMO DATA NOTICE */}
            {demoCount > 0 && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3">
                <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-amber-700">
                  <Database className="h-4 w-4" />

                  Demo integration data
                </div>

                <p className="mt-1 text-xs leading-relaxed text-amber-700">
                  {demoCount} project observations are
                  currently from the Enphase demo
                  integration. They are not real
                  inverter/customer readings.
                </p>
              </div>
            )}

            {/* TOP METRICS */}
            <div className="mt-6 grid sm:grid-cols-2 xl:grid-cols-4 gap-4">

              <MetricCard
                icon={Activity}
                title="Actual Generation"
                value={
                  actual !== null
                    ? actual.toFixed(2)
                    : "—"
                }
                unit="kWh"
                note="Latest project reading"
              />

              <MetricCard
                icon={Target}
                title="Expected Generation"
                value={
                  expected !== null
                    ? expected.toFixed(2)
                    : "—"
                }
                unit="kWh"
                note={
                  expectedSource ===
                  "weather-adjusted"
                    ? "Weather-adjusted estimate"
                    : expectedSource ===
                      "project-baseline"
                      ? "Project baseline fallback"
                      : "Waiting for usable data"
                }
              />

              <MetricCard
                icon={TrendingUp}
                title="Performance"
                value={
                  performance !== null
                    ? performance.toFixed(1)
                    : "—"
                }
                unit="%"
                note={
                  performance !== null
                    ? "Latest actual vs expected"
                    : "Not calculated"
                }
              />

              <MetricCard
                icon={BrainCircuit}
                title="AI Status"
                value={
                  performance !== null
                    ? status
                    : fingerprint.ready
                      ? "FINGERPRINT"
                      : "BUILDING"
                }
                unit=""
                note={
                  performance !== null
                    ? "Generation + project baseline"
                    : "Project history"
                }
              />

            </div>

            {/* PROJECT HISTORY SUMMARY */}
            <div className="mt-5 grid sm:grid-cols-2 xl:grid-cols-4 gap-4">

              <MetricCard
                icon={Database}
                title="History"
                value={
                  readings.length
                }
                unit="days"
                note="Project observations"
              />

              <MetricCard
                icon={BarChart3}
                title="Total Generation"
                value={
                  totalGeneration.toFixed(
                    2
                  )
                }
                unit="kWh"
                note="Imported project history"
              />

              <MetricCard
                icon={Gauge}
                title="Average Daily"
                value={
                  averageGeneration !==
                  null
                    ? averageGeneration.toFixed(
                        2
                      )
                    : "—"
                }
                unit="kWh"
                note="Project baseline"
              />

              <MetricCard
                icon={CalendarDays}
                title="Fingerprint"
                value={
                  fingerprintState
                }
                unit=""
                note={`${fingerprint.count || 0} observations used`}
              />

            </div>

            {/* ACTUAL VS EXPECTED */}
            <div className="mt-6 rounded-xl bg-navy-dark overflow-hidden">

              <div className="px-6 py-5 border-b border-white/10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">

                <div>
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-blue-300">
                    <GitCompare className="h-4 w-4" />
                    Actual vs Expected
                  </div>

                  <h2 className="mt-2 text-xl font-extrabold text-white">
                    Latest project performance
                  </h2>

                  <p className="mt-1 text-xs text-slate-300">
                    Reading date:{" "}
                    {formatDate(
                      latest?.reading_date
                    )}
                  </p>
                </div>

                <StatusBadge
                  status={status}
                />
              </div>

              <div className="grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-white/10">

                <DarkMetric
                  label="Actual Generation"
                  value={
                    actual !== null
                      ? actual.toFixed(2)
                      : "—"
                  }
                  unit="kWh"
                />

                <DarkMetric
                  label="Expected Generation"
                  value={
                    expected !== null
                      ? expected.toFixed(2)
                      : "—"
                  }
                  unit="kWh"
                />

                <DarkMetric
                  label="Performance"
                  value={
                    performance !== null
                      ? performance.toFixed(1)
                      : "—"
                  }
                  unit="%"
                />

              </div>
            </div>

            {/* WEATHER */}
            <div className="mt-5 grid md:grid-cols-2 xl:grid-cols-4 gap-4">

              <MetricCard
                icon={Activity}
                title="Solar Radiation"
                value={
                  radiation !== null
                    ? radiation
                    : "—"
                }
                unit="W/m²"
                note={
                  weather
                    ? radiation !== null &&
                      radiation > 25
                      ? "Current usable observation"
                      : "Current observation is zero/low"
                    : "Weather unavailable"
                }
              />

              <MetricCard
                icon={Activity}
                title="Temperature"
                value={
                  temperature !== null
                    ? temperature
                    : "—"
                }
                unit="°C"
                note={
                  weather
                    ? "Current condition"
                    : "Weather unavailable"
                }
              />

              <MetricCard
                icon={Activity}
                title="Cloud Cover"
                value={
                  cloudCover !== null
                    ? cloudCover
                    : "—"
                }
                unit="%"
                note={
                  weather
                    ? "Current condition"
                    : "Weather unavailable"
                }
              />

              <MetricCard
                icon={Activity}
                title="Wind Speed"
                value={
                  windSpeed !== null
                    ? windSpeed
                    : "—"
                }
                unit="km/h"
                note={
                  weather
                    ? "Current condition"
                    : "Weather unavailable"
                }
              />

            </div>

            {/* FALLBACK EXPLANATION */}
            {expectedSource ===
              "project-baseline" && (
              <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 px-5 py-4">
                <div className="flex items-start gap-3">
                  <Target className="h-5 w-5 text-blue-600 mt-0.5" />

                  <div>
                    <div className="text-sm font-bold text-navy-dark">
                      Project-baseline estimate in use
                    </div>

                    <p className="mt-1 text-xs leading-relaxed text-slate-600">
                      The current weather observation reports
                      very low or zero solar radiation. SolarIQ+
                      does not interpret that instantaneous value
                      as zero daily production. The project's
                      observed daily-generation baseline is being
                      used temporarily for the Actual vs Expected
                      comparison.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* AI PIPELINE + INTELLIGENCE */}
            <div className="mt-6 grid xl:grid-cols-[1.2fr_1fr] gap-5">

              <section className="rounded-xl border border-slate-200 bg-white">

                <div className="p-5 border-b border-slate-100">
                  <h2 className="font-bold text-navy-dark">
                    Monitoring pipeline
                  </h2>

                  <p className="mt-1 text-xs text-slate-500">
                    Project-specific intelligence
                    built from the registered
                    system.
                  </p>
                </div>

                <div className="p-5 space-y-4">

                  <PipelineRow
                    number="01"
                    title="Generation data"
                    text={`${readings.length} observations loaded`}
                    done={
                      readings.length > 0
                    }
                  />

                  <PipelineRow
                    number="02"
                    title="Weather data"
                    text={
                      weather
                        ? "Current weather connected"
                        : "Weather unavailable"
                    }
                    done={!!weather}
                  />

                  <PipelineRow
                    number="03"
                    title="Expected generation"
                    text={
                      expected !== null
                        ? expectedSource ===
                          "weather-adjusted"
                          ? `${expected.toFixed(
                              2
                            )} kWh weather-adjusted estimate`
                          : `${expected.toFixed(
                              2
                            )} kWh project-baseline estimate`
                        : "Waiting for usable data"
                    }
                    done={
                      expected !== null
                    }
                  />

                  <PipelineRow
                    number="04"
                    title="Actual vs Expected"
                    text={
                      performance !==
                      null
                        ? `${performance.toFixed(
                            1
                          )}% performance`
                        : "Waiting for expected generation"
                    }
                    done={
                      performance !==
                      null
                    }
                  />

                  <PipelineRow
                    number="05"
                    title="Performance fingerprint"
                    text={
                      fingerprint.ready
                        ? `${fingerprint.count} observations establish the project baseline`
                        : `Need more observations (${fingerprint.count}/3 minimum)`
                    }
                    done={
                      fingerprint.ready
                    }
                  />

                  <PipelineRow
                    number="06"
                    title="Anomaly screening"
                    text={
                      anomalyResult.ready
                        ? `${anomalyResult.anomalyCount} unusual generation pattern${
                            anomalyResult.anomalyCount ===
                            1
                              ? ""
                              : "s"
                          } detected`
                        : "Building from project history"
                    }
                    done={
                      anomalyResult.ready
                    }
                  />

                  <PipelineRow
                    number="07"
                    title="Maintenance signal"
                    text={
                      maintenanceSignal.title
                    }
                    done={
                      maintenanceSignal.level !==
                      "building"
                    }
                  />

                </div>
              </section>

              <section className="rounded-xl border border-blue-100 bg-blue-50">

                <div className="p-5">

                  <div className="flex items-center gap-2">
                    <BrainCircuit className="h-5 w-5 text-blue-600" />

                    <h2 className="font-bold text-navy-dark">
                      Project intelligence
                    </h2>
                  </div>

                  <div className="mt-5 space-y-4">

                    <InfoRow
                      label="System capacity"
                      value={
                        capacity
                          ? `${capacity} kW`
                          : "Not provided"
                      }
                    />

                    <InfoRow
                      label="Observations"
                      value={`${readings.length} days`}
                    />

                    <InfoRow
                      label="Average generation"
                      value={
                        averageGeneration !==
                        null
                          ? `${averageGeneration.toFixed(
                              2
                            )} kWh/day`
                          : "—"
                      }
                    />

                    <InfoRow
                      label="Latest generation"
                      value={
                        actual !== null
                          ? `${actual.toFixed(
                              2
                            )} kWh`
                          : "—"
                      }
                    />

                    <InfoRow
                      label="Expected generation"
                      value={
                        expected !==
                        null
                          ? `${expected.toFixed(
                              2
                            )} kWh`
                          : "—"
                      }
                    />

                    <InfoRow
                      label="Performance"
                      value={
                        performance !==
                        null
                          ? `${performance.toFixed(
                              1
                            )}%`
                          : "—"
                      }
                    />

                    <InfoRow
                      label="Deviation"
                      value={
                        deviation !==
                        null
                          ? `${
                              deviation >
                              0
                                ? "+"
                                : ""
                            }${deviation}%`
                          : "—"
                      }
                    />

                  </div>

                  <div className="mt-5 rounded-lg border border-blue-100 bg-white p-4">

                    <div className="text-xs font-bold text-navy-dark">
                      Data source
                    </div>

                    <p className="mt-1 text-xs leading-relaxed text-slate-500">
                      These intelligence values are
                      derived from this registered
                      project's generation history.
                      They are not customer values
                      copied from the reference ML
                      training dataset.
                    </p>

                  </div>

                </div>
              </section>

            </div>

            {/* FINGERPRINT */}
            <div className="mt-6 rounded-xl border border-slate-200 bg-white overflow-hidden">

              <div className="px-5 py-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-3">

                <div>
                  <div className="flex items-center gap-2">
                    <BrainCircuit className="h-5 w-5 text-blue-600" />

                    <h2 className="font-bold text-navy-dark">
                      Performance Fingerprint
                    </h2>
                  </div>

                  <p className="mt-1 text-xs text-slate-500">
                    System-specific baseline built from
                    this project's observed generation.
                  </p>
                </div>

                <span
                  className={`inline-flex w-fit rounded-full px-3 py-1.5 text-[10px] uppercase tracking-wider font-bold ${
                    fingerprint.ready
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {fingerprintState}
                </span>

              </div>

              {!fingerprint.ready ? (
                <div className="p-6">

                  <div className="flex items-start gap-3">
                    <BrainCircuit className="h-5 w-5 text-slate-400 mt-0.5" />

                    <div>
                      <div className="text-sm font-bold text-navy-dark">
                        Building from project data
                      </div>

                      <p className="mt-1 text-xs leading-relaxed text-slate-500">
                        At least 3 daily observations
                        are needed to establish the
                        first project-specific generation
                        baseline.
                      </p>

                      <div className="mt-3 text-xs font-semibold text-blue-600">
                        {fingerprint.count || 0}
                        /3 observations available
                      </div>
                    </div>
                  </div>

                </div>
              ) : (
                <div className="p-5 grid sm:grid-cols-2 xl:grid-cols-4 gap-4">

                  <FingerprintMetric
                    label="Mean Daily Generation"
                    value={`${fingerprint.mean.toFixed(
                      2
                    )} kWh`}
                  />

                  <FingerprintMetric
                    label="Median"
                    value={`${fingerprint.median.toFixed(
                      2
                    )} kWh`}
                  />

                  <FingerprintMetric
                    label="Observed Range"
                    value={`${fingerprint.min.toFixed(
                      2
                    )} – ${fingerprint.max.toFixed(
                      2
                    )} kWh`}
                  />

                  <FingerprintMetric
                    label="Variability"
                    value={`${fingerprint.coefficientOfVariation.toFixed(
                      1
                    )}%`}
                  />

                </div>
              )}
            </div>

            {/* ANOMALY */}
            <div className="mt-5 rounded-xl border border-slate-200 bg-white overflow-hidden">

              <div className="px-5 py-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-3">

                <div>
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-5 w-5 text-blue-600" />

                    <h2 className="font-bold text-navy-dark">
                      Anomaly Detection
                    </h2>
                  </div>

                  <p className="mt-1 text-xs text-slate-500">
                    Generation-pattern screening against
                    the project's own fingerprint.
                  </p>
                </div>

                <span
                  className={`inline-flex w-fit rounded-full px-3 py-1.5 text-[10px] uppercase tracking-wider font-bold ${
                    anomalyResult.ready
                      ? anomalyResult.anomalyCount >
                        0
                        ? "bg-amber-50 text-amber-700"
                        : "bg-emerald-50 text-emerald-700"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {anomalyState}
                </span>

              </div>

              <div className="p-5">

                {!anomalyResult.ready ? (
                  <div className="flex items-start gap-3">
                    <ShieldAlert className="h-5 w-5 text-slate-400 mt-0.5" />

                    <div>
                      <div className="text-sm font-bold text-navy-dark">
                        Building from project history
                      </div>

                      <p className="mt-1 text-xs leading-relaxed text-slate-500">
                        More project observations are
                        required before generation-pattern
                        anomalies can be screened.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div>

                    <div className="grid sm:grid-cols-3 gap-4">

                      <FingerprintMetric
                        label="Observations"
                        value={
                          anomalyResult.observations.length
                        }
                      />

                      <FingerprintMetric
                        label="Normal Pattern"
                        value={
                          anomalyResult.normalCount
                        }
                      />

                      <FingerprintMetric
                        label="Unusual Pattern"
                        value={
                          anomalyResult.anomalyCount
                        }
                      />

                    </div>

                    {anomalyResult.anomalyCount >
                      0 && (
                      <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4">

                        <div className="text-xs font-bold text-amber-800">
                          Observations requiring review
                        </div>

                        <div className="mt-3 space-y-2">

                          {anomalyResult.anomalies
                            .slice(-5)
                            .reverse()
                            .map(
                              (
                                anomaly
                              ) => (
                                <div
                                  key={`${anomaly.date}-${anomaly.actual}`}
                                  className="flex items-center justify-between gap-3 text-xs"
                                >
                                  <span className="font-semibold text-amber-800">
                                    {formatDate(
                                      anomaly.date
                                    )}
                                  </span>

                                  <span className="text-amber-700">
                                    {anomaly.actual.toFixed(
                                      2
                                    )}{" "}
                                    kWh
                                  </span>

                                  <span className="font-bold text-amber-800">
                                    {anomaly.deviationPercent >
                                    0
                                      ? "+"
                                      : ""}
                                    {anomaly.deviationPercent.toFixed(
                                      1
                                    )}
                                    %
                                  </span>
                                </div>
                              )
                            )}

                        </div>

                      </div>
                    )}

                    <p className="mt-4 text-[11px] leading-relaxed text-slate-400">
                      This screen is a project-history
                      anomaly screen. A weather-adjusted
                      Isolation Forest result requires the
                      corresponding historical feature set.
                      No physical fault is diagnosed from
                      one generation observation.
                    </p>

                  </div>
                )}

              </div>
            </div>

            {/* MAINTENANCE */}
            <div className="mt-5 rounded-xl border border-slate-200 bg-white overflow-hidden">

              <div className="px-5 py-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-3">

                <div>
                  <div className="flex items-center gap-2">
                    <Wrench className="h-5 w-5 text-blue-600" />

                    <h2 className="font-bold text-navy-dark">
                      Maintenance Signals
                    </h2>
                  </div>

                  <p className="mt-1 text-xs text-slate-500">
                    Persistent project patterns translated
                    into maintenance-oriented guidance.
                  </p>
                </div>

                <MaintenanceBadge
                  level={
                    maintenanceSignal.level
                  }
                />

              </div>

              <div className="p-5">

                <div className="flex items-start gap-3">

                  {maintenanceSignal.level ===
                  "normal" ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5" />
                  ) : maintenanceSignal.level ===
                    "watch" ? (
                    <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
                  ) : (
                    <Wrench className="h-5 w-5 text-slate-400 mt-0.5" />
                  )}

                  <div>

                    <div className="text-sm font-bold text-navy-dark">
                      {
                        maintenanceSignal.title
                      }
                    </div>

                    <p className="mt-1 text-xs leading-relaxed text-slate-500">
                      {
                        maintenanceSignal.text
                      }
                    </p>

                  </div>

                </div>

                {maintenanceSignal.recentLowDays && (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
                    {maintenanceSignal.recentLowDays} of
                    the latest 7 observations were below
                    80% of the project's observed
                    generation baseline.
                  </div>
                )}

              </div>
            </div>

            {/* TECHNICAL NOTE */}
            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5">

              <div className="flex items-start gap-3">

                <Database className="h-5 w-5 text-blue-600 mt-0.5" />

                <div>

                  <div className="text-sm font-bold text-navy-dark">
                    AI data architecture
                  </div>

                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    The trained SolarIQ+ XGBoost model remains
                    the reference prediction model. This page
                    uses the registered project's own generation
                    history for its performance fingerprint and
                    project-pattern screening. Historical
                    weather-adjusted fingerprinting can be
                    strengthened once daily historical weather
                    observations are stored alongside generation.
                  </p>

                </div>

              </div>
            </div>

            {lastUpdated && (
              <div className="mt-5 text-right text-[11px] text-slate-400">
                Last updated{" "}
                {lastUpdated.toLocaleTimeString(
                  "en-IN"
                )}
              </div>
            )}
          </>
        )}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  title,
  value,
  unit,
  note,
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">

      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
          {title}
        </div>

        <Icon className="h-4 w-4 text-blue-500" />
      </div>

      <div className="mt-3 flex items-end gap-2">

        <span className="text-xl font-extrabold text-navy-dark">
          {value}
        </span>

        {unit && (
          <span className="text-xs text-slate-400 mb-1">
            {unit}
          </span>
        )}

      </div>

      <div className="mt-1 text-xs text-slate-500">
        {note}
      </div>

    </div>
  );
}

function DarkMetric({
  label,
  value,
  unit,
}) {
  return (
    <div className="p-6">

      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
        {label}
      </div>

      <div className="mt-2 flex items-end gap-2">

        <span className="text-3xl font-extrabold text-white">
          {value}
        </span>

        <span className="text-xs text-slate-400 mb-1">
          {unit}
        </span>

      </div>

    </div>
  );
}

function PipelineRow({
  number,
  title,
  text,
  done = false,
}) {
  return (
    <div className="flex gap-3">

      <div
        className={`h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
          done
            ? "bg-emerald-100 text-emerald-700"
            : "bg-slate-100 text-slate-500"
        }`}
      >
        {number}
      </div>

      <div>

        <div className="text-sm font-bold text-navy-dark">
          {title}
        </div>

        <div className="mt-0.5 text-xs text-slate-500">
          {text}
        </div>

      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-blue-100 pb-3 last:border-0 last:pb-0">

      <span className="text-xs text-slate-500">
        {label}
      </span>

      <span className="text-sm font-bold text-navy-dark text-right">
        {value}
      </span>

    </div>
  );
}

function FingerprintMetric({
  label,
  value,
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">

      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
        {label}
      </div>

      <div className="mt-2 text-lg font-extrabold text-navy-dark">
        {value}
      </div>

    </div>
  );
}

function MaintenanceBadge({
  level,
}) {
  const config = {
    normal: {
      text: "NO SIGNAL",
      className:
        "bg-emerald-50 text-emerald-700",
    },
    watch: {
      text: "WATCH",
      className:
        "bg-amber-50 text-amber-700",
    },
    building: {
      text: "BUILDING",
      className:
        "bg-slate-100 text-slate-500",
    },
  };

  const current =
    config[level] ||
    config.building;

  return (
    <span
      className={`inline-flex w-fit rounded-full px-3 py-1.5 text-[10px] uppercase tracking-wider font-bold ${current.className}`}
    >
      {current.text}
    </span>
  );
}

function StatusBadge({
  status,
}) {
  const styles = {
    NORMAL:
      "bg-emerald-400/10 text-emerald-300 border-emerald-400/20",
    WATCH:
      "bg-amber-400/10 text-amber-300 border-amber-400/20",
    ATTENTION:
      "bg-red-400/10 text-red-300 border-red-400/20",
    WAITING:
      "bg-slate-400/10 text-slate-300 border-slate-400/20",
  };

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold ${
        styles[status] ||
        styles.WAITING
      }`}
    >
      <span className="h-2 w-2 rounded-full bg-current" />

      {status}
    </div>
  );
}

function formatDate(value) {
  if (!value) {
    return "—";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value;
  }

  return date.toLocaleDateString(
    "en-IN",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  );
}