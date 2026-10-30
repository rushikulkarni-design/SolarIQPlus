import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Panel, PanelHeader, DataTag } from "@/components/common/Primitives";
import { StepFooter, NoActiveProject } from "./PlannerLayout";
import { useProjectContext } from "@/context/ProjectContext";
import { api } from "@/lib/api";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import {
  Leaf,
  IndianRupee,
  TrendingUp,
  Clock3,
  AlertTriangle,
  CheckCircle2,
  Info,
} from "lucide-react";

const BAR_COLORS = ["#1C2541", "#3A506B", "#F59E0B", "#94a3b8"];

const MARKET_COST_BANDS = [
  { maxKw: 3, min: 190000, max: 220000 },
  { maxKw: 5, min: 205000, max: 300000 },
  { maxKw: 7, min: 270000, max: 390000 },
  { maxKw: 10, min: 370000, max: 560000 },
];

const PRACTICAL_SYSTEM_SIZES = [3, 4, 5, 6, 7, 8, 9, 10];

const ANNUAL_GENERATION_PER_KW = 1400;
const PLANNING_TARIFF_PER_KWH = 8;
const ANNUAL_TARIFF_ESCALATION = 0.04;
const ANNUAL_DEGRADATION = 0.005;
const ANNUAL_MAINTENANCE_RATE = 0.01;
const PROJECTION_YEARS = 25;

