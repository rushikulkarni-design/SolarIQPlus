import { cn } from "@/lib/utils";

// ── Brand mark ────────────────────────────────────────────────────────────
export function SolarMark({ className = "h-7 w-7" }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="3" fill="#0B132B" />
      <circle cx="16" cy="13" r="4.6" fill="#F59E0B" />
      {[...Array(8)].map((_, i) => {
        const a = (i * Math.PI) / 4;
        const x1 = 16 + Math.cos(a) * 6.6;
        const y1 = 13 + Math.sin(a) * 6.6;
        const x2 = 16 + Math.cos(a) * 8.4;
        const y2 = 13 + Math.sin(a) * 8.4;
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#F59E0B" strokeWidth="1.4" strokeLinecap="round" />;
      })}
      <path d="M5 25 L16 21 L27 25" stroke="#3A506B" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────
export function Panel({ className, children, ...props }) {
  return (
    <div className={cn("bg-white border border-slate-200 rounded-md", className)} {...props}>
      {children}
    </div>
  );
}

export function PanelHeader({ title, hint, right, className }) {
  return (
    <div className={cn("flex items-center justify-between px-5 py-3.5 border-b border-slate-200", className)}>
      <div>
        <h3 className="text-[13px] font-semibold uppercase tracking-wider text-slate-500 font-display">{title}</h3>
        {hint && <p className="text-xs text-slate-400 mt-0.5">{hint}</p>}
      </div>
      {right}
    </div>
  );
}

// ── Section heading (sits directly on the page, no card) ────────────────────
export function SectionHeading({ eyebrow, title, description, right, className }) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
      <div>
        {eyebrow && (
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-dark mb-1.5 font-mono">
            {eyebrow}
          </div>
        )}
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-navy-dark font-display">{title}</h1>
        {description && <p className="text-sm text-slate-500 mt-1.5 max-w-2xl leading-relaxed">{description}</p>}
      </div>
      {right}
    </div>
  );
}

// ── Data-state tags ─────────────────────────────────────────────────────────
const TAG_STYLES = {
  sample: "border-amber-300 bg-amber-50 text-amber-700",
  dev: "border-slate-300 bg-slate-100 text-slate-600",
  live: "border-emerald-300 bg-emerald-50 text-emerald-700",
  model: "border-blue-200 bg-blue-50 text-blue-700",
};
export function DataTag({ variant = "sample", children, className }) {
  const labels = { sample: "SAMPLE DATA", dev: "UNDER DEVELOPMENT", live: "LIVE", model: "MODEL OUTPUT" };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider font-mono rounded border",
        TAG_STYLES[variant],
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {children || labels[variant]}
    </span>
  );
}

// ── Status badge (NORMAL / WARNING / MAINTENANCE / CRITICAL) ─────────────────
const STATUS_STYLES = {
  NORMAL: "border-emerald-300 bg-emerald-50 text-emerald-700",
  WEATHER: "border-blue-200 bg-blue-50 text-blue-700",
  WARNING: "border-amber-300 bg-amber-50 text-amber-800",
  MAINTENANCE: "border-orange-300 bg-orange-50 text-orange-700",
  CRITICAL: "border-red-300 bg-red-50 text-red-700",
};
export function StatusBadge({ status, className }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider font-mono rounded border",
        STATUS_STYLES[status] || STATUS_STYLES.NORMAL,
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

// ── Metric (large number, label, delta) ─────────────────────────────────────
export function Metric({ label, value, unit, sub, accent, className }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className={cn("text-3xl font-bold font-display tabular", accent ? "text-amber-dark" : "text-navy-dark")}>
          {value}
        </span>
        {unit && <span className="text-sm font-medium text-slate-400 font-mono">{unit}</span>}
      </div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}
