import { useState } from "react";
import { SectionHeading, Panel, PanelHeader, DataTag, StatusBadge, Metric } from "@/components/common/Primitives";
import { GenerationChart } from "@/components/charts/GenerationChart";
import { STATUS, genTrend, ANOMALY_SERIES } from "@/lib/sample";
import { ResponsiveContainer, ComposedChart, Line, Scatter, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { cn } from "@/lib/utils";
import { Activity, Info } from "lucide-react";

const TRENDS = [
  { key: "week", label: "Daily" },
  { key: "month", label: "Weekly" },
  { key: "year", label: "Monthly" },
];

export default function PerformanceOverview() {
  const [trend, setTrend] = useState("week");
  const anomalies = ANOMALY_SERIES.filter((d) => d.anomaly);

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow="Performance Intelligence"
        title="Performance Center"
        description="Monitor actual output against the model's expected generation, review the learned performance baseline and inspect anomalies."
        right={<DataTag variant="sample" />}
      />

      {/* Overview metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Today's Generation", value: STATUS.todayGen, unit: "kWh" },
          { label: "Expected Generation", value: STATUS.expectedGen, unit: "kWh" },
          { label: "Performance", value: STATUS.performance, unit: "%", accent: true },
        ].map((m) => (
          <Panel key={m.label} className="p-5"><Metric {...m} /></Panel>
        ))}
        <Panel className="p-5 flex flex-col justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">System Status</div>
          <div className="mt-2"><StatusBadge status={STATUS.state} /></div>
        </Panel>
      </div>

      {/* Actual vs expected */}
      <Panel>
        <PanelHeader
          title="Actual vs Expected Generation"
          right={
            <div className="flex gap-1 bg-slate-100 rounded-md p-0.5">
              {TRENDS.map((t) => (
                <button key={t.key} data-testid={`perf-trend-${t.key}`} onClick={() => setTrend(t.key)} className={cn("px-2.5 py-1 text-xs font-medium rounded transition-colors", trend === t.key ? "bg-white text-navy-dark shadow-sm" : "text-slate-500")}>{t.label}</button>
              ))}
            </div>
          }
        />
        <div className="p-5"><GenerationChart data={genTrend[trend]} /></div>
      </Panel>

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        {/* Performance fingerprint */}
        <Panel>
          <PanelHeader title="Performance Fingerprint" hint="Learned normal behaviour of this installation" right={<DataTag variant="dev">DEMO</DataTag>} />
          <div className="p-5">
            <FingerprintViz />
            <p className="text-xs text-slate-400 mt-4 leading-relaxed">
              The fingerprint represents the expected output envelope the installation exhibits under normal conditions.
              A real fingerprint is built once sufficient generation history is available.
            </p>
          </div>
        </Panel>

        {/* Anomaly analysis */}
        <Panel>
          <PanelHeader title="Anomaly Analysis" hint="Isolation Forest" right={<DataTag variant="sample" />} />
          <div className="p-5">
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={ANOMALY_SERIES} margin={{ top: 10, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fontFamily: "IBM Plex Mono", fill: "#94a3b8" }} tickLine={false} axisLine={{ stroke: "#E2E8F0" }} interval={4} />
                <YAxis tick={{ fontSize: 10, fontFamily: "IBM Plex Mono", fill: "#94a3b8" }} tickLine={false} axisLine={false} width={36} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid #E2E8F0" }} />
                <Line dataKey="baseline" stroke="#cbd5e1" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="Baseline" />
                <Line dataKey="value" stroke="#1C2541" strokeWidth={2} dot={false} name="Observed" />
                <Scatter dataKey={(d) => (d.anomaly ? d.value : null)} fill="#DC2626" name="Anomaly" />
              </ComposedChart>
            </ResponsiveContainer>
            <div className="mt-3 text-sm text-slate-600">
              <span className="font-semibold text-red-600 font-mono">{anomalies.length} anomalies</span> flagged in the sample window.
            </div>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              Isolation Forest identifies observations that differ significantly from the learned normal performance pattern.
            </p>
          </div>
        </Panel>
      </div>

      <div className="rounded-md border border-blue-200 bg-blue-50 p-4 flex gap-3">
        <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
        <p className="text-sm text-blue-900 leading-relaxed">
          Performance intelligence is anomaly-detection and maintenance-oriented. It flags deviations from normal
          behaviour and recommends inspection — it does not perform exact physical fault localisation.
        </p>
      </div>
    </div>
  );
}

function FingerprintViz() {
  // subtle radial-style baseline visualization (SVG), clearly demonstrative
  const pts = Array.from({ length: 24 }, (_, i) => {
    const r = 40 + Math.sin(i / 2) * 8;
    const a = (i / 24) * Math.PI * 2 - Math.PI / 2;
    return [70 + Math.cos(a) * r, 70 + Math.sin(a) * r];
  });
  const path = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ") + "Z";
  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 140 140" className="h-36 w-36 shrink-0">
        {[50, 35, 20].map((r) => <circle key={r} cx="70" cy="70" r={r} fill="none" stroke="#E2E8F0" strokeDasharray="2 3" />)}
        <path d={path} fill="#F59E0B" fillOpacity="0.1" stroke="#F59E0B" strokeWidth="1.5" />
        <circle cx="70" cy="70" r="2" fill="#1C2541" />
      </svg>
      <div className="space-y-2 text-sm">
        {[["Normal envelope", "bg-amber/20 border-amber"], ["Expected center", "bg-navy-dark border-navy-dark"]].map(([l, c]) => (
          <div key={l} className="flex items-center gap-2 text-slate-600"><span className={cn("h-3 w-3 rounded-sm border", c)} /> {l}</div>
        ))}
        <div className="text-xs text-slate-400 pt-1">24-hour behavioural signature</div>
      </div>
    </div>
  );
}
