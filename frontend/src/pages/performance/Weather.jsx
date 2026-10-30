import { SectionHeading, Panel, PanelHeader, DataTag } from "@/components/common/Primitives";
import { FeatureImpactBars } from "@/components/charts/FeatureImpactBars";
import { WEATHER, WEATHER_IMPACT } from "@/lib/sample";
import { Sun, Cloud, Droplets, Wind, Gauge, Thermometer } from "lucide-react";

const METRICS = [
  { icon: Thermometer, label: "Temperature", value: WEATHER.temp, unit: "°C" },
  { icon: Gauge, label: "Irradiance", value: WEATHER.irradiance, unit: "W/m²" },
  { icon: Cloud, label: "Cloud Cover", value: WEATHER.cloud, unit: "%" },
  { icon: Droplets, label: "Humidity", value: WEATHER.humidity, unit: "%" },
  { icon: Wind, label: "Wind Speed", value: WEATHER.wind, unit: "km/h" },
];

export default function Weather() {
  return (
    <div className="space-y-6">
      <SectionHeading eyebrow="Performance" title="Weather Intelligence" description="Environmental conditions and how they influence solar generation. Weather is the primary driver of expected output." />

      {/* Current conditions banner */}
      <div className="rounded-md bg-navy-dark grid-lines border border-navy-light/40 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-md bg-amber/10 flex items-center justify-center"><Sun className="h-9 w-9 text-amber" /></div>
          <div>
            <div className="text-4xl font-extrabold text-white font-display tabular">{WEATHER.temp}°C</div>
            <div className="text-slate-400 text-sm">{WEATHER.condition} · Ahmedabad, India</div>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-white/10 rounded-md overflow-hidden">
          {METRICS.slice(1).map((m) => (
            <div key={m.label} className="bg-navy-dark px-4 py-3 text-center min-w-[90px]">
              <div className="text-lg font-bold text-white font-mono tabular">{m.value}<span className="text-xs text-slate-500 ml-0.5">{m.unit}</span></div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wide mt-0.5">{m.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Weather impact */}
      <div className="grid lg:grid-cols-[1.2fr_1fr] gap-4 items-start">
        <Panel>
          <PanelHeader title="Weather Impact on Generation" hint="Feature influence on expected output" right={<DataTag variant="dev">SHAP PENDING</DataTag>} />
          <div className="p-5">
            <FeatureImpactBars items={WEATHER_IMPACT} showValue={false} />
            <p className="text-xs text-slate-400 mt-5 leading-relaxed">
              This is an explainability visualisation. Once the ML layer is integrated it will be powered by{" "}
              <span className="font-mono text-slate-600">SHAP</span> over the XGBoost model, using measured feature
              contributions. The directions shown here reflect expected physical influence, not fabricated SHAP values.
            </p>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="How weather drives output" />
          <div className="p-5 space-y-3 text-sm">
            {[
              ["Irradiance", "Direct driver — more sunlight means more generation.", "text-emerald-600", "bg-emerald-500"],
              ["Cloud Cover", "Reduces incident irradiance, lowering output.", "text-amber-dark", "bg-amber"],
              ["Temperature", "Very high panel temperatures slightly reduce efficiency.", "text-amber-dark", "bg-amber"],
              ["Humidity", "Minor effect through atmospheric scattering.", "text-slate-500", "bg-slate-400"],
            ].map(([k, v, c, bar]) => (
              <div key={k} className="flex gap-3">
                <span className={`w-1 rounded-full ${bar}`} />
                <div>
                  <div className={`text-sm font-semibold ${c}`}>{k}</div>
                  <div className="text-slate-600 text-sm leading-relaxed">{v}</div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
