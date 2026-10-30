import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Database,
  RefreshCw,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import { useProjectContext } from "@/context/ProjectContext";

const MONITORING_SERVER_URL =
  process.env.REACT_APP_MONITORING_URL || "http://127.0.0.1:8001";

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function number(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getFingerprint(readings) {
  const values = readings
    .map((reading) => number(reading?.actual_generation_kwh))
    .filter((value) => value !== null);

  if (!values.length) {
    return {
      ready: false,
      count: 0,
      mean: null,
      median: null,
      min: null,
      max: null,
      standardDeviation: null,
      coefficientOfVariation: null,
    };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    values.length;
  const standardDeviation = Math.sqrt(variance);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle];

  return {
    ready: values.length >= 5,
    count: values.length,
    mean,
    median,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    standardDeviation,
    coefficientOfVariation:
      mean > 0 ? (standardDeviation / mean) * 100 : 0,
  };
}

function buildMaintenanceSignal(readings, fingerprint, latestActual) {
  if (!fingerprint.ready || readings.length < 5) {
    return {
      level: "building",
      status: "BUILDING",
      title: "Collecting project history",
      text:
        "More daily observations are needed before a persistent maintenance signal can be evaluated.",
      recentLowDays: 0,
    };
  }

  const recent = readings.slice(-7);
  const baseline = fingerprint.mean;
  const recentLowDays = recent.filter((reading) => {
    const actual = number(reading?.actual_generation_kwh);
    return actual !== null && actual < baseline * 0.8;
  }).length;

  const latest = number(latestActual);
  const latestBelow =
    latest !== null && baseline > 0 && latest < baseline * 0.8;

  if (recentLowDays >= 3 && latestBelow) {
    return {
      level: "watch",
      status: "WATCH",
      title: "Persistent low-generation pattern",
      text:
        "Recent generation is repeatedly below this project's observed baseline. Review weather conditions and system status before scheduling maintenance.",
      recentLowDays,
    };
  }

  return {
    level: "normal",
    status: "NORMAL",
    title: "No persistent maintenance signal",
    text:
      "The available project generation history does not currently show a persistent low-output pattern requiring maintenance guidance.",
    recentLowDays,
  };
}

function MaintenanceBadge({ level }) {
  const styles = {
    normal: "border-emerald-200 bg-emerald-50 text-emerald-700",
    watch: "border-amber-200 bg-amber-50 text-amber-700",
    building: "border-slate-200 bg-slate-100 text-slate-500",
  };
  const labels = { normal: "NO SIGNAL", watch: "WATCH", building: "BUILDING" };

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${styles[level] || styles.building}`}
    >
      {labels[level] || labels.building}
    </span>
  );
}

function StatCard({ label, value, unit, note }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-2 text-2xl font-extrabold text-navy-dark">
        {value}
        {unit && <span className="ml-1 text-xs font-semibold text-slate-400">{unit}</span>}
      </div>
      {note && <div className="mt-1 text-xs text-slate-400">{note}</div>}
    </div>
  );
}

function SignalIcon({ level }) {
  if (level === "normal") return <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />;
  if (level === "watch") return <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600" />;
  return <Wrench className="mt-0.5 h-5 w-5 text-slate-400" />;
}

function formatPercent(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)}%` : "—";
}

export default function MonitoringMaintenance() {
  const { activeProject } = useProjectContext();
  const [readings, setReadings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const projectId = activeProject?.id || null;

  const loadData = useCallback(async ({ silent = false } = {}) => {
    if (!projectId) {
      setReadings([]);
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    setRefreshing(true);
    setError("");
    try {
      const response = await fetch(
        `${MONITORING_SERVER_URL}/api/monitoring/generation/${projectId}`
      );
      if (!response.ok) throw new Error("Generation history could not be loaded.");
      const data = await response.json();
      const history = Array.isArray(data?.readings)
        ? data.readings
            .filter(
              (reading) =>
                reading &&
                reading.reading_date &&
                number(reading.actual_generation_kwh) !== null
            )
            .sort((a, b) => String(a.reading_date).localeCompare(String(b.reading_date)))
        : [];
      setReadings(history);
    } catch (err) {
      setError(err?.message || "Unable to load project generation history from the monitoring service.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const fingerprint = useMemo(() => getFingerprint(readings), [readings]);
  const latest = readings.length ? readings[readings.length - 1] : null;
  const latestActual = number(latest?.actual_generation_kwh);
  const averageGeneration = fingerprint.mean;
  const recentReadings = useMemo(() => readings.slice(-7).reverse(), [readings]);

  const recentAverage = useMemo(() => {
    const values = recentReadings
      .map((reading) => number(reading?.actual_generation_kwh))
      .filter((value) => value !== null);
    if (!values.length) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }, [recentReadings]);

  const lowOutputDays = useMemo(() => {
    if (!fingerprint.mean) return 0;
    return readings.slice(-7).filter((reading) => {
      const actual = number(reading?.actual_generation_kwh);
      return actual !== null && actual < fingerprint.mean * 0.8;
    }).length;
  }, [readings, fingerprint.mean]);

  const totalGeneration = useMemo(
    () => readings.reduce((sum, reading) => sum + (number(reading?.actual_generation_kwh, 0) || 0), 0),
    [readings]
  );

  const observedRange =
    fingerprint.min !== null && fingerprint.max !== null
      ? `${fingerprint.min.toFixed(2)} – ${fingerprint.max.toFixed(2)}`
      : "—";

  const maintenanceSignal = useMemo(
    () => buildMaintenanceSignal(readings, fingerprint, latestActual),
    [readings, fingerprint, latestActual]
  );

  const hasDemoData = useMemo(
    () =>
      readings.some(
        (reading) =>
          reading?.demo === true ||
          String(reading?.data_mode || "").toLowerCase() === "demo" ||
          String(reading?.source || "").toLowerCase().includes("demo")
      ),
    [readings]
  );

  const latestBaselinePercent =
    latestActual !== null && averageGeneration > 0
      ? (latestActual / averageGeneration) * 100
      : null;

  if (!activeProject) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-8">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-600">
          <Wrench className="h-4 w-4" /> Existing System Monitoring
        </div>
        <h1 className="mt-2 font-display text-3xl font-extrabold text-navy-dark">Maintenance</h1>
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-8">
          <div className="text-sm font-bold text-navy-dark">No monitoring project selected</div>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
            Open an existing solar system project first. SolarIQ+ maintenance guidance is calculated from that project's own generation history.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-600">
            <Wrench className="h-4 w-4" /> Existing System Monitoring
          </div>
          <h1 className="mt-2 font-display text-3xl font-extrabold text-navy-dark">Maintenance</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            Project-specific maintenance guidance based on the registered system's generation history. SolarIQ+ looks for persistent performance patterns rather than diagnosing a physical fault from a single reading.
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadData()}
          disabled={refreshing}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh maintenance
        </button>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-blue-50 p-3"><Wrench className="h-5 w-5 text-blue-600" /></div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Registered solar system</div>
              <div className="mt-1 text-lg font-extrabold text-navy-dark">{activeProject.name || "Solar System"}</div>
              <div className="mt-1 text-xs text-slate-500">
                {activeProject.capacity_kw ? `${activeProject.capacity_kw} kW installed capacity` : "Installed capacity not provided"}
              </div>
            </div>
          </div>
          <MaintenanceBadge level={maintenanceSignal.level} />
        </div>
      </div>

      {error && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-8">
          <div className="text-sm font-bold text-navy-dark">Loading project maintenance intelligence…</div>
          <p className="mt-2 text-sm text-slate-500">SolarIQ+ is reading the generation history connected to this project.</p>
        </div>
      ) : (
        <>
          <div className={`mt-5 rounded-xl border p-6 ${maintenanceSignal.level === "watch" ? "border-amber-200 bg-amber-50" : maintenanceSignal.level === "normal" ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
            <div className="flex items-start gap-3">
              <SignalIcon level={maintenanceSignal.level} />
              <div className="flex-1">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Maintenance signal</div>
                    <h2 className="mt-1 text-lg font-extrabold text-navy-dark">{maintenanceSignal.title}</h2>
                    <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">{maintenanceSignal.text}</p>
                  </div>
                  <MaintenanceBadge level={maintenanceSignal.level} />
                </div>
                {maintenanceSignal.recentLowDays > 0 && (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-white/70 px-4 py-3 text-xs font-medium text-amber-800">
                    {maintenanceSignal.recentLowDays} of the latest 7 observations were below 80% of this project's observed generation baseline.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-4">
            <StatCard label="Observations" value={readings.length} unit="days" note="Project-linked history" />
            <StatCard label="Average generation" value={averageGeneration !== null ? averageGeneration.toFixed(2) : "—"} unit="kWh/day" note="Project baseline" />
            <StatCard label="Recent average" value={recentAverage !== null ? recentAverage.toFixed(2) : "—"} unit="kWh/day" note="Latest 7 observations" />
            <StatCard label="Low-output days" value={lowOutputDays} unit="/ 7" note="Below 80% of baseline" />
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-5 py-4">
                <div className="flex items-center gap-2"><Database className="h-5 w-5 text-blue-600" /><h2 className="font-bold text-navy-dark">Project maintenance baseline</h2></div>
                <p className="mt-1 text-xs text-slate-500">Derived from the registered system's own generation history.</p>
              </div>
              <div className="divide-y divide-slate-100">
                <div className="flex items-center justify-between px-5 py-4"><span className="text-xs text-slate-500">Historical baseline</span><span className="text-sm font-bold text-navy-dark">{averageGeneration !== null ? `${averageGeneration.toFixed(2)} kWh/day` : "—"}</span></div>
                <div className="flex items-center justify-between px-5 py-4"><span className="text-xs text-slate-500">Recent 7-day average</span><span className="text-sm font-bold text-navy-dark">{recentAverage !== null ? `${recentAverage.toFixed(2)} kWh/day` : "—"}</span></div>
                <div className="flex items-center justify-between px-5 py-4"><span className="text-xs text-slate-500">Recent low-output days</span><span className="text-sm font-bold text-navy-dark">{lowOutputDays} / 7</span></div>
                <div className="flex items-center justify-between px-5 py-4"><span className="text-xs text-slate-500">Latest reading</span><span className="text-sm font-bold text-navy-dark">{latestActual !== null ? `${latestActual.toFixed(2)} kWh` : "—"}</span></div>
                <div className="flex items-center justify-between px-5 py-4"><span className="text-xs text-slate-500">Latest vs baseline</span><span className="text-sm font-bold text-navy-dark">{formatPercent(latestBaselinePercent)}</span></div>
              </div>
            </section>

            <section className="overflow-hidden rounded-xl border border-blue-100 bg-blue-50">
              <div className="border-b border-blue-100 px-5 py-4"><div className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-blue-600" /><h2 className="font-bold text-navy-dark">What SolarIQ+ recommends</h2></div></div>
              <div className="p-5">
                <div className="flex items-start gap-3">
                  {maintenanceSignal.level === "watch" ? <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />}
                  <div>
                    <div className="text-sm font-bold text-navy-dark">{maintenanceSignal.level === "watch" ? "Review system conditions" : "Continue monitoring"}</div>
                    <p className="mt-2 text-xs leading-relaxed text-slate-600">
                      {maintenanceSignal.level === "watch"
                        ? "Review recent weather conditions, inverter status, and system operating conditions. Persistent low output is a monitoring signal, not a physical-fault diagnosis."
                        : "Continue collecting generation and weather observations. The current project history does not show a persistent low-generation pattern requiring maintenance guidance."}
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <section className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-5 py-4">
              <div className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-blue-600" /><h2 className="font-bold text-navy-dark">Recent generation behavior</h2></div>
              <p className="mt-1 text-xs text-slate-500">Latest seven observations used for the maintenance signal.</p>
            </div>
            {recentReadings.length ? (
              <div className="divide-y divide-slate-100">
                {recentReadings.map((reading) => {
                  const actual = number(reading.actual_generation_kwh);
                  const baselinePercent = actual !== null && averageGeneration > 0 ? (actual / averageGeneration) * 100 : null;
                  return (
                    <div key={`${reading.reading_date}-${reading.actual_generation_kwh}`} className="flex items-center justify-between gap-4 px-5 py-4">
                      <div className="flex items-center gap-3"><CalendarDays className="h-4 w-4 text-slate-400" /><div><div className="text-xs font-bold text-navy-dark">{formatDate(reading.reading_date)}</div><div className="mt-0.5 text-[10px] text-slate-400">Project generation</div></div></div>
                      <div className="text-right"><div className="text-sm font-bold text-navy-dark">{actual !== null ? `${actual.toFixed(2)} kWh` : "—"}</div><div className="mt-0.5 text-[10px] text-slate-400">{formatPercent(baselinePercent)} of baseline</div></div>
                    </div>
                  );
                })}
              </div>
            ) : <div className="p-6 text-sm text-slate-500">No generation observations are available for this project yet.</div>}
          </section>

          <section className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-5">
            <div className="flex items-start gap-3">
              <Database className="mt-0.5 h-5 w-5 text-blue-600" />
              <div>
                <div className="text-sm font-bold text-navy-dark">Maintenance intelligence data source</div>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">Maintenance guidance is derived from this registered solar system's project-linked generation history. It does not copy customer values from the reference ML training dataset.</p>
                {hasDemoData && <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700"><span className="font-bold">Demo Integration:</span> {readings.length} generation observations currently come from the Enphase demo adapter rather than a real customer inverter.</div>}
                <div className="mt-4 grid gap-3 text-xs text-slate-500 sm:grid-cols-3">
                  <div><span className="font-bold text-slate-700">Total generation</span><div className="mt-1">{totalGeneration.toFixed(2)} kWh</div></div>
                  <div><span className="font-bold text-slate-700">Observed range</span><div className="mt-1">{observedRange} kWh</div></div>
                  <div><span className="font-bold text-slate-700">Fingerprint</span><div className="mt-1">{fingerprint.ready ? "ESTABLISHED" : "BUILDING"}</div></div>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 text-slate-500" />
              <div>
                <div className="text-sm font-bold text-navy-dark">Monitoring guidance, not fault diagnosis</div>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">A single low-generation observation can result from weather, irradiance, shading, grid conditions, operational state, or other factors. SolarIQ+ therefore looks for persistent project patterns before presenting maintenance-oriented guidance.</p>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
