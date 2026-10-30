import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Upload,
  Database,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  BarChart3,
  CalendarDays,
  Zap,
  TrendingUp,
  Radio,
  BrainCircuit,
} from "lucide-react";
import { useProjectContext } from "@/context/ProjectContext";

const MONITORING_API =
  process.env.REACT_APP_MONITORING_URL ||
  process.env.REACT_APP_MONITORING_BACKEND_URL ||
  "http://127.0.0.1:8001";

function getProjectValue(project, ...keys) {
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

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatShortDate(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  });
}

function getSourceLabel(reading) {
  if (
    reading?.demo === true ||
    reading?.data_mode === "demo" ||
    reading?.source === "demo_enphase_adapter"
  ) {
    return "ENPHASE DEMO";
  }

  if (
    String(reading?.provider || "").toLowerCase() ===
    "enphase"
  ) {
    return "ENPHASE";
  }

  const source =
    reading?.source || "manual";

  return String(source)
    .replace(/_/g, " ")
    .toUpperCase();
}

function isDemoReading(reading) {
  return (
    reading?.demo === true ||
    reading?.data_mode === "demo" ||
    reading?.source === "demo_enphase_adapter"
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  unit,
  note,
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
          {label}
        </div>

        <Icon className="h-4 w-4 text-blue-500" />
      </div>

      <div className="mt-3 flex items-end gap-2">
        <span className="text-2xl font-extrabold text-navy-dark">
          {value}
        </span>

        {unit && (
          <span className="mb-1 text-xs text-slate-400">
            {unit}
          </span>
        )}
      </div>

      {note && (
        <div className="mt-1 text-xs text-slate-500">
          {note}
        </div>
      )}
    </div>
  );
}

