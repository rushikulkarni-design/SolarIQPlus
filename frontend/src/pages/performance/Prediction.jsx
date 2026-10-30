import { useState } from "react";
import { SectionHeading, Panel, PanelHeader, DataTag } from "@/components/common/Primitives";
import { FeatureImpactBars } from "@/components/charts/FeatureImpactBars";
import { PREDICTION, SHAP_CONTRIB } from "@/lib/sample";
import { ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from "recharts";
import { cn } from "@/lib/utils";
import { Cpu, HelpCircle } from "lucide-react";

const HORIZONS = ["Next Hour", "Today", "Tomorrow", "Next 7 Days"];

// stitch historical + forecast for one continuous chart
const CHART = [
  ...PREDICTION.historical.map((h) => ({ label: h.label, historical: h.historical })),
  { label: "now", historical: 2.6, predicted: 2.6, low: 2.6, high: 2.6 },
  ...PREDICTION.forecast,
];

export default function Prediction() {
  const [horizon, setHorizon] = useState("Today");
  return (
    <div className="space-y-6">
      <SectionHeading eyebrow="Performance" title="Generation Forecast" description="Short-horizon generation prediction with an expected range. Historical observations are clearly separated from forecasts." />

      <Panel>
        <PanelHeader
          title="Expected Generation"
          hint="Historical vs predicted"
          right={
            <div className="flex flex-wrap gap-1 bg-slate-100 rounded-md p-0.5">
              {HORIZONS.map((h) => (
                <button key={h} data-testid={`horizon-${h.replace(/\s+/g, "-").toLowerCase()}`} onClick={() => setHorizon(h)} className={cn("px-2.5 py-1 text-xs font-medium rounded transition-colors", horizon === h ? "bg-white text-navy-dark shadow-sm" : "text-slate-500")}>{h}</button>
              ))}
            </div>
          }
        />
        <div className="p-5">
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={CHART} margin={{ top: 10, right: 12, left: -8, bottom: 0 }}>
              <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fontFamily: "IBM Plex Mono", fill: "#94a3b8" }} tickLine={false} axisLine={{ stroke: "#E2E8F0" }} />
              <YAxis tick={{ fontSize: 11, fontFamily: "IBM Plex Mono", fill: "#94a3b8" }} tickLine={false} axisLine={false} width={40} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid #E2E8F0" }} />
              <ReferenceLine x="now" stroke="#0B132B" strokeDasharray="3 3" label={{ value: "now", fontSize: 10, fill: "#64748B" }} />
              <Area dataKey="high" stroke="none" fill="#F59E0B" fillOpacity={0.1} name="Expected range" />
              <Area dataKey="low" stroke="none" fill="#ffffff" fillOpacity={1} />
              <Line dataKey="historical" stroke="#1C2541" strokeWidth={2.2} dot={false} name="Historical" />
              <Line dataKey="predicted" stroke="#F59E0B" strokeWidth={2.2} strokeDasharray="5 4" dot={{ r: 3, fill: "#D97706" }} name="Predicted" />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><span className="h-2 w-6 rounded-sm bg-navy" /> Historical</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-6 rounded-sm bg-amber" /> Predicted</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-6 rounded-sm bg-amber/20" /> Expected range</span>
          </div>
        </div>
      </Panel>

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        {/* Model status */}
        <Panel>
          <PanelHeader title="Prediction Model" />
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-md bg-slate-100 flex items-center justify-center"><Cpu className="h-5 w-5 text-navy-light" /></div>
              <div>
                <div className="text-lg font-bold text-navy-dark font-display">XGBoost</div>
                <div className="text-xs text-slate-500">Gradient-boosted regression</div>
              </div>
              <DataTag variant="dev" className="ml-auto" />
            </div>
            <div className="rounded-md border border-slate-200 divide-y divide-slate-100">
              <div className="px-4 py-2.5 flex justify-between"><span className="text-sm text-slate-500">Status</span><span className="text-sm font-medium text-slate-700">Under development / integration</span></div>
              <div className="px-4 py-2.5">
                <div className="text-sm text-slate-500 mb-1">Model Evaluation</div>
                <div className="text-sm text-slate-400 italic">To be measured after experiments. MAE / RMSE / R² will be published once the model is trained and validated.</div>
              </div>
            </div>
          </div>
        </Panel>

        {/* AI Explanation Why */}
        <Panel>
          <PanelHeader title="Why this prediction?" hint="Powered by SHAP" right={<HelpCircle className="h-4 w-4 text-slate-300" />} />
          <div className="p-5">
            <div className="flex items-baseline gap-2 mb-4">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Expected Generation</span>
              <span className="text-2xl font-bold text-navy-dark font-display">18.5</span>
              <span className="text-sm text-slate-400 font-mono">kWh</span>
            </div>
            <FeatureImpactBars items={SHAP_CONTRIB} />
            <p className="text-sm text-slate-600 mt-4 leading-relaxed">
              Expected generation is influenced mainly by <span className="font-medium text-navy-dark">irradiance</span> and{" "}
              <span className="font-medium text-navy-dark">cloud conditions</span>.
            </p>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              SHAP explains the XGBoost prediction — it attributes contributions to input features. It does not make the
              prediction itself. Values shown are illustrative until the model is integrated.
            </p>
          </div>
        </Panel>
      </div>
    </div>
  );
}