function numberValue(...values) {
  for (const value of values) {
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      const cleaned = String(value)
        .replace(/₹/g, "")
        .replace(/,/g, "")
        .replace(/\s/g, "")
        .replace(/[^\d.-]/g, "");

      const parsed = Number(cleaned);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function firstValue(...values) {
  for (const value of values) {
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      return value;
    }
  }

  return null;
}

function formatNumber(value, decimals = 0) {
  if (value == null || !Number.isFinite(Number(value))) {
    return "—";
  }

  return Number(value).toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatMoney(value) {
  if (value == null || !Number.isFinite(Number(value))) {
    return "—";
  }

  return `₹${Number(value).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  })}`;
}

function formatLakhs(value) {
  if (value == null || !Number.isFinite(Number(value))) {
    return "—";
  }

  return `₹${(Number(value) / 100000).toFixed(2)}L`;
}

function getBillFields(bill) {
  if (!bill) return {};

  if (
    bill.fields &&
    typeof bill.fields === "object" &&
    !Array.isArray(bill.fields)
  ) {
    return bill.fields;
  }

  if (
    bill.extracted_fields &&
    typeof bill.extracted_fields === "object" &&
    !Array.isArray(bill.extracted_fields)
  ) {
    return bill.extracted_fields;
  }

  return bill;
}

function getCostBand(systemKw) {
  const band =
    MARKET_COST_BANDS.find((item) => systemKw <= item.maxKw) ||
    MARKET_COST_BANDS[MARKET_COST_BANDS.length - 1];

  return {
    min: band.min,
    max: band.max,
    midpoint: Math.round((band.min + band.max) / 2),
  };
}

function getGovernmentSubsidy(systemKw, consumerType) {
  const type = String(consumerType || "Residential").toLowerCase();

  if (!type.includes("residential")) {
    return 0;
  }

  if (systemKw <= 0) {
    return 0;
  }

  if (systemKw <= 2) {
    return 30000;
  }

  return 78000;
}

function getPracticalSystemSize(theoreticalKw, roofCapacityKw) {
  if (
    theoreticalKw == null ||
    !Number.isFinite(Number(theoreticalKw)) ||
    Number(theoreticalKw) <= 0
  ) {
    return null;
  }

  const target = Number(theoreticalKw);

  const practical =
    PRACTICAL_SYSTEM_SIZES.find((size) => size >= target) || 10;

  if (
    roofCapacityKw != null &&
    Number.isFinite(Number(roofCapacityKw)) &&
    Number(roofCapacityKw) > 0
  ) {
    const maximumAllowed = Number(roofCapacityKw);

    const fitting = PRACTICAL_SYSTEM_SIZES.filter(
      (size) => size <= maximumAllowed
    );

    if (fitting.length > 0) {
      return Math.min(practical, fitting[fitting.length - 1]);
    }

    return null;
  }

  return practical;
}

function buildProjection({
  systemKw,
  customerContribution,
  annualGeneration,
  costMidpoint,
}) {
  const initialInvestment =
    customerContribution != null
      ? customerContribution
      : Math.max(costMidpoint || 0, 0);

  let cumulative = -initialInvestment;

  const rows = [];

  for (let year = 1; year <= PROJECTION_YEARS; year += 1) {
    const generation =
      annualGeneration *
      Math.pow(1 - ANNUAL_DEGRADATION, year - 1);

    const tariff =
      PLANNING_TARIFF_PER_KWH *
      Math.pow(1 + ANNUAL_TARIFF_ESCALATION, year - 1);

    const grossSavings = generation * tariff;

    const maintenance =
      Math.max(costMidpoint || 0, 0) *
      ANNUAL_MAINTENANCE_RATE;

    const netSavings = Math.max(
      grossSavings - maintenance,
      0
    );

    cumulative += netSavings;

    rows.push({
      year,
      generation,
      grossSavings,
      maintenance,
      netSavings,
      cumulative,
      systemKw,
    });
  }

  return rows;
}

function findPayback(projection) {
  if (!projection.length) {
    return null;
  }

  const firstPositive = projection.find(
    (row) => row.cumulative >= 0
  );

  if (!firstPositive) {
    return null;
  }

  const index = projection.indexOf(firstPositive);

  if (index === 0) {
    return firstPositive.year;
  }

  const previous = projection[index - 1];

  const amountStillToRecover =
    Math.abs(previous.cumulative);

  const currentYearSavings =
    firstPositive.netSavings;

  if (currentYearSavings <= 0) {
    return firstPositive.year;
  }

  const fraction =
    amountStillToRecover / currentYearSavings;

  return Number(
    (previous.year + fraction).toFixed(1)
  );
}

function MetricCard({
  label,
  value,
  subtext,
  icon: Icon,
  accent = "text-navy-dark",
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          {label}
        </div>

        {Icon && (
          <Icon className="h-4 w-4 text-slate-400 shrink-0" />
        )}
      </div>

      <div
        className={`mt-2 text-xl font-bold font-mono tabular ${accent}`}
      >
        {value}
      </div>

      {subtext && (
        <div className="mt-1 text-xs text-slate-500 leading-relaxed">
          {subtext}
        </div>
      )}
    </div>
  );
}

function DataItem({ label, value, status = null }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-400">
          {label}
        </div>

        {status && (
          <span
            className={`text-[10px] ${
              status === "available"
                ? "text-emerald-600"
                : "text-slate-400"
            }`}
          >
            {status === "available"
              ? "Available"
              : "Not available"}
          </span>
        )}
      </div>

      <div className="mt-1 text-sm font-semibold text-navy-dark break-words">
        {value}
      </div>
    </div>
  );
}

function SavingsProjectionChart({ data }) {
  const chartData = data.map((row) => ({
    year: row.year,
    cumulative: Math.round(row.cumulative),
  }));

  return (
    <ResponsiveContainer width="100%" height={250}>
      <AreaChart
        data={chartData}
        margin={{
          top: 10,
          right: 10,
          left: 0,
          bottom: 0,
        }}
      >
        <defs>
          <linearGradient
            id="solarSavingsGradient"
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop
              offset="0%"
              stopColor="#10B981"
              stopOpacity={0.28}
            />
            <stop
              offset="100%"
              stopColor="#10B981"
              stopOpacity={0.03}
            />
          </linearGradient>
        </defs>

        <CartesianGrid
          stroke="#E2E8F0"
          strokeDasharray="3 3"
          vertical={false}
        />

        <XAxis
          dataKey="year"
          tick={{
            fontSize: 10,
            fontFamily: "IBM Plex Mono",
            fill: "#94a3b8",
          }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => `Y${value}`}
          interval={1}
        />

        <YAxis
          tick={{
            fontSize: 10,
            fontFamily: "IBM Plex Mono",
            fill: "#94a3b8",
          }}
          tickLine={false}
          axisLine={false}
          width={48}
          tickFormatter={(value) => {
            if (Math.abs(value) >= 100000) {
              return `₹${(value / 100000).toFixed(1)}L`;
            }

            if (Math.abs(value) >= 1000) {
              return `₹${Math.round(value / 1000)}k`;
            }

            return `₹${value}`;
          }}
        />

        <Tooltip
          cursor={{
            stroke: "#94a3b8",
            strokeDasharray: "4 4",
          }}
          formatter={(value) => [
            formatMoney(value),
            "Cumulative savings",
          ]}
          labelFormatter={(label) =>
            `Year ${label}`
          }
          contentStyle={{
            fontSize: 12,
            borderRadius: 6,
            border: "1px solid #E2E8F0",
            backgroundColor: "#ffffff",
          }}
        />

        <Area
          type="monotone"
          dataKey="cumulative"
          stroke="#059669"
          strokeWidth={2}
          fill="url(#solarSavingsGradient)"
          dot={false}
          activeDot={{
            r: 4,
          }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export default function PlannerFinancials() {
  const { activeProject, activeProjectId } =
    useProjectContext();

  const {
    data: bill,
    isLoading: billLoading,
    isError: billError,
  } = useQuery({
    queryKey: ["project-bill", activeProjectId],
    queryFn: async () => {
      const response = await api.get(
        `/projects/${activeProjectId}/bill`
      );

      return response.data;
    },
    enabled: Boolean(activeProjectId),
    retry: false,
  });

  const {
    data: rooftop,
    isLoading: rooftopLoading,
  } = useQuery({
    queryKey: ["project-rooftop", activeProjectId],
    queryFn: async () => {
      const response = await api.get(
        `/projects/${activeProjectId}/rooftop`
      );

      return response.data;
    },
    enabled: Boolean(activeProjectId),
    retry: false,
  });

  const fields = useMemo(
    () => getBillFields(bill),
    [bill]
  );

  const monthlyConsumption = numberValue(
    fields.monthly_consumption_kwh,
    fields.monthly_units,
    fields.consumption_kwh,
    fields.units_consumed,
    fields.monthly_consumption
  );

  const annualConsumption =
    monthlyConsumption != null &&
    monthlyConsumption > 0
      ? monthlyConsumption * 12
      : null;

  const consumerType =
    firstValue(
      fields.consumer_type,
      fields.consumerType,
      activeProject?.consumer_type,
      activeProject?.consumerType
    ) || "Residential";

  const rooftopUsablePercentage = numberValue(
    rooftop?.usable_area_percentage,
    rooftop?.usableAreaPercentage,
    rooftop?.metrics?.usable_area_percentage,
    rooftop?.analysis?.usable_area_percentage,
    rooftop?.result?.usable_area_percentage
  );

  const roofArea = numberValue(
    activeProject?.roof_area_m2,
    activeProject?.roofAreaM2
  );

  const theoreticalCapacityValue =
    annualConsumption != null
      ? annualConsumption / ANNUAL_GENERATION_PER_KW
      : null;

  const roofCapacity =
    roofArea != null &&
    roofArea > 0 &&
    rooftopUsablePercentage != null
      ? (roofArea *
          (rooftopUsablePercentage / 100)) /
        8.36
      : null;

  const recommendation = useMemo(() => {
    if (theoreticalCapacityValue == null) {
      return null;
    }

    const recommendedKw =
      getPracticalSystemSize(
        theoreticalCapacityValue,
        roofCapacity
      );

    if (recommendedKw == null) {
      return null;
    }

    const panelCapacity = 550;

    const panelCount = Math.ceil(
      (recommendedKw * 1000) /
        panelCapacity
    );

    const dcCapacity =
      (panelCount * panelCapacity) / 1000;

    const annualGeneration =
      recommendedKw *
      ANNUAL_GENERATION_PER_KW;

    const monthlyGeneration =
      annualGeneration / 12;

    const cost = getCostBand(
      recommendedKw
    );

    const subsidy =
      getGovernmentSubsidy(
        recommendedKw,
        consumerType
      );

    const customerMin = Math.max(
      cost.min - subsidy,
      0
    );

    const customerMax = Math.max(
      cost.max - subsidy,
      0
    );

    const customerMidpoint = Math.max(
      cost.midpoint - subsidy,
      0
    );

    const projection =
      buildProjection({
        systemKw: recommendedKw,
        customerContribution:
          customerMidpoint,
        annualGeneration,
        costMidpoint:
          cost.midpoint,
      });

    const payback =
      findPayback(projection);

    const yearOne =
      projection[0] || null;

    const year10 =
      projection[9] || null;

    const year20 =
      projection[19] || null;

    const year25 =
      projection[24] || null;

    return {
      theoreticalCapacity:
        theoreticalCapacityValue,
      recommendedKw,
      panelCount,
      panelCapacity,
      dcCapacity,
      annualGeneration,
      monthlyGeneration,
      cost,
      subsidy,
      customerMin,
      customerMax,
      customerMidpoint,
      projection,
      payback,
      yearOne,
      year10,
      year20,
      year25,
    };
  }, [
    theoreticalCapacityValue,
    roofCapacity,
    consumerType,
  ]);

  if (!activeProjectId || !activeProject) {
    return (
      <div className="space-y-4">
        <Panel>
          <PanelHeader
            title="Financial Feasibility"
            hint="Project-based solar economics"
          />

          <div className="p-5">
            <NoActiveProject />
          </div>
        </Panel>

        <StepFooter
          backTo="/planner/recommendation"
          nextTo="/planner/report"
          nextLabel="View report"
        />
      </div>
    );
  }

  if (billLoading || rooftopLoading) {
    return (
      <div className="space-y-4">
        <Panel>
          <PanelHeader
            title="Financial Feasibility"
            hint="Calculating from project analysis"
          />

          <div className="p-8 text-center">
            <div className="text-sm text-slate-500">
              Preparing the financial model from your
              project data…
            </div>
          </div>
        </Panel>

        <StepFooter
          backTo="/planner/recommendation"
          nextTo="/planner/report"
          nextLabel="View report"
        />
      </div>
    );
  }

  if (billError || !recommendation) {
    return (
      <div className="space-y-4">
        <Panel>
          <PanelHeader
            title="Financial Feasibility"
            hint="Project-based solar economics"
          />

          <div className="p-6">
            <div className="rounded-md border border-amber-200 bg-amber-50 p-5">
              <div className="flex items-center gap-2 text-amber-800 font-semibold">
                <AlertTriangle className="h-4 w-4" />
                Financial estimate is not available yet.
              </div>

              <p className="mt-2 text-sm text-amber-700 leading-relaxed">
                SolarIQ+ needs a reliable monthly electricity
                consumption value from the processed bill before
                calculating system economics. Return to the Bill
                or Analysis step and process a valid bill.
              </p>
            </div>
          </div>
        </Panel>

        <StepFooter
          backTo="/planner/recommendation"
          nextTo="/planner/report"
          nextLabel="View report"
        />
      </div>
    );
  }

  const {
    theoreticalCapacity,
    recommendedKw,
    panelCount,
    panelCapacity,
    dcCapacity,
    annualGeneration,
    monthlyGeneration,
    cost,
    subsidy,
    customerMin,
    customerMax,
    customerMidpoint,
    projection,
    payback,
    yearOne,
    year10,
    year20,
    year25,
  } = recommendation;

  const annualSavings =
    yearOne?.grossSavings || 0;

  const year10Value =
    year10?.cumulative != null
      ? year10.cumulative
      : null;

  const year20Value =
    year20?.cumulative != null
      ? year20.cumulative
      : null;

  const year25Value =
    year25?.cumulative != null
      ? year25.cumulative
      : null;

  const carbonReduction =
    (annualGeneration * 0.7) /
    1000;

  const breakdown = [
    {
      name: "Solar modules",
      value: Math.round(
        cost.midpoint * 0.42
      ),
    },
    {
      name: "Inverter",
      value: Math.round(
        cost.midpoint * 0.16
      ),
    },
    {
      name: "Structure",
      value: Math.round(
        cost.midpoint * 0.12
      ),
    },
    {
      name: "Installation & BOS",
      value: Math.round(
        cost.midpoint * 0.30
      ),
    },
  ];

  return (
    <div className="space-y-4">

      <Panel>
        <PanelHeader
          title="Financial Feasibility"
          hint="Planning estimate based on your recommended solar system"
          right={
            <DataTag variant="success">
              PROJECT DATA
            </DataTag>
          }
        />

        <div className="px-5 pb-5">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-400">
                  Active project
                </div>

                <div className="mt-1 text-base font-bold text-navy-dark">
                  {activeProject.name}
                </div>

                {activeProject.location && (
                  <div className="mt-1 text-xs text-slate-500">
                    {activeProject.location}
                  </div>
                )}
              </div>

              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-400">
                  Recommended system
                </div>

                <div className="mt-1 text-2xl font-bold font-mono text-amber-dark">
                  {recommendedKw} kW
                </div>
              </div>
            </div>
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">

        <MetricCard
          label="Installed Cost"
          value={formatLakhs(cost.midpoint)}
          subtext={`${formatLakhs(cost.min)} – ${formatLakhs(cost.max)}`}
          icon={IndianRupee}
        />

        <MetricCard
          label="Subsidy"
          value={formatMoney(subsidy)}
          subtext="Residential CFA planning value"
          icon={IndianRupee}
          accent="text-emerald-600"
        />

        <MetricCard
          label="Customer Cost"
          value={formatLakhs(customerMidpoint)}
          subtext={`${formatLakhs(customerMin)} – ${formatLakhs(customerMax)}`}
          icon={IndianRupee}
          accent="text-amber-dark"
        />

        <MetricCard
          label="Annual Savings"
          value={formatMoney(annualSavings)}
          subtext={`At ₹${PLANNING_TARIFF_PER_KWH}/kWh planning value`}
          icon={TrendingUp}
          accent="text-emerald-600"
        />

        <MetricCard
          label="Payback"
          value={
            payback != null
              ? `${payback} yrs`
              : ">25 yrs"
          }
          subtext="Indicative simple payback"
          icon={Clock3}
        />

        <MetricCard
          label="CO₂ Avoided"
          value={`${carbonReduction.toFixed(1)} t/yr`}
          subtext="Planning estimate"
          icon={Leaf}
          accent="text-emerald-600"
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 items-start">

        <Panel>
          <PanelHeader
            title="System Economics"
            hint="Recommendation carried into Financials"
          />

          <div className="p-5 space-y-4">

            <div className="grid sm:grid-cols-2 gap-3">

              <DataItem
                label="Theoretical requirement"
                value={`${theoreticalCapacity.toFixed(2)} kW`}
                status="available"
              />

              <DataItem
                label="Practical recommended system"
                value={`${recommendedKw} kW`}
                status="available"
              />

              <DataItem
                label="PV modules"
                value={`${panelCount} × ${panelCapacity} W`}
                status="available"
              />

              <DataItem
                label="DC module capacity"
                value={`${dcCapacity.toFixed(2)} kWp`}
                status="available"
              />

              <DataItem
                label="Annual generation"
                value={`${formatNumber(annualGeneration)} kWh`}
                status="available"
              />

              <DataItem
                label="Monthly generation"
                value={`${formatNumber(monthlyGeneration)} kWh`}
                status="available"
              />
            </div>

            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-center gap-2 text-emerald-800 font-semibold text-sm">
                <CheckCircle2 className="h-4 w-4" />
                Recommendation carried forward
              </div>

              <p className="mt-2 text-xs text-emerald-800 leading-relaxed">
                Financial calculations use the same practical
                system size, panel configuration, generation
                estimate, subsidy and market cost band used by
                the Recommendation step.
              </p>
            </div>
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Investment Summary"
            hint="Estimated customer-side economics"
          />

          <div className="p-5">

            <div className="space-y-3">

              <div className="flex items-center justify-between gap-4 py-2 border-b border-slate-100">
                <span className="text-sm text-slate-600">
                  Estimated installed cost
                </span>

                <span className="font-mono font-semibold text-navy-dark">
                  {formatMoney(cost.midpoint)}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4 py-2 border-b border-slate-100">
                <span className="text-sm text-slate-600">
                  Government subsidy
                </span>

                <span className="font-mono font-semibold text-emerald-600">
                  − {formatMoney(subsidy)}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4 py-3 rounded-md bg-slate-50 px-3">
                <span className="text-sm font-semibold text-navy-dark">
                  Estimated customer contribution
                </span>

                <span className="font-mono font-bold text-lg text-amber-dark">
                  {formatMoney(customerMidpoint)}
                </span>
              </div>

              <div className="text-xs text-slate-500 pt-1">
                Planning range after subsidy:{" "}
                <span className="font-mono font-semibold text-slate-700">
                  {formatMoney(customerMin)}
                  {" – "}
                  {formatMoney(customerMax)}
                </span>
              </div>
            </div>

            <div className="mt-5 rounded-md border border-slate-200 p-4">
              <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-400">
                Break-even outlook
              </div>

              <div className="mt-1 text-2xl font-bold font-mono text-navy-dark">
                {payback != null
                  ? `${payback} years`
                  : "Beyond 25 years"}
              </div>

              <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                This is an indicative payback based on the
                planning tariff, generation, degradation,
                maintenance and subsidy assumptions shown below.
              </p>
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 items-start">

        <Panel>
          <PanelHeader
            title="Cost Breakdown"
            hint="Planning allocation of the estimated installation cost"
          />

          <div className="p-5">

            <ResponsiveContainer
              width="100%"
              height={250}
            >
              <BarChart
                data={breakdown}
                layout="vertical"
                margin={{
                  left: 20,
                  right: 16,
                  top: 5,
                  bottom: 5,
                }}
              >
                <CartesianGrid
                  stroke="#E2E8F0"
                  strokeDasharray="3 3"
                  horizontal={false}
                />

                <XAxis
                  type="number"
                  tick={{
                    fontSize: 11,
                    fontFamily: "IBM Plex Mono",
                    fill: "#94a3b8",
                  }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) =>
                    `₹${Math.round(
                      value / 1000
                    )}k`
                  }
                />

                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{
                    fontSize: 12,
                    fontFamily: "IBM Plex Sans",
                    fill: "#475569",
                  }}
                  tickLine={false}
                  axisLine={false}
                  width={105}
                />

                <Tooltip
                  cursor={{
                    fill: "#f1f5f9",
                  }}
                  formatter={(value) => [
                    formatMoney(value),
                    "Planning allocation",
                  ]}
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 6,
                    border:
                      "1px solid #E2E8F0",
                  }}
                />

                <Bar
                  dataKey="value"
                  radius={[
                    0,
                    3,
                    3,
                    0,
                  ]}
                  barSize={22}
                >
                  {breakdown.map(
                    (_, index) => (
                      <Cell
                        key={index}
                        fill={
                          BAR_COLORS[
                            index %
                              BAR_COLORS.length
                          ]
                        }
                      />
                    )
                  )}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            <p className="mt-3 text-[11px] text-slate-400 leading-relaxed">
              Component allocation is an internal planning
              estimate. Actual vendor quotations can vary by
              equipment, roof structure, installation complexity
              and site-specific requirements.
            </p>
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Savings Projection"
            hint="Cumulative net savings after the customer contribution"
          />

          <div className="p-5">

            <SavingsProjectionChart
              data={projection}
            />

            <div className="mt-3 flex items-start gap-2 text-xs text-slate-500">
              <TrendingUp className="h-3.5 w-3.5 mt-0.5 text-emerald-600 shrink-0" />

              <span>
                {payback != null ? (
                  <>
                    The model reaches break-even at approximately{" "}
                    <span className="font-mono font-semibold text-navy-dark">
                      {payback} years
                    </span>
                    , after which cumulative savings become positive.
                  </>
                ) : (
                  <>
                    The model does not reach break-even within the
                    25-year planning horizon.
                  </>
                )}
              </span>
            </div>
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHeader
          title="Long-Term Value"
          hint="Cumulative financial outcome under the planning assumptions"
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">

          <div className="p-5">
            <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-400">
              10-year cumulative
            </div>

            <div className="mt-2 text-2xl font-bold font-mono text-navy-dark">
              {formatMoney(year10Value)}
            </div>

            <div className="mt-1 text-xs text-slate-500">
              Net of estimated maintenance and initial customer contribution
            </div>
          </div>

          <div className="p-5">
            <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-400">
              20-year cumulative
            </div>

            <div className="mt-2 text-2xl font-bold font-mono text-navy-dark">
              {formatMoney(year20Value)}
            </div>

            <div className="mt-1 text-xs text-slate-500">
              Includes generation degradation and tariff escalation
            </div>
          </div>

          <div className="p-5">
            <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-400">
              25-year cumulative
            </div>

            <div className="mt-2 text-2xl font-bold font-mono text-emerald-600">
              {formatMoney(year25Value)}
            </div>

            <div className="mt-1 text-xs text-slate-500">
              Indicative lifetime financial benefit
            </div>
          </div>

        </div>
      </Panel>

      <Panel>
        <PanelHeader
          title="Financial Model Assumptions"
          hint="Make the calculation transparent"
        />

        <div className="p-5">

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">

            <DataItem
              label="Generation factor"
              value={`${formatNumber(
                ANNUAL_GENERATION_PER_KW
              )} kWh/kWp/year`}
              status="available"
            />

            <DataItem
              label="Planning energy value"
              value={`₹${PLANNING_TARIFF_PER_KWH}/kWh`}
              status="available"
            />

            <DataItem
              label="Tariff escalation"
              value={`${(
                ANNUAL_TARIFF_ESCALATION *
                100
              ).toFixed(0)}% / year`}
              status="available"
            />

            <DataItem
              label="PV degradation"
              value={`${(
                ANNUAL_DEGRADATION *
                100
              ).toFixed(1)}% / year`}
              status="available"
            />

            <DataItem
              label="Maintenance allowance"
              value={`${(
                ANNUAL_MAINTENANCE_RATE *
                100
              ).toFixed(1)}% of installation cost / year`}
              status="available"
            />

            <DataItem
              label="Projection horizon"
              value={`${PROJECTION_YEARS} years`}
              status="available"
            />
          </div>

          <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 p-4">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />

              <p className="text-xs text-blue-900 leading-relaxed">
                The current bill amount is{" "}
                <span className="font-mono font-semibold">
                  {fields.bill_amount != null
                    ? formatMoney(
                        numberValue(
                          fields.bill_amount
                        )
                      )
                    : "not available"}
                </span>
                . SolarIQ+ does not directly multiply this amount
                by a percentage to claim savings. For net-metered
                bills, the payable amount can already reflect
                credits, adjustments or exported energy. Instead,
                this financial model uses annual solar generation
                and an explicit planning energy value.
              </p>
            </div>
          </div>

          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />

              <p className="text-xs text-amber-900 leading-relaxed">
                <span className="font-semibold">
                  Planning estimate, not a quotation:
                </span>{" "}
                installation cost, generation, tariff value,
                maintenance and payback can vary with vendor,
                equipment, roof conditions, electricity tariff,
                net-metering treatment and actual site performance.
              </p>
            </div>
          </div>

          <div className="mt-4 text-[11px] text-slate-400 leading-relaxed">
            Subsidy is shown as the current residential planning
            allowance used by SolarIQ+. Eligibility and final
            disbursement depend on the applicable government scheme,
            installation requirements and approval process.
          </div>
        </div>
      </Panel>

      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 flex gap-3">
        <Leaf className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />

        <p className="text-sm text-emerald-900 leading-relaxed">
          The recommended{" "}
          <span className="font-mono font-semibold">
            {recommendedKw} kW
          </span>{" "}
          system is estimated to generate approximately{" "}
          <span className="font-mono font-semibold">
            {formatNumber(annualGeneration)} kWh/year
          </span>
          , corresponding to roughly{" "}
          <span className="font-mono font-semibold">
            {carbonReduction.toFixed(1)} tonnes
          </span>{" "}
          of avoided CO₂ emissions per year under the planning
          assumption used by SolarIQ+.
        </p>
      </div>

      <StepFooter
        backTo="/planner/recommendation"
        nextTo="/planner/report"
        nextLabel="View report"
      />
    </div>
  );
}