function GenerationChart({ readings }) {
  if (!readings.length) {
    return (
      <div className="h-72 flex items-center justify-center text-sm text-slate-400">
        No generation history available.
      </div>
    );
  }

  const width = 1000;
  const height = 300;
  const paddingLeft = 58;
  const paddingRight = 24;
  const paddingTop = 24;
  const paddingBottom = 48;

  const values = readings.map((reading) =>
    Number(reading.actual_generation_kwh || 0)
  );

  const maxValue = Math.max(...values, 1);
  const minValue = Math.min(...values, 0);

  const range =
    maxValue - minValue || 1;

  const chartWidth =
    width -
    paddingLeft -
    paddingRight;

  const chartHeight =
    height -
    paddingTop -
    paddingBottom;

  const points = readings.map(
    (reading, index) => {
      const value = Number(
        reading.actual_generation_kwh || 0
      );

      const x =
        readings.length === 1
          ? width / 2
          : paddingLeft +
            (index /
              (readings.length - 1)) *
              chartWidth;

      const y =
        paddingTop +
        chartHeight -
        ((value - minValue) /
          range) *
          chartHeight;

      return {
        x,
        y,
        value,
        date: reading.reading_date,
      };
    }
  );

  const linePath = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${point.x.toFixed(
          2
        )} ${point.y.toFixed(2)}`
    )
    .join(" ");

  const areaPath = `${linePath} L ${
    points[points.length - 1].x
  } ${height - paddingBottom} L ${
    points[0].x
  } ${height - paddingBottom} Z`;

  const average =
    values.reduce(
      (sum, value) => sum + value,
      0
    ) / values.length;

  const averageY =
    paddingTop +
    chartHeight -
    ((average - minValue) /
      range) *
      chartHeight;

  const yTicks = 4;

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full min-w-[700px]"
        role="img"
        aria-label="Generation history chart"
      >
        {Array.from(
          { length: yTicks + 1 },
          (_, index) => {
            const value =
              minValue +
              (range *
                index) /
                yTicks;

            const y =
              paddingTop +
              chartHeight -
              (chartHeight *
                index) /
                yTicks;

            return (
              <g key={`grid-${index}`}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={
                    width -
                    paddingRight
                  }
                  y2={y}
                  stroke="currentColor"
                  className="text-slate-100"
                  strokeWidth="1"
                />

                <text
                  x={
                    paddingLeft -
                    10
                  }
                  y={y + 4}
                  textAnchor="end"
                  className="fill-slate-400 text-[11px]"
                >
                  {value.toFixed(1)}
                </text>
              </g>
            );
          }
        )}

        <line
          x1={paddingLeft}
          y1={averageY}
          x2={
            width -
            paddingRight
          }
          y2={averageY}
          stroke="currentColor"
          className="text-blue-200"
          strokeWidth="1"
          strokeDasharray="6 6"
        />

        <text
          x={
            width -
            paddingRight
          }
          y={averageY - 7}
          textAnchor="end"
          className="fill-blue-500 text-[10px] font-semibold"
        >
          Average{" "}
          {average.toFixed(2)} kWh
        </text>

        <path
          d={areaPath}
          fill="currentColor"
          className="text-blue-50"
        />

        <path
          d={linePath}
          fill="none"
          stroke="currentColor"
          className="text-blue-600"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {points.map(
          (point, index) => (
            <g
              key={`${point.date}-${index}`}
            >
              <circle
                cx={point.x}
                cy={point.y}
                r="4"
                fill="white"
                stroke="currentColor"
                className="text-blue-600"
                strokeWidth="2"
              />

              {(index === 0 ||
                index ===
                  points.length -
                    1 ||
                index %
                  Math.max(
                    1,
                    Math.floor(
                      points.length /
                        6
                    )
                  ) ===
                  0) && (
                <text
                  x={point.x}
                  y={
                    height -
                    paddingBottom +
                    25
                  }
                  textAnchor="middle"
                  className="fill-slate-400 text-[10px]"
                >
                  {formatShortDate(
                    point.date
                  )}
                </text>
              )}
            </g>
          )
        )}
      </svg>
    </div>
  );
}

function SourceBadge({ reading }) {
  const demo = isDemoReading(
    reading
  );

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider ${
        demo
          ? "bg-amber-50 text-amber-700"
          : "bg-blue-50 text-blue-700"
      }`}
    >
      {getSourceLabel(reading)}
    </span>
  );
}

