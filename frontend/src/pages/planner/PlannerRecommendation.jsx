import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  CheckCircle2,
  AlertTriangle,
  FileText,
  ScanEye,
  Sun,
  IndianRupee,
  Home,
  PanelTop,
} from "lucide-react";

import { Panel, PanelHeader, DataTag } from "@/components/common/Primitives";
import { StepFooter, NoActiveProject } from "./PlannerLayout";
import { useProjectContext } from "@/context/ProjectContext";
import { api } from "@/lib/api";

const PANEL_WATT = 550;
const GENERATION_PER_KW_YEAR = 1400;
const ROOF_AREA_PER_KW_M2 = 9.29;
const PRACTICAL_MIN_KW = 3;
const RESIDENTIAL_MAX_KW = 10;

/* SolarIQ+ market planning cost model.
   These are planning estimates, not official fixed quotations.
   Actual price varies by brand, inverter/module technology,
   structure, roof type, installation complexity and site work.
*/
const MARKET_COST_BANDS = [
  { maxKw: 3, min: 190000, max: 220000 },
  { maxKw: 5, min: 205000, max: 300000 },
  { maxKw: 7, min: 270000, max: 390000 },
  { maxKw: 10, min: 370000, max: 560000 },
];

function numberOrNull(...values) {
  for (const value of values) {
    if (value === undefined || value === null || value === "") continue;
    const parsed =
      typeof value === "number"
        ? value
        : Number(
            String(value)
              .replace(/₹/g, "")
              .replace(/,/g, "")
              .replace(/\s/g, "")
              .replace(/[^\d.-]/g, "")
          );
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function firstValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return null;
}

function getBillFields(bill) {
  if (!bill) return {};
  if (bill.fields && typeof bill.fields === "object" && !Array.isArray(bill.fields)) return bill.fields;
  if (bill.extracted_fields && typeof bill.extracted_fields === "object" && !Array.isArray(bill.extracted_fields)) return bill.extracted_fields;
  return bill;
}

function formatNumber(value, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return Number(value).toLocaleString("en-IN", { maximumFractionDigits: digits });
}

function formatMoney(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function calculateSubsidy(capacityKw) {
  const kw = Number(capacityKw);
  if (!Number.isFinite(kw) || kw <= 0) return 0;
  if (kw <= 2) return kw * 30000;
  return Math.min(60000 + Math.min(kw - 2, 1) * 18000, 78000);
}

function getMarketCostBand(capacityKw) {
  const band = MARKET_COST_BANDS.find((item) => capacityKw <= item.maxKw);
  return band || MARKET_COST_BANDS[MARKET_COST_BANDS.length - 1];
}

function calculateMarketCost(capacityKw) {
  if (!Number.isFinite(Number(capacityKw)) || capacityKw <= 0) return null;
  const band = getMarketCostBand(Number(capacityKw));
  const previous = MARKET_COST_BANDS[MARKET_COST_BANDS.indexOf(band) - 1];
  const lowerCapacity = previous ? previous.maxKw : 0;
  const ratio = Math.max(0, Math.min(1, (capacityKw - lowerCapacity) / (band.maxKw - lowerCapacity)));
  return {
    min: Math.round(band.min),
    max: Math.round(band.max),
    midpoint: Math.round((band.min + band.max) / 2),
  };
}

function choosePracticalCapacity(theoreticalKw, roofAreaM2) {
  if (!Number.isFinite(theoreticalKw)) {
    return {
      recommendedKw: PRACTICAL_MIN_KW,
      reason: "Bill consumption was not available, so SolarIQ+ starts with the practical 3 kW residential baseline.",
      constrainedByRoof: false,
      residentialLimitExceeded: false,
    };
  }

  const theoretical = Math.max(theoreticalKw, 0);
  let recommendedKw = Math.max(PRACTICAL_MIN_KW, Math.ceil(theoretical));
  const residentialLimitExceeded = recommendedKw > RESIDENTIAL_MAX_KW;

  if (residentialLimitExceeded) recommendedKw = RESIDENTIAL_MAX_KW;

  let constrainedByRoof = false;
  if (Number.isFinite(roofAreaM2) && roofAreaM2 > 0) {
    const maximumRoofKw = Math.floor(roofAreaM2 / ROOF_AREA_PER_KW_M2);
    if (maximumRoofKw < recommendedKw) {
      constrainedByRoof = true;
      if (maximumRoofKw >= PRACTICAL_MIN_KW) {
        recommendedKw = Math.min(recommendedKw, maximumRoofKw, RESIDENTIAL_MAX_KW);
      }
    }
  }

  let reason;
  if (theoretical < 3) {
    reason = "The electricity bill indicates a smaller theoretical requirement, but SolarIQ+ recommends the practical 3 kW residential baseline instead of presenting an impractical fractional system.";
  } else if (residentialLimitExceeded) {
    reason = "The electricity demand indicates more than 10 kW. SolarIQ+ caps the residential planning recommendation at 10 kW and flags the case for additional technical/category review.";
  } else if (constrainedByRoof) {
    reason = "The calculated system is larger, but the entered roof area limits the practical system size.";
  } else {
    reason = "SolarIQ+ selects the next whole-kW practical residential system that covers the calculated energy requirement.";
  }

  return { recommendedKw, reason, constrainedByRoof, residentialLimitExceeded };
}

function MetricCard({ label, value, hint, icon: Icon }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-400">{label}</div>
        {Icon && <Icon className="h-4 w-4 text-slate-400" />}
      </div>
      <div className="mt-2 text-lg font-bold text-navy-dark">{value}</div>
      {hint && <div className="mt-1 text-[11px] leading-4 text-slate-500">{hint}</div>}
    </div>
  );
}

export default function PlannerRecommendation() {
  const { activeProject, activeProjectId } = useProjectContext();
  const [panelTechnology, setPanelTechnology] = useState("TOPCon");
  const [panelPriority, setPanelPriority] = useState("balanced");

  const panelRecommendationMutation = useMutation({
    mutationFn: async (payload) => {
      const response = await api.post(
        "/panel-recommendations/recommend",
        payload
      );
      return response.data;
    },
  });

  const { data: bill, isLoading: billLoading, isError: billError } = useQuery({
    queryKey: ["project-bill", activeProjectId],
    queryFn: async () => (await api.get(`/projects/${activeProjectId}/bill`)).data,
    enabled: Boolean(activeProjectId),
    retry: false,
  });

  const { data: rooftop, isLoading: rooftopLoading } = useQuery({
    queryKey: ["project-rooftop", activeProjectId],
    queryFn: async () => (await api.get(`/projects/${activeProjectId}/rooftop`)).data,
    enabled: Boolean(activeProjectId),
    retry: false,
  });

  const calculation = useMemo(() => {
    const fields = getBillFields(bill);
    const monthlyUnits = numberOrNull(
      fields.monthly_consumption_kwh,
      fields.monthly_units,
      fields.consumption_kwh,
      fields.units_consumed,
      fields.monthly_consumption
    );
    const annualConsumption = monthlyUnits !== null && monthlyUnits > 0 ? monthlyUnits * 12 : null;
    const theoreticalKw = annualConsumption !== null ? annualConsumption / GENERATION_PER_KW_YEAR : null;

    const projectCapacity = numberOrNull(
      activeProject?.capacity_kw,
      activeProject?.capacityKw,
      activeProject?.system_capacity_kw,
      activeProject?.systemCapacityKw
    );

    const sanctionedLoad = numberOrNull(
      fields.sanctioned_load_kw,
      fields.sanctioned_load,
      fields.load_kw,
      activeProject?.sanctioned_load_kw
    );

    const roofAreaM2 = numberOrNull(activeProject?.roof_area_m2, activeProject?.roofAreaM2);
    const rooftopUsablePercentage = numberOrNull(
      rooftop?.usable_area_percentage,
      rooftop?.usableAreaPercentage,
      rooftop?.analysis?.usable_area_percentage,
      rooftop?.analysis?.usableAreaPercentage
    );

    const consumerType = String(
      firstValue(activeProject?.consumer_type, activeProject?.consumerType, fields.consumer_type, "Residential")
    ).toLowerCase();
    const propertyIsResidential = consumerType.includes("residential") || consumerType.includes("domestic");

    const practical = choosePracticalCapacity(theoreticalKw, roofAreaM2);
    const recommendedKw = practical.recommendedKw;
    const panelCount = Math.ceil((recommendedKw * 1000) / PANEL_WATT);
    const actualDcCapacityKw = (panelCount * PANEL_WATT) / 1000;
    const annualGeneration = recommendedKw * GENERATION_PER_KW_YEAR;
    const estimatedMonthlyGeneration = annualGeneration / 12;
    const subsidy = propertyIsResidential ? calculateSubsidy(recommendedKw) : 0;
    const marketCost = propertyIsResidential ? calculateMarketCost(recommendedKw) : null;
    const estimatedCustomerContribution = marketCost
      ? { min: Math.max(marketCost.min - subsidy, 0), max: Math.max(marketCost.max - subsidy, 0), midpoint: Math.max(marketCost.midpoint - subsidy, 0) }
      : null;
    const coverage = monthlyUnits !== null && monthlyUnits > 0 ? (estimatedMonthlyGeneration / monthlyUnits) * 100 : null;
    const loadWarning = sanctionedLoad !== null && recommendedKw > sanctionedLoad;

    return {
      monthlyUnits,
      annualConsumption,
      theoreticalKw,
      projectCapacity,
      sanctionedLoad,
      roofAreaM2,
      rooftopUsablePercentage,
      propertyIsResidential,
      recommendedKw,
      panelCount,
      actualDcCapacityKw,
      annualGeneration,
      estimatedMonthlyGeneration,
      coverage,
      subsidy,
      marketCost,
      estimatedCustomerContribution,
      loadWarning,
      ...practical,
    };
  }, [bill, activeProject, rooftop]);

  if (!activeProjectId || !activeProject) {
    return (
      <div className="space-y-4">
        <Panel>
          <PanelHeader title="System Recommendation" hint="Practical residential sizing from real project inputs" />
          <div className="p-5"><NoActiveProject /></div>
        </Panel>
        <StepFooter backTo="/planner/analysis" nextTo="/planner/financials" />
      </div>
    );
  }

  if (billLoading || rooftopLoading) {
    return (
      <div className="space-y-4">
        <Panel>
          <PanelHeader title="System Recommendation" hint="Calculating from the saved project, bill and rooftop inputs" />
          <div className="p-8 text-sm text-slate-500">Preparing the practical system recommendation…</div>
        </Panel>
        <StepFooter backTo="/planner/analysis" nextTo="/planner/financials" />
      </div>
    );
  }

  const {
    monthlyUnits, annualConsumption, theoreticalKw, projectCapacity, sanctionedLoad,
    roofAreaM2, rooftopUsablePercentage, propertyIsResidential, recommendedKw,
    panelCount, actualDcCapacityKw, annualGeneration, estimatedMonthlyGeneration,
    coverage, subsidy, marketCost, estimatedCustomerContribution, loadWarning,
    reason, constrainedByRoof, residentialLimitExceeded,
  } = calculation;

  const billUnavailable = billError || monthlyUnits === null || monthlyUnits <= 0;
  const panelRecommendations = panelRecommendationMutation.data?.recommendations ?? [];
  const requestPanelRecommendations = () => {
    const estimatedBudget = marketCost?.midpoint ?? Math.max(100000, recommendedKw * 75000);
    panelRecommendationMutation.mutate({
      budget: estimatedBudget,
      panel_technology: panelTechnology,
      property_type: propertyIsResidential ? "residential" : "commercial",
      roof_area_sqft: roofAreaM2 != null ? roofAreaM2 * 10.7639 : null,
      required_kw: recommendedKw,
      priority: panelPriority,
      top_n: 3,
    });
  };
  const layoutColumns = Math.min(5, Math.max(1, Math.ceil(Math.sqrt(panelCount))));
  const layoutRows = Math.ceil(panelCount / layoutColumns);

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-md border border-slate-800 bg-[#071126] text-white">
        <div className="relative p-7">
          <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:32px_32px]" />
          <div className="relative">
            <div className="text-[10px] uppercase tracking-[0.18em] font-semibold text-amber-400">Practical residential recommendation</div>
            <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-1">
              <span className="text-5xl font-black tracking-tight">{recommendedKw}</span>
              <span className="mb-1 text-xl font-medium text-slate-300">kW</span>
            </div>
            <div className="mt-2 max-w-2xl text-sm text-slate-300">SolarIQ+ separates the bill-based theoretical requirement from the practical residential system size.</div>
            <div className="mt-5 flex flex-wrap gap-3">
              <DataTag>Calculated need: {theoreticalKw !== null ? `${formatNumber(theoreticalKw, 2)} kW` : "Not available"}</DataTag>
              <DataTag>{panelCount} × {PANEL_WATT} W panels</DataTag>
              {propertyIsResidential && <DataTag>PM Surya Ghar subsidy: {formatMoney(subsidy)}</DataTag>}
            </div>
          </div>
        </div>
      </div>

      <Panel>
        <PanelHeader title="Why this system?" hint="The recommendation is intentionally different from a direct fractional-kW calculation" />
        <div className="grid gap-4 p-5 md:grid-cols-3">
          <MetricCard label="Theoretical requirement" value={theoreticalKw !== null ? `${formatNumber(theoreticalKw, 2)} kW` : "Not detected"} hint={annualConsumption !== null ? `${formatNumber(annualConsumption, 0)} kWh/year ÷ ${GENERATION_PER_KW_YEAR} kWh/kW/year` : "Monthly bill consumption is unavailable."} icon={FileText} />
          <MetricCard label="Practical recommendation" value={`${recommendedKw} kW`} hint="SolarIQ+ residential planning starts at 3 kW." icon={Sun} />
          <MetricCard label="Panel configuration" value={`${panelCount} panels`} hint={`${PANEL_WATT} W/module • ${formatNumber(actualDcCapacityKw, 2)} kWp DC`} icon={PanelTop} />
        </div>
        <div className="border-t border-slate-200 bg-slate-50 px-5 py-4 text-sm leading-6 text-slate-600"><span className="font-semibold text-navy-dark">Reason: </span>{reason}</div>
      </Panel>

      <Panel>
        <PanelHeader title="Recommendation inputs" hint="Real values used by the deterministic SolarIQ+ sizing engine" />
        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Monthly consumption" value={monthlyUnits !== null ? `${formatNumber(monthlyUnits, 0)} kWh` : "Not detected"} hint={billUnavailable ? "Bill input unavailable" : "Real bill input"} icon={FileText} />
          <MetricCard label="Rooftop usable area" value={rooftopUsablePercentage !== null ? `${formatNumber(rooftopUsablePercentage, 0)}%` : "Not available"} hint={roofAreaM2 !== null ? `${formatNumber(roofAreaM2, 1)} m² entered roof area` : "No measured roof area"} icon={ScanEye} />
          <MetricCard label="Project capacity" value={projectCapacity !== null ? `${formatNumber(projectCapacity, 2)} kW` : "Not specified"} hint="Optional target from Project Setup" icon={Home} />
          <MetricCard label="Sanctioned load" value={sanctionedLoad !== null ? `${formatNumber(sanctionedLoad, 2)} kW` : "Not detected"} hint="Feasibility input; not used to invent consumption" icon={IndianRupee} />
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        <Panel>
          <PanelHeader title="System configuration" hint="Practical configuration derived from the recommended capacity" />
          <div className="divide-y divide-slate-200">
            {[
              ["Recommended capacity", `${recommendedKw} kW`],
              ["Panel", `${PANEL_WATT} W`],
              ["Panel count", String(panelCount)],
              ["Layout", `${layoutColumns} × ${layoutRows}`],
              ["Panel technology", "High-efficiency mono / TOPCon class"],
              ["Mounting structure", "Fixed Tilt"],
              ["Estimated annual generation", `${formatNumber(annualGeneration, 0)} kWh`],
              ["Estimated monthly generation", `${formatNumber(estimatedMonthlyGeneration, 0)} kWh`],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                <span className="text-slate-500">{label}</span>
                <span className="font-semibold text-navy-dark text-right">{value}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-slate-200 px-5 py-4">
            <DataTag>LIVE CALCULATION</DataTag>
            {coverage !== null && <p className="mt-3 text-xs leading-5 text-slate-500">Estimated generation is approximately <span className="font-semibold text-slate-700">{formatNumber(coverage, 0)}%</span> of detected monthly consumption on an annual-average basis. Actual generation varies with irradiation, orientation, shading, temperature and system losses.</p>}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Layout diagram" hint="Roof → panel layout → practical system capacity" />
          <div className="p-5">
            <div className="grid grid-cols-[90px_1fr_110px] items-center gap-5">
              <div className="text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded border border-slate-300 bg-slate-50"><Home className="h-8 w-8 text-slate-500" /></div>
                <div className="mt-2 text-[9px] uppercase tracking-wide text-slate-400">Roof</div>
              </div>
              <div className="relative">
                <div className="absolute left-0 right-0 top-1/2 border-t border-dashed border-slate-300" />
                <div className="relative mx-auto grid w-fit gap-1 rounded border border-slate-300 bg-white p-2" style={{ gridTemplateColumns: `repeat(${layoutColumns}, minmax(20px, 1fr))` }}>
                  {Array.from({ length: panelCount }).map((_, index) => <div key={index} className="h-7 w-7 rounded-sm border border-slate-400 bg-slate-200" />)}
                </div>
                <div className="mt-2 text-center text-[9px] uppercase tracking-wide text-slate-400">{layoutColumns} × {layoutRows} panels</div>
              </div>
              <div className="text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded border border-amber-400 bg-amber-50"><div><div className="text-xl font-black text-amber-600">{recommendedKw}</div><div className="text-[9px] font-semibold text-amber-600">kW</div></div></div>
                <div className="mt-2 text-[9px] uppercase tracking-wide text-slate-400">Capacity</div>
              </div>
            </div>
            <p className="mt-6 text-xs leading-5 text-slate-500">Panel count is rounded up to complete {PANEL_WATT} W modules. Final placement requires actual roof dimensions, setbacks, orientation, shading and site verification.</p>
          </div>
        </Panel>
      </div>

      {propertyIsResidential && marketCost && (
        <Panel>
          <PanelHeader title="Residential installed-cost estimate" hint="Market-based planning range — not a vendor quotation" />
          <div className="grid gap-3 p-5 md:grid-cols-3">
            <MetricCard label="Estimated installed cost" value={formatMoney(marketCost.midpoint)} hint={`Planning range: ${formatMoney(marketCost.min)} – ${formatMoney(marketCost.max)}`} icon={IndianRupee} />
            <MetricCard label="Central subsidy" value={formatMoney(subsidy)} hint="₹30k/kW for first 2 kW + ₹18k for the additional 1 kW; ₹78k maximum" icon={CheckCircle2} />
            <MetricCard label="Estimated customer contribution" value={formatMoney(estimatedCustomerContribution.midpoint)} hint={`After subsidy: ${formatMoney(estimatedCustomerContribution.min)} – ${formatMoney(estimatedCustomerContribution.max)}`} icon={Sun} />
          </div>
          <div className="border-t border-slate-200 bg-slate-50 px-5 py-4 text-xs leading-5 text-slate-600">
            <span className="font-semibold text-slate-700">Why a range?</span> SolarIQ+ accounts for real-world variation between brands, module/inverter technology, mounting structure, roof type, installation complexity and site-specific electrical work. The displayed midpoint is for planning only.
          </div>
        </Panel>
      )}

      <Panel>
        <PanelHeader
          title="AI Panel Brand Recommendations"
          hint="Ranked brand suggestions based on your system size, budget, technology and selected priority"
        />
        <div className="space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block text-sm font-medium text-slate-700">
              Panel technology
              <select
                value={panelTechnology}
                onChange={(event) => setPanelTechnology(event.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="TOPCon">TOPCon</option>
                <option value="Mono PERC">Mono PERC</option>
                <option value="HJT">HJT</option>
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Recommendation priority
              <select
                value={panelPriority}
                onChange={(event) => setPanelPriority(event.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="balanced">Balanced</option>
                <option value="lowest_cost">Lowest cost</option>
                <option value="maximum_efficiency">Maximum efficiency</option>
                <option value="long_term_value">Long-term value</option>
              </select>
            </label>
            <div className="flex items-end">
              <button
                type="button"
                onClick={requestPanelRecommendations}
                disabled={panelRecommendationMutation.isPending}
                className="w-full rounded-md bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {panelRecommendationMutation.isPending ? "Finding best panels…" : "Get AI recommendations"}
              </button>
            </div>
          </div>

          <p className="text-xs leading-5 text-slate-500">
            Uses the calculated {recommendedKw} kW system. Brand specifications and scores come from SolarIQ+'s configured catalogue and scoring logic; verify current product datasheets and quotations before purchase.
          </p>

          {panelRecommendationMutation.isError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              Could not load panel recommendations. Check that the backend is running and the panel recommendation endpoint is available, then try again.
            </div>
          )}

          {!panelRecommendationMutation.isPending && !panelRecommendationMutation.isError && panelRecommendationMutation.isSuccess && panelRecommendations.length === 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              No brands in the configured catalogue support {panelTechnology}. Try another technology.
            </div>
          )}

          {panelRecommendations.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {panelRecommendations.map((brand, index) => (
                <div
                  key={`${brand.name}-${brand.technology}`}
                  className={`rounded-lg border p-4 ${index === 0 ? "border-emerald-300 bg-emerald-50/60" : "border-slate-200 bg-white"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        {index === 0 ? "Top recommendation" : `Recommendation #${brand.rank ?? index + 1}`}
                      </div>
                      <h3 className="mt-1 text-lg font-bold text-navy-dark">{brand.name}</h3>
                    </div>
                    <div className="shrink-0 rounded-md bg-white px-3 py-2 text-right shadow-sm">
                      <div className="text-xl font-bold text-emerald-700">{formatNumber(brand.ai_score, 1)}</div>
                      <div className="text-[9px] uppercase tracking-wide text-slate-500">AI score / 100</div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <div className="rounded-md bg-slate-50 p-2">
                      <div className="text-[10px] uppercase tracking-wide text-slate-400">Technology</div>
                      <div className="mt-1 text-sm font-semibold text-slate-800">{brand.technology || panelTechnology}</div>
                    </div>
                    <div className="rounded-md bg-slate-50 p-2">
                      <div className="text-[10px] uppercase tracking-wide text-slate-400">Efficiency</div>
                      <div className="mt-1 text-sm font-semibold text-slate-800">{brand.efficiency || "Not listed"}</div>
                    </div>
                    <div className="rounded-md bg-slate-50 p-2">
                      <div className="text-[10px] uppercase tracking-wide text-slate-400">Warranty</div>
                      <div className="mt-1 text-sm font-semibold text-slate-800">{brand.warranty || "Not listed"}</div>
                    </div>
                    <div className="rounded-md bg-slate-50 p-2">
                      <div className="text-[10px] uppercase tracking-wide text-slate-400">Price category</div>
                      <div className="mt-1 text-sm font-semibold capitalize text-slate-800">{String(brand.price || "Not listed").replace(/([a-z])([A-Z])/g, "$1 $2")}</div>
                    </div>
                    <div className="rounded-md bg-slate-50 p-2">
                      <div className="text-[10px] uppercase tracking-wide text-slate-400">Rating</div>
                      <div className="mt-1 text-sm font-semibold text-slate-800">{brand.rating != null ? `${brand.rating}/5` : "Not listed"}</div>
                    </div>
                    <div className="rounded-md bg-slate-50 p-2">
                      <div className="text-[10px] uppercase tracking-wide text-slate-400">Origin</div>
                      <div className="mt-1 text-sm font-semibold text-slate-800">{brand.origin || "Not listed"}</div>
                    </div>
                  </div>

                  {brand.best_for && <p className="mt-3 text-xs font-semibold text-slate-700">Best for: {brand.best_for}</p>}
                  {brand.recommendation_reason && <p className="mt-2 text-xs leading-5 text-slate-600">{brand.recommendation_reason}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </Panel>

      {(residentialLimitExceeded || constrainedByRoof || loadWarning) && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="space-y-2 text-sm text-amber-900">
              <div className="font-semibold">Planning review required</div>
              {residentialLimitExceeded && <p>The bill-based requirement is above the 10 kW residential planning boundary used by SolarIQ+. The displayed 10 kW recommendation is a planning cap and requires additional technical/category review.</p>}
              {constrainedByRoof && <p>The entered roof area may not provide enough space for the calculated system. SolarIQ+ has reduced the practical system where possible.</p>}
              {loadWarning && <p>The recommended system is above the detected sanctioned load. Load enhancement / DISCOM feasibility should be checked before installation.</p>}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div>
            <div className="text-sm font-semibold text-emerald-900">Recommendation calculated from real inputs</div>
            <div className="mt-1 text-xs leading-5 text-emerald-800">This is a deterministic engineering/planning estimate, not a machine-learning prediction. The practical system rule and market-cost estimate are kept separate from the bill's theoretical energy requirement.</div>
          </div>
        </div>
      </div>

      <StepFooter backTo="/planner/analysis" nextTo="/planner/financials" />
    </div>
  );
}