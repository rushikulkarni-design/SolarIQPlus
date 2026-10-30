import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Area, AreaChart,
} from "recharts";

const AXIS = { fontSize: 11, fontFamily: "IBM Plex Mono", fill: "#94a3b8" };

function ChartTooltip({ active, payload, label, unit = "kWh" }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-navy-dark text-white text-xs rounded-md px-3 py-2 shadow-lg border border-white/10">
      <div className="font-mono text-slate-300 mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 tabular">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="capitalize text-slate-300">{p.name}</span>
          <span className="ml-auto font-semibold font-mono">{p.value} {unit}</span>
        </div>
      ))}
    </div>
  );
}

export function GenerationChart({ data, unit = "kWh", height = 300 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 10, right: 12, left: -8, bottom: 0 }}>
        <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: "#E2E8F0" }} minTickGap={16} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} />
        <Tooltip content={<ChartTooltip unit={unit} />} cursor={{ stroke: "#cbd5e1", strokeDasharray: "3 3" }} />
        <Legend
          iconType="plainline"
          wrapperStyle={{ fontSize: 12, fontFamily: "IBM Plex Sans", paddingTop: 8 }}
        />
        <Line type="monotone" dataKey="expected" name="Expected" stroke="#94a3b8" strokeWidth={1.6} strokeDasharray="5 4" dot={false} />
        <Line type="monotone" dataKey="actual" name="Actual" stroke="#F59E0B" strokeWidth={2.4} dot={false} activeDot={{ r: 4, fill: "#D97706" }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function SavingsAreaChart({ data, height = 260 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 12, left: -8, bottom: 0 }}>
        <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="year" tick={AXIS} tickLine={false} axisLine={{ stroke: "#E2E8F0" }} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={54} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
        <Tooltip
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <div className="bg-navy-dark text-white text-xs rounded-md px-3 py-2 border border-white/10">
                <div className="font-mono text-slate-300 mb-1">{label}</div>
                <div className="font-semibold font-mono">₹{payload[0].value.toLocaleString("en-IN")}</div>
              </div>
            ) : null
          }
        />
        <Area type="monotone" dataKey="cumulativeSavings" stroke="#059669" strokeWidth={2} fill="#059669" fillOpacity={0.08} name="Cumulative savings" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
