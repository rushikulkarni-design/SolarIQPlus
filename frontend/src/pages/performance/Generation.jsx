import { useState } from "react";
import { SectionHeading, Panel, PanelHeader, DataTag, Metric } from "@/components/common/Primitives";
import { GenerationChart } from "@/components/charts/GenerationChart";
import { genTrend, STATUS } from "@/lib/sample";
import { cn } from "@/lib/utils";

const RANGES = [
  { key: "today", label: "Today" },
  { key: "week", label: "7 Days" },
  { key: "month", label: "30 Days" },
  { key: "year", label: "1 Year" },
];

export default function Generation() {
  const [range, setRange] = useState("month");
  const data = genTrend[range];
  const totalActual = data.reduce((a, d) => a + d.actual, 0);
  const totalExpected = data.reduce((a, d) => a + d.expected, 0);
  const ratio = ((totalActual / totalExpected) * 100).toFixed(1);

  return (
    <div className="space-y-6">
      <SectionHeading eyebrow="Performance" title="Generation Analytics" description="Detailed view of energy produced against the expected profile across selectable time ranges." right={<DataTag variant="sample" />} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Panel className="p-5"><Metric label="Actual (period)" value={totalActual.toFixed(0)} unit="kWh" /></Panel>
        <Panel className="p-5"><Metric label="Expected (period)" value={totalExpected.toFixed(0)} unit="kWh" /></Panel>
        <Panel className="p-5"><Metric label="Performance Ratio" value={ratio} unit="%" accent /></Panel>
        <Panel className="p-5"><Metric label="Peak Output Today" value="2.94" unit="kW" /></Panel>
      </div>

      <Panel>
        <PanelHeader
          title="Generation Curve"
          hint="Actual vs expected"
          right={
            <div className="flex gap-1 bg-slate-100 rounded-md p-0.5">
              {RANGES.map((r) => (
                <button key={r.key} data-testid={`gen-range-${r.key}`} onClick={() => setRange(r.key)} className={cn("px-2.5 py-1 text-xs font-medium rounded transition-colors", range === r.key ? "bg-white text-navy-dark shadow-sm" : "text-slate-500")}>{r.label}</button>
              ))}
            </div>
          }
        />
        <div className="p-5"><GenerationChart data={data} height={340} /></div>
      </Panel>

      <Panel>
        <PanelHeader title="Daily Breakdown" hint="Most recent days" />
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-slate-400 border-b border-slate-200">
              <th className="text-left font-semibold px-5 py-2.5">Day</th>
              <th className="text-right font-semibold px-3 py-2.5">Actual</th>
              <th className="text-right font-semibold px-3 py-2.5">Expected</th>
              <th className="text-right font-semibold px-5 py-2.5">Ratio</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {genTrend.week.map((d) => {
              const r = ((d.actual / d.expected) * 100).toFixed(0);
              const low = r < 85;
              return (
                <tr key={d.label} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-2.5 font-medium text-navy-dark">{d.label}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-700">{d.actual} kWh</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-400">{d.expected} kWh</td>
                  <td className={cn("px-5 py-2.5 text-right font-mono font-semibold", low ? "text-amber-dark" : "text-emerald-600")}>{r}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
