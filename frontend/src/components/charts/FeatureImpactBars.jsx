import { cn } from "@/lib/utils";

// Horizontal contribution bars: positive (green) push up, negative (amber/red) push down.
export function FeatureImpactBars({ items, valueKey = "value", showValue = true }) {
  const max = Math.max(...items.map((i) => Math.abs(i[valueKey] ?? i.weight * i.dir)));
  return (
    <div className="space-y-3" data-testid="feature-impact">
      {items.map((it) => {
        const raw = it[valueKey] ?? it.weight * it.dir;
        const pct = (Math.abs(raw) / max) * 50;
        const positive = raw >= 0;
        return (
          <div key={it.feature} className="flex items-center gap-3">
            <div className="w-28 shrink-0 text-right text-xs font-medium text-slate-600 truncate">{it.feature}</div>
            <div className="flex-1 relative h-6 flex items-center">
              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-300" />
              <div
                className={cn("absolute h-4 rounded-sm", positive ? "bg-emerald-500" : "bg-amber")}
                style={positive ? { left: "50%", width: `${pct}%` } : { right: "50%", width: `${pct}%` }}
              />
            </div>
            {showValue && (
              <div className={cn("w-16 shrink-0 text-xs font-mono tabular", positive ? "text-emerald-600" : "text-amber-dark")}>
                {positive ? "↑" : "↓"} {Math.abs(raw).toFixed(2)}
              </div>
            )}
            {it.influence && !showValue && (
              <div className="w-24 shrink-0 text-[11px] text-slate-500">{it.influence}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