export default function GenerationData() {
  const { activeProject } =
    useProjectContext();

  const project =
    activeProject || {};

  const projectId =
    project.id;

  const capacity =
    getProjectValue(
      project,
      "capacity_kw",
      "capacityKw",
      "system_capacity_kw",
      "systemCapacityKw"
    );

  const projectName =
    getProjectValue(
      project,
      "name",
      "project_name"
    ) || "Solar Project";

  const [
    readings,
    setReadings,
  ] = useState([]);

  const [
    loadingHistory,
    setLoadingHistory,
  ] = useState(false);

  const [
    historyError,
    setHistoryError,
  ] = useState("");

  const [
    date,
    setDate,
  ] = useState(() =>
    new Date()
      .toISOString()
      .slice(0, 10)
  );

  const [
    generation,
    setGeneration,
  ] = useState("");

  const [
    source,
    setSource,
  ] = useState("manual");

  const [
    message,
    setMessage,
  ] = useState("");

  async function loadHistory() {
    if (!projectId) {
      setReadings([]);
      return;
    }

    setLoadingHistory(true);
    setHistoryError("");

    try {
      const response =
        await fetch(
          `${MONITORING_API}/api/monitoring/generation/${projectId}`
        );

      const data =
        await response
          .json()
          .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data?.detail ||
            "Could not load generation history."
        );
      }

      const history =
        Array.isArray(
          data?.readings
        )
          ? data.readings
          : [];

      setReadings(history);
    } catch (error) {
      console.error(
        "Generation history loading failed:",
        error
      );

      setHistoryError(
        error?.message ||
          "Could not load generation history."
      );
    } finally {
      setLoadingHistory(false);
    }
  }

  useEffect(() => {
    loadHistory();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const sortedReadings =
    useMemo(() => {
      return [...readings].sort(
        (a, b) =>
          String(
            a.reading_date
          ).localeCompare(
            String(
              b.reading_date
            )
          )
      );
    }, [readings]);

  const statistics =
    useMemo(() => {
      const values =
        sortedReadings
          .map((reading) =>
            Number(
              reading.actual_generation_kwh ||
                0
            )
          )
          .filter(
            (value) =>
              Number.isFinite(
                value
              )
          );

      if (!values.length) {
        return {
          total: 0,
          average: 0,
          minimum: 0,
          maximum: 0,
        };
      }

      return {
        total: values.reduce(
          (sum, value) =>
            sum + value,
          0
        ),
        average:
          values.reduce(
            (sum, value) =>
              sum + value,
            0
          ) /
          values.length,
        minimum:
          Math.min(...values),
        maximum:
          Math.max(...values),
      };
    }, [sortedReadings]);

  const latest =
    sortedReadings.length
      ? sortedReadings[
          sortedReadings.length - 1
        ]
      : null;

  const first =
    sortedReadings.length
      ? sortedReadings[0]
      : null;

  const demoRecords =
    sortedReadings.filter(
      isDemoReading
    ).length;

  const canSubmit =
    !!projectId &&
    generation !== "" &&
    Number.isFinite(
      Number(generation)
    ) &&
    Number(generation) >= 0 &&
    !!date;

  const [
    saving,
    setSaving,
  ] = useState(false);

  async function saveReading() {
    if (!canSubmit) return;

    setSaving(true);
    setMessage("");

    try {
      const response =
        await fetch(
          `${MONITORING_API}/api/monitoring/generation`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              project_id:
                projectId,
              reading_date:
                date,
              actual_generation_kwh:
                Number(
                  generation
                ),
              source,
            }),
          }
        );

      const data =
        await response
          .json()
          .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data?.detail ||
            "Could not save the generation reading."
        );
      }

      setMessage(
        "Generation reading saved successfully to this project."
      );

      setGeneration("");

      await loadHistory();
    } catch (error) {
      setMessage(
        error?.message ||
          "Could not save the generation reading."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-5 py-8">

        {/* HEADER */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">

          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-600">
              <Activity className="h-4 w-4" />
              Existing System Monitoring
            </div>

            <h1 className="mt-2 text-3xl font-extrabold text-navy-dark font-display">
              Generation Data
            </h1>

            <p className="mt-2 text-sm text-slate-500 max-w-3xl">
              View the generation history collected for
              the registered solar system. SolarIQ+
              uses these project-linked observations for
              performance analysis and AI monitoring.
            </p>
          </div>

          <div className="flex items-center gap-3">

            <button
              type="button"
              onClick={loadHistory}
              disabled={
                loadingHistory ||
                !projectId
              }
              className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${
                  loadingHistory
                    ? "animate-spin"
                    : ""
                }`}
              />

              Refresh
            </button>

            <div className="rounded-md border border-slate-200 bg-white px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                Project
              </div>

              <div className="mt-1 text-sm font-bold text-navy-dark">
                {projectName}
              </div>

              <div className="text-xs text-slate-500">
                {capacity
                  ? `${capacity} kW system`
                  : "Capacity not provided"}
              </div>
            </div>

          </div>
        </div>

        {/* NO PROJECT */}
        {!projectId && (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 flex gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />

            <div>
              <div className="font-semibold text-slate-800">
                No active project
              </div>

              <div className="text-sm text-slate-600 mt-1">
                Register or select an existing solar
                system before viewing generation data.
              </div>
            </div>
          </div>
        )}

        {/* ERROR */}
        {historyError && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 flex gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />

            <div>
              <div className="font-semibold text-red-800">
                Generation history unavailable
              </div>

              <div className="text-sm text-red-700 mt-1">
                {historyError}
              </div>
            </div>
          </div>
        )}

        {/* CONNECTED DATA */}
        {projectId &&
          !historyError &&
          sortedReadings.length >
            0 && (
            <>
              <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />

                <div className="flex-1">
                  <div className="font-bold text-emerald-900">
                    Generation data connected
                  </div>

                  <div className="mt-1 text-xs text-emerald-700">
                    SolarIQ+ has{" "}
                    {sortedReadings.length}{" "}
                    project-linked generation
                    observations available for monitoring.
                  </div>
                </div>

                <div className="hidden sm:flex items-center gap-2 rounded-full bg-white/70 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                  <Database className="h-3 w-3" />

                  {sortedReadings.length} records
                </div>
              </div>

              {/* DEMO NOTICE */}
              {demoRecords > 0 && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3">
                  <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-amber-700">
                    <Radio className="h-4 w-4" />

                    Enphase Demo Integration
                  </div>

                  <p className="mt-1 text-xs leading-relaxed text-amber-700">
                    {demoRecords} records are currently
                    from the Enphase demo integration.
                    They are generated integration data,
                    not real inverter/customer readings.
                  </p>
                </div>
              )}

              {/* STATISTICS */}
              <div className="mt-6 grid sm:grid-cols-2 xl:grid-cols-4 gap-4">

                <StatCard
                  icon={Database}
                  label="Records"
                  value={
                    sortedReadings.length
                  }
                  unit="days"
                  note="Project generation history"
                />

                <StatCard
                  icon={Zap}
                  label="Total Generation"
                  value={statistics.total.toFixed(
                    2
                  )}
                  unit="kWh"
                  note="Across imported history"
                />

                <StatCard
                  icon={TrendingUp}
                  label="Average Daily"
                  value={statistics.average.toFixed(
                    2
                  )}
                  unit="kWh"
                  note="Project generation baseline"
                />

                <StatCard
                  icon={BarChart3}
                  label="Observed Range"
                  value={`${statistics.minimum.toFixed(
                    2
                  )} – ${statistics.maximum.toFixed(
                    2
                  )}`}
                  unit="kWh"
                  note="Minimum to maximum"
                />

              </div>

              {/* CHART */}
              <section className="mt-6 rounded-xl border border-slate-200 bg-white overflow-hidden">

                <div className="px-5 py-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-4">

                  <div>
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5 text-blue-600" />

                      <h2 className="font-bold text-navy-dark">
                        Generation History
                      </h2>
                    </div>

                    <p className="mt-1 text-xs text-slate-500">
                      Daily generation recorded for{" "}
                      {projectName}.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <CalendarDays className="h-4 w-4" />

                    {formatDate(
                      first?.reading_date
                    )}{" "}
                    –{" "}
                    {formatDate(
                      latest?.reading_date
                    )}
                  </div>

                </div>

                <div className="p-5">
                  <GenerationChart
                    readings={
                      sortedReadings
                    }
                  />
                </div>

              </section>

              {/* LATEST */}
              <section className="mt-5 grid lg:grid-cols-[1fr_1fr] gap-5">

                <div className="rounded-xl border border-blue-100 bg-blue-50 p-5">

                  <div className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-blue-600" />

                    <h2 className="font-bold text-navy-dark">
                      Latest generation
                    </h2>
                  </div>

                  <div className="mt-4 flex items-end gap-2">
                    <span className="text-4xl font-extrabold text-navy-dark">
                      {Number(
                        latest?.actual_generation_kwh ||
                          0
                      ).toFixed(2)}
                    </span>

                    <span className="mb-1.5 text-sm text-slate-500">
                      kWh
                    </span>
                  </div>

                  <div className="mt-2 text-xs text-slate-500">
                    {formatDate(
                      latest?.reading_date
                    )}
                  </div>

                  <div className="mt-3">
                    <SourceBadge
                      reading={
                        latest
                      }
                    />
                  </div>

                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5">

                  <div className="flex items-center gap-2">
                    <BrainCircuit className="h-5 w-5 text-blue-600" />

                    <h2 className="font-bold text-navy-dark">
                      AI monitoring
                    </h2>
                  </div>

                  <p className="mt-2 text-sm text-slate-500">
                    These generation observations are
                    available to SolarIQ+ AI Insights for
                    Actual vs Expected, project fingerprint,
                    anomaly screening, and maintenance
                    signals.
                  </p>

                  <a
                    href="/monitoring/ai"
                    className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-blue-600 hover:text-blue-700"
                  >
                    Open AI Insights

                    <ArrowRight className="h-3.5 w-3.5" />
                  </a>

                </div>

              </section>

              {/* HISTORY TABLE */}
              <section className="mt-6 rounded-xl border border-slate-200 bg-white overflow-hidden">

                <div className="px-5 py-5 border-b border-slate-100 flex items-center justify-between gap-4">

                  <div>
                    <h2 className="font-bold text-navy-dark">
                      Daily Generation Records
                    </h2>

                    <p className="mt-1 text-xs text-slate-500">
                      Project-linked observations collected
                      by SolarIQ+.
                    </p>
                  </div>

                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {sortedReadings.length} records
                  </div>

                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[650px]">

                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Date
                        </th>

                        <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Generation
                        </th>

                        <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Source
                        </th>

                        <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Data Mode
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {[...sortedReadings]
                        .reverse()
                        .map(
                          (
                            reading,
                            index
                          ) => (
                            <tr
                              key={`${reading.reading_date}-${index}`}
                              className="border-b border-slate-50 last:border-0 hover:bg-slate-50"
                            >
                              <td className="px-5 py-3.5 text-sm font-semibold text-slate-700">
                                {formatDate(
                                  reading.reading_date
                                )}
                              </td>

                              <td className="px-5 py-3.5">
                                <span className="text-sm font-bold text-navy-dark">
                                  {Number(
                                    reading.actual_generation_kwh ||
                                      0
                                  ).toFixed(
                                    2
                                  )}{" "}
                                  kWh
                                </span>
                              </td>

                              <td className="px-5 py-3.5">
                                <SourceBadge
                                  reading={
                                    reading
                                  }
                                />
                              </td>

                              <td className="px-5 py-3.5">
                                <span className="text-xs text-slate-500">
                                  {isDemoReading(
                                    reading
                                  )
                                    ? "Demo integration"
                                    : "Project data"}
                                </span>
                              </td>
                            </tr>
                          )
                        )}
                    </tbody>

                  </table>
                </div>

              </section>

              {/* MANUAL FALLBACK */}
              <section className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">

                <div className="p-5 border-b border-slate-100">

                  <div className="flex items-center gap-2">
                    <Upload className="h-5 w-5 text-slate-500" />

                    <h2 className="font-bold text-navy-dark">
                      Add a manual generation reading
                    </h2>
                  </div>

                  <p className="text-xs text-slate-500 mt-1">
                    Manual entry remains available when
                    automatic inverter data is unavailable.
                  </p>

                </div>

                <div className="p-5">

                  <div className="grid md:grid-cols-3 gap-5">

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-2">
                        Reading date
                      </label>

                      <input
                        type="date"
                        value={date}
                        onChange={(e) =>
                          setDate(
                            e.target.value
                          )
                        }
                        className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-2">
                        Actual generation (kWh)
                      </label>

                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={
                          generation
                        }
                        onChange={(e) =>
                          setGeneration(
                            e.target.value
                          )
                        }
                        placeholder="Example: 12.50"
                        className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500"
                      />

                      <p className="text-[11px] text-slate-400 mt-1.5">
                        Use a value from the inverter,
                        monitoring portal, meter, or
                        recorded source.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-2">
                        Data source
                      </label>

                      <select
                        value={source}
                        onChange={(e) =>
                          setSource(
                            e.target.value
                          )
                        }
                        className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500"
                      >
                        <option value="manual">
                          Manual reading
                        </option>

                        <option value="inverter">
                          Inverter / monitoring portal
                        </option>

                        <option value="csv">
                          CSV upload
                        </option>

                        <option value="screenshot">
                          Screenshot / meter record
                        </option>
                      </select>
                    </div>

                  </div>

                  <div className="mt-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">

                    <div className="text-xs text-slate-500">
                      {!projectId
                        ? "No active project"
                        : canSubmit
                          ? "Ready to save"
                          : "Enter generation in kWh"}
                    </div>

                    <button
                      type="button"
                      disabled={
                        !canSubmit ||
                        saving
                      }
                      onClick={
                        saveReading
                      }
                      className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {saving
                        ? "Saving..."
                        : "Save reading"}

                      <ArrowRight className="h-4 w-4" />
                    </button>

                  </div>

                  {message && (
                    <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                      {message}
                    </div>
                  )}

                </div>
              </section>

              {/* DATA CONNECTION MODES */}
              <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">

                <div className="flex items-center gap-2">
                  <Database className="h-5 w-5 text-slate-500" />

                  <h2 className="font-bold text-navy-dark">
                    Data connection modes
                  </h2>
                </div>

                <div className="mt-4 grid sm:grid-cols-2 xl:grid-cols-4 gap-3">

                  <div className="rounded-lg bg-slate-50 p-4">
                    <div className="text-xs font-bold text-navy-dark">
                      Basic
                    </div>

                    <div className="mt-1 text-xs text-slate-500">
                      System details + location.
                    </div>
                  </div>

                  <div className="rounded-lg bg-slate-50 p-4">
                    <div className="text-xs font-bold text-navy-dark">
                      Assisted
                    </div>

                    <div className="mt-1 text-xs text-slate-500">
                      Manual readings and screenshots.
                    </div>
                  </div>

                  <div className="rounded-lg bg-blue-50 p-4">
                    <div className="text-xs font-bold text-blue-800">
                      Connected
                    </div>

                    <div className="mt-1 text-xs text-blue-700">
                      Generation + weather.
                    </div>
                  </div>

                  <div className="rounded-lg bg-emerald-50 p-4">
                    <div className="text-xs font-bold text-emerald-800">
                      Integrated
                    </div>

                    <div className="mt-1 text-xs text-emerald-700">
                      Automatic inverter / API data.
                    </div>
                  </div>

                </div>

              </section>

              {/* TECHNICAL NOTE */}
              <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5">

                <div className="flex items-start gap-3">

                  <Database className="h-5 w-5 text-blue-600 mt-0.5" />

                  <div>

                    <div className="text-sm font-bold text-navy-dark">
                      SolarIQ+ monitoring architecture
                    </div>

                    <p className="mt-1 text-xs leading-relaxed text-slate-500">
                      Generation observations are stored
                      against the registered project. The
                      same project-linked data is consumed
                      by the AI Insights page for expected
                      generation, Actual vs Expected,
                      performance fingerprinting, anomaly
                      screening, and maintenance signals.
                    </p>

                  </div>

                </div>

              </div>
            </>
          )}

        {/* EMPTY STATE */}
        {projectId &&
          !loadingHistory &&
          !historyError &&
          sortedReadings.length ===
            0 && (
            <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50 p-6 text-center">

              <Database className="mx-auto h-8 w-8 text-blue-500" />

              <h2 className="mt-3 font-bold text-navy-dark">
                No generation history yet
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Once inverter or manual generation
                readings are recorded, they will appear
                here and become available to AI Insights.
              </p>

            </div>
          )}

      </div>
    </div>
  );
}