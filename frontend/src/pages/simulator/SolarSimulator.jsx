import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Battery,
  Calculator,
  CircleDollarSign,
  Database,
  FileText,
  Gauge,
  Leaf,
  Lightbulb,
  RefreshCcw,
  ScanEye,
  Sun,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react";

import { useProjectContext } from "@/context/ProjectContext";
import { api } from "@/lib/api";

import {
  calculateSimulator,
  DEFAULT_SIMULATOR_INPUTS,
  formatINR,
  formatNumber,
} from "./simulatorEngine";

const STORAGE_KEY =
  "solariq_solar_simulator";

const PANEL_WATT = 550;
// Match simulatorEngine.js: 4.5 peak-sun-hours × 365 days × 0.78 performance ratio.
const GENERATION_PER_KW_YEAR = 4.5 * 365 * 0.78;
const ROOF_AREA_PER_KW_M2 = 9.29;
const CAPACITY_OPTIONS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];

const MARKET_COST_BANDS = [
  {
    maxKw: 3,
    min: 190000,
    max: 220000,
  },
  {
    maxKw: 5,
    min: 205000,
    max: 300000,
  },
  {
    maxKw: 7,
    min: 270000,
    max: 390000,
  },
  {
    maxKw: 10,
    min: 370000,
    max: 560000,
  },
];

function numberOrNull(...values) {
  for (const value of values) {
    if (
      value === undefined ||
      value === null ||
      value === ""
    ) {
      continue;
    }

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

    if (Number.isFinite(parsed)) {
      return parsed;
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

function getBillFields(bill) {
  if (!bill) {
    return {};
  }

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
    !Array.isArray(
      bill.extracted_fields
    )
  ) {
    return bill.extracted_fields;
  }

  return bill;
}

function getMarketCost(capacityKw) {
  const capacity =
    Number(capacityKw);

  if (
    !Number.isFinite(capacity) ||
    capacity <= 0
  ) {
    return null;
  }

  const band =
    MARKET_COST_BANDS.find(
      (item) =>
        capacity <= item.maxKw
    ) ||
    MARKET_COST_BANDS[
      MARKET_COST_BANDS.length - 1
    ];

  return {
    min: band.min,
    max: band.max,
    midpoint: Math.round(
      (band.min + band.max) / 2
    ),
  };
}

function getRecommendedCapacity(
  monthlyUnits,
  roofArea
) {
  const units = Number(monthlyUnits);

  if (!Number.isFinite(units) || units <= 0) {
    return 1.5;
  }

  // Use the same annual generation assumption as simulatorEngine.js.
  const theoreticalKw = (units * 12) / GENERATION_PER_KW_YEAR;
  const boundedKw = Math.min(10, Math.max(0.5, theoreticalKw));

  // Snap the calculated capacity to an option available in the simulator.
  let recommended = CAPACITY_OPTIONS.reduce((closest, capacity) =>
    Math.abs(capacity - boundedKw) < Math.abs(closest - boundedKw)
      ? capacity
      : closest,
    CAPACITY_OPTIONS[0]
  );

  if (Number.isFinite(Number(roofArea)) && Number(roofArea) > 0) {
    const roofCapacity = Math.floor(Number(roofArea) / ROOF_AREA_PER_KW_M2);

    if (roofCapacity >= 0.5 && roofCapacity < recommended) {
      const roofBounded = Math.min(10, roofCapacity);
      recommended = CAPACITY_OPTIONS.reduce((closest, capacity) =>
        capacity <= roofBounded &&
        Math.abs(capacity - roofBounded) < Math.abs(closest - roofBounded)
          ? capacity
          : closest,
        CAPACITY_OPTIONS[0]
      );
    }
  }

  return recommended;
}

function Field({
  label,
  value,
  onChange,
  suffix,
  min,
  max,
  step = 1,
  help,
  source,
}) {
  return (
    <label className="block">

      <div className="flex items-center justify-between gap-2">

        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
          {label}
        </span>

        {source && (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-700">
            {source}
          </span>
        )}

      </div>

      <div className="relative mt-1.5">

        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(event) =>
            onChange(
              event.target.value
            )
          }
          className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 pr-16 text-sm font-semibold text-slate-900 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
        />

        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
            {suffix}
          </span>
        )}

      </div>

      {help && (
        <span className="mt-1 block text-[11px] text-slate-400">
          {help}
        </span>
      )}

    </label>
  );
}

function ResultCard({
  icon: Icon,
  label,
  value,
  sub,
  featured = false,
}) {
  return (
    <div
      className={`rounded-2xl border p-5 ${
        featured
          ? "border-amber-200 bg-amber-50"
          : "border-slate-200 bg-white"
      }`}
    >

      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
        <Icon className="h-4 w-4 text-amber-600" />

        {label}
      </div>

      <div className="mt-3 text-2xl font-extrabold tracking-tight text-slate-950">
        {value}
      </div>

      {sub && (
        <div className="mt-1 text-xs text-slate-500">
          {sub}
        </div>
      )}

    </div>
  );
}

function FlowBar({
  label,
  value,
  total,
  icon: Icon,
}) {
  const percent =
    total > 0
      ? Math.min(
          100,
          (value / total) * 100
        )
      : 0;

  return (
    <div>

      <div className="mb-1.5 flex items-center justify-between text-xs">

        <span className="flex items-center gap-1.5 font-semibold text-slate-600">
          <Icon className="h-3.5 w-3.5" />

          {label}
        </span>

        <span className="font-bold text-slate-800">
          {formatNumber(value)} kWh
        </span>

      </div>

      <div className="h-2 overflow-hidden rounded-full bg-slate-100">

        <div
          className="h-full rounded-full bg-amber-400 transition-all duration-300"
          style={{
            width: `${percent}%`,
          }}
        />

      </div>

    </div>
  );
}

export default function SolarSimulator() {
  const {
    activeProject,
    activeProjectId,
  } = useProjectContext();

  const [inputs, setInputs] =
    useState(
      DEFAULT_SIMULATOR_INPUTS
    );

  const [plannerData, setPlannerData] =
    useState(null);

  const [plannerLoading, setPlannerLoading] =
    useState(false);

  const [plannerError, setPlannerError] =
    useState("");

  const [plannerConnected, setPlannerConnected] =
    useState(false);

  const [mlContext, setMlContext] = useState(null);
  const [mlLoading, setMlLoading] = useState(false);
  const [liveXgboost, setLiveXgboost] = useState(null);
  const [liveXgboostLoading, setLiveXgboostLoading] = useState(false);
  const [liveXgboostError, setLiveXgboostError] = useState("");
  const [pvgisGeneration, setPvgisGeneration] = useState(null);
  const [pvgisLoading, setPvgisLoading] = useState(false);
  // Illustrative starting values only; replace with measured/site weather data.
  const [mlFeatures, setMlFeatures] = useState({
    GHI: 650,
    Temperature: 30,
    "Relative Humidity": 45,
    "Wind Speed": 2,
    "Wind Direction": 180,
    Hour: 12,
    Day: 15,
    Month: 5,
    "SZ Angle": 20,
    "SA Angle": 160,
  });
  const [simulationStarted, setSimulationStarted] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardQuestionsStarted, setWizardQuestionsStarted] = useState(false);
  const [showPanelGuide, setShowPanelGuide] = useState(false);
  const [compareBothBatteryOptions, setCompareBothBatteryOptions] = useState(false);

  /*
   * Load locally saved simulator
   * settings first.
   */
  useEffect(() => {
    try {
      const saved =
        JSON.parse(
          localStorage.getItem(
            STORAGE_KEY
          ) || "null"
        );

      if (
        saved &&
        typeof saved === "object"
      ) {
        setInputs((current) => ({
          ...current,
          ...saved,
        }));
      }
    } catch {
      // Ignore invalid saved data.
    }
  }, []);

  /*
   * Persist simulator changes.
   */
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(inputs)
      );
    } catch {
      // Ignore localStorage errors.
    }
  }, [inputs]);

  const loadMLContext = useCallback(async () => {
    setMlLoading(true);
    try {
      const [evaluation, forecast, shap] = await Promise.allSettled([
        fetch(`${process.env.REACT_APP_BACKEND_URL || "http://127.0.0.1:8000"}/api/ml/evaluation`).then((r) => r.ok ? r.json() : Promise.reject(new Error("evaluation unavailable"))),
        fetch(`${process.env.REACT_APP_BACKEND_URL || "http://127.0.0.1:8000"}/api/ml/forecast`).then((r) => r.ok ? r.json() : Promise.reject(new Error("forecast unavailable"))),
        fetch(`${process.env.REACT_APP_BACKEND_URL || "http://127.0.0.1:8000"}/api/ml/shap`).then((r) => r.ok ? r.json() : Promise.reject(new Error("SHAP unavailable"))),
      ]);
      setMlContext({
        evaluation: evaluation.status === "fulfilled" ? evaluation.value : null,
        forecast: forecast.status === "fulfilled" ? forecast.value : null,
        shap: shap.status === "fulfilled" ? shap.value : null,
      });
    } catch {
      setMlContext(null);
    } finally {
      setMlLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMLContext();
  }, [loadMLContext]);

  /*
   * Load the actual planner data.
   *
   * Sources:
   *
   * Project
   * Bill OCR
   * Rooftop analysis
   *
   * The recommendation is reconstructed
   * using the SAME planning rules used
   * by PlannerRecommendation.
   */
  const loadPlannerData =
    useCallback(async () => {
      if (!activeProjectId) {
        setPlannerConnected(false);
        setPlannerData(null);
        return;
      }

      setPlannerLoading(true);
      setPlannerError("");

      try {
        const [
          billResponse,
          rooftopResponse,
        ] = await Promise.allSettled([
          api.get(
            `/projects/${activeProjectId}/bill`
          ),

          api.get(
            `/projects/${activeProjectId}/rooftop`
          ),
        ]);

        const bill =
          billResponse.status ===
          "fulfilled"
            ? billResponse.value?.data
            : null;

        const rooftop =
          rooftopResponse.status ===
          "fulfilled"
            ? rooftopResponse.value?.data
            : null;

        const fields =
          getBillFields(bill);

        const monthlyConsumption =
          numberOrNull(
            fields.monthly_consumption_kwh,
            fields.monthly_units,
            fields.consumption_kwh,
            fields.units_consumed,
            fields.monthly_consumption
          );

        const monthlyBill =
          numberOrNull(
            fields.bill_amount,
            fields.current_bill_amount,
            fields.total_bill_amount,
            fields.net_bill_amount,
            fields.billAmount
          );

        const detectedTariff =
          numberOrNull(
            fields.tariff,
            fields.tariff_per_kwh,
            fields.tariff_code,
            fields.tariffCode
          );

        /*
         * If the electricity bill does not
         * explicitly expose tariff, derive a
         * transparent planning estimate from:
         *
         * bill / monthly consumption
         */
        const derivedTariff =
          monthlyConsumption > 0 &&
          monthlyBill > 0
            ? monthlyBill /
              monthlyConsumption
            : null;

        const tariff =
          detectedTariff ||
          derivedTariff;

        const roofArea =
          numberOrNull(
            activeProject?.roof_area_m2,
            activeProject?.roofAreaM2,
            activeProject?.roofArea
          );

        const rooftopUsablePercentage =
          numberOrNull(
            rooftop?.usable_area_percentage,
            rooftop?.usableAreaPercentage,
            rooftop?.analysis
              ?.usable_area_percentage,
            rooftop?.analysis
              ?.usableAreaPercentage
          );

        const projectCapacity =
          numberOrNull(
            activeProject?.capacity_kw,
            activeProject?.capacityKw,
            activeProject?.system_capacity_kw,
            activeProject?.systemCapacityKw
          );

        const recommendedCapacity =
          getRecommendedCapacity(
            monthlyConsumption,
            roofArea
          );

        /*
         * Prefer an explicitly stored
         * project capacity when present.
         *
         * Otherwise use the planner's
         * consumption-driven recommendation.
         */
        const systemCapacity =
          projectCapacity &&
          projectCapacity > 0
            ? projectCapacity
            : recommendedCapacity;

        const panelWattage =
          numberOrNull(
            activeProject?.panel_wattage_w,
            activeProject?.panelWattage
          ) ||
          PANEL_WATT;

        
        const panelCount =
          Number.isFinite(
            Number(panelWattage)
          ) &&
          systemCapacity > 0
            ? Math.ceil(
                (systemCapacity * 1000) /
                  panelWattage
              )
            : null;


        const marketCost =
          getMarketCost(
            systemCapacity
          );

        const storedInstallationCost =
          numberOrNull(
            activeProject?.installation_cost,
            activeProject?.installationCost
          );

        const installationCost =
          storedInstallationCost ||
          marketCost?.midpoint ||
          DEFAULT_SIMULATOR_INPUTS.installationCost;

        const panelBrand =
          firstValue(
            activeProject?.panel_brand,
            activeProject?.panelBrand
          );

        const inverterBrand =
          firstValue(
            activeProject?.inverter_brand,
            activeProject?.inverterBrand
          );

        const panelType =
          firstValue(
            activeProject?.panel_type,
            activeProject?.panelType
          );

        const normalizedPanelType =
          String(
            panelType || ""
          ).toLowerCase() ===
          "bifacial"
            ? "bifacial"
            : "monofacial";

        const data = {
          bill,
          rooftop,

          monthlyConsumption,
          monthlyBill,
          tariff,

          derivedTariff:
            !detectedTariff &&
            derivedTariff !== null,

          roofArea,

          rooftopUsablePercentage,

          projectCapacity,

          recommendedCapacity,

          systemCapacity,

          panelWattage,

          panelCount,

          panelBrand,

          inverterBrand,

          panelType:
            normalizedPanelType,

          installationCost,

          marketCost,
        };

        setPlannerData(data);
        setPlannerConnected(
          Boolean(
            monthlyConsumption ||
              monthlyBill ||
              projectCapacity ||
              rooftop
          )
        );

        /*
         * IMPORTANT:
         *
         * Planner values become the
         * initial simulator values.
         *
         * After this, the user can
         * freely change them.
         */
        setInputs((current) => ({
          ...current,

          ...(monthlyConsumption > 0
            ? {
                monthlyConsumption,
              }
            : {}),

          ...(monthlyBill > 0
            ? {
                monthlyBill,
              }
            : {}),

          ...(tariff > 0
            ? {
                tariff: Number(
                  tariff.toFixed(2)
                ),
              }
            : {}),

          ...(systemCapacity > 0
            ? {
                systemCapacity,
              }
            : {}),

          ...(installationCost > 0
            ? {
                installationCost,
              }
            : {}),

          panelType:
            normalizedPanelType,
        }));
      } catch (error) {
        console.error(
          "Unable to load planner data:",
          error
        );

        setPlannerError(
          "Planner data could not be loaded. You can still enter simulator values manually."
        );

        setPlannerConnected(false);
      } finally {
        setPlannerLoading(false);
      }
    }, [activeProject, activeProjectId]);

  useEffect(() => {
    loadPlannerData();
  }, [loadPlannerData]);

  const simulatorInputs = useMemo(() => ({
    ...inputs,
    annualGenerationOverride: pvgisGeneration?.final_annual_generation_kwh,
  }), [inputs, pvgisGeneration]);

  const result = useMemo(
    () => calculateSimulator(simulatorInputs),
    [simulatorInputs]
  );
  const batteryComparison = useMemo(() => ({
    solarOnly: calculateSimulator({ ...simulatorInputs, batterySize: 0 }),
    withBattery: calculateSimulator({ ...simulatorInputs, batterySize: 5 }),
  }), [simulatorInputs]);

  const update = (
    key,
    value
  ) => {
    // A changed assumption triggers a fresh PVGIS-assisted estimate below.
    setPvgisGeneration(null);
    setInputs((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const reset = () => {
    setSimulationStarted(false);
    setPvgisGeneration(null);
    setPvgisLoading(false);
    setLiveXgboost(null);
    setLiveXgboostError("");
    setLiveXgboostLoading(false);
    setWizardStep(0);
    setWizardQuestionsStarted(false);
    setCompareBothBatteryOptions(false);
    setShowPanelGuide(false);
    /*
     * Reset means reset the simulator
     * back to planner-connected values
     * when planner data exists.
     */
    if (plannerData) {
      setInputs((current) => ({
        ...DEFAULT_SIMULATOR_INPUTS,

        ...(plannerData.monthlyConsumption > 0
          ? {
              monthlyConsumption:
                plannerData.monthlyConsumption,
            }
          : {}),

        ...(plannerData.monthlyBill > 0
          ? {
              monthlyBill:
                plannerData.monthlyBill,
            }
          : {}),

        ...(plannerData.tariff > 0
          ? {
              tariff:
                Number(
                  plannerData.tariff.toFixed(
                    2
                  )
                ),
            }
          : {}),

        ...(plannerData.systemCapacity > 0
          ? {
              systemCapacity:
                plannerData.systemCapacity,
            }
          : {}),

        ...(plannerData.installationCost > 0
          ? {
              installationCost:
                plannerData.installationCost,
            }
          : {}),

        panelType:
          plannerData.panelType ||
          "monofacial",
      }));

      return;
    }

    setInputs(
      DEFAULT_SIMULATOR_INPUTS
    );
  };

  const annualBillSavingsPercent =
    result.annualBill > 0
      ? Math.min(
          100,
          (result.annualSavings /
            result.annualBill) *
            100
        )
      : 0;

  const wizardQuestions = [
    {
      title: "How much electricity do you use?",
      description: "You can find this on your electricity bill. An approximate monthly value is fine.",
      key: "monthlyConsumption",
      suffix: "kWh / month",
      type: "number",
      min: 50,
      max: 100000,
      step: 10,
      helper: "Typical homes may use around 150–600 kWh per month.",
    },
    {
      title: "What is your monthly electricity bill?",
      description: "Enter the amount you usually pay each month.",
      key: "monthlyBill",
      suffix: "₹ per month",
      type: "number",
      min: 100,
      max: 10000000,
      step: 100,
      helper: "We'll use this to estimate your potential savings.",
    },
    {
      title: "What solar system size would you like to explore?",
      description: "Choose a system size you would like to compare. You can change it and review the estimated results.",
      key: "systemCapacity",
      type: "capacity",
    },
    {
      title: "Which solar panel type do you prefer?",
      description: "If you're unsure, choose the standard option.",
      key: "panelType",
      type: "panel",
    },
    {
      title: "Would you like battery storage?",
      description: "A battery can provide backup and store energy for later use. It increases the upfront cost.",
      key: "batterySize",
      type: "battery",
    },
  ];

  const currentQuestion = wizardQuestions[wizardStep];
  // Match the suggested option to the same engineering range shown in results.
  // This avoids labeling 3 kW as suggested when the calculated range is ~1.0–1.4 kW.
  const capacityRangeMidpoint =
    (result.suitableCapacity.low + result.suitableCapacity.high) / 2;
  const roofCapacityLimit =
    Number.isFinite(Number(plannerData?.roofArea)) && Number(plannerData?.roofArea) > 0
      ? Math.max(0.5, Math.floor(Number(plannerData.roofArea) / ROOF_AREA_PER_KW_M2))
      : Infinity;
  const capacityTarget = Math.min(capacityRangeMidpoint, roofCapacityLimit);
  const suggestedCapacity = CAPACITY_OPTIONS.reduce((closest, capacity) =>
    Math.abs(capacity - capacityTarget) < Math.abs(closest - capacityTarget)
      ? capacity
      : closest,
    CAPACITY_OPTIONS[0]
  );
  const startSimulation = () => {
    setSimulationStarted(true);
    setPvgisGeneration(null);
    setLiveXgboost(null);
    setLiveXgboostError("");
  };

  // Fetch/re-fetch the PVGIS blend whenever a simulation starts or its inputs change.
  // This prevents the results from silently reverting to engineering-only values
  // after the user edits a field on the results screen.
  useEffect(() => {
    if (!simulationStarted) return undefined;

    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setPvgisLoading(true);
      setPvgisGeneration(null);
      setLiveXgboostError("");

      const baseUrl = process.env.REACT_APP_BACKEND_URL || "http://127.0.0.1:8000";
      const latitude = numberOrNull(
        activeProject?.latitude,
        activeProject?.lat,
        activeProject?.location_latitude,
        activeProject?.location?.latitude
      ) ?? 19.8762;
      const longitude = numberOrNull(
        activeProject?.longitude,
        activeProject?.lon,
        activeProject?.lng,
        activeProject?.location_longitude,
        activeProject?.location?.longitude
      ) ?? 75.3433;

      try {
        const response = await fetch(
          `${baseUrl}/api/monitoring/xgboost/simulator-generation`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              project_id: String(activeProjectId || activeProject?.id || "SolarIQ-Simulator"),
              latitude,
              longitude,
              system_capacity_kw: Number(inputs.systemCapacity),
              engineering_generation_kwh: calculateSimulator(inputs).annualGeneration,
            }),
          }
        );
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.detail || `PVGIS request failed (${response.status})`);
        if (!(Number(payload?.final_annual_generation_kwh) > 0)) {
          throw new Error("PVGIS endpoint returned an invalid annual generation estimate");
        }
        if (!cancelled) setPvgisGeneration(payload);
      } catch (error) {
        if (!cancelled && error?.name !== "AbortError") {
          setPvgisGeneration(null);
          setLiveXgboostError(error?.message || "PVGIS estimate unavailable; using the engineering estimate.");
        }
      } finally {
        if (!cancelled) setPvgisLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [simulationStarted, inputs, activeProject, activeProjectId]);

  const nextStep = () => {
    if (wizardStep < wizardQuestions.length - 1) {
      setWizardStep((step) => step + 1);
    } else {
      startSimulation();
    }
  };

  return (
    <div className="min-h-full space-y-6 pb-12">
      <style>{`
        @keyframes solariqSlideIn {
          from { opacity: 0.65; transform: translateX(28px) scale(0.99); }
          to { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes solariqFadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      {!simulationStarted ? (
        wizardStep === 0 && !wizardQuestionsStarted ? (
        <section className="mx-auto max-w-3xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 px-6 py-8 text-white sm:px-10 sm:py-10">
            <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-emerald-400/10 blur-2xl" />
            <div className="relative flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-amber-300">
                <Sun className="h-6 w-6" />
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">SolarIQ+ simulator</div>
                <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">Explore your solar savings</h1>
                <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">
                  Answer a few simple questions to estimate solar generation, savings and payback. No technical knowledge required.
                </p>
              </div>
            </div>
            <div className="relative mt-6 flex flex-wrap gap-3 text-xs text-slate-200">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-2"><CircleDollarSign className="h-4 w-4 text-emerald-300" /> Estimated savings</span>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-2"><Gauge className="h-4 w-4 text-emerald-300" /> Payback period</span>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-2"><Leaf className="h-4 w-4 text-emerald-300" /> Environmental impact</span>
            </div>
          </div>

          <div className="p-6 sm:p-10">
            {plannerLoading && (
              <div className="mb-4 flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 text-xs text-blue-700">
                <RefreshCcw className="h-4 w-4 animate-spin" /> Checking your Solar Planner information…
              </div>
            )}
            {plannerError && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                We couldn't import your previous planning details. You can still continue and enter your values here.
              </div>
            )}
            {plannerConnected && (
              <div className="mb-5 flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                <Database className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
                <div>
                  <div className="text-sm font-bold text-emerald-900">Your Solar Planner details are ready</div>
                  <p className="mt-1 text-xs leading-5 text-emerald-800">We've filled in the information we could find. You can review it during the simulation.</p>
                </div>
              </div>
            )}
            <div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">Ready to try it?</h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">The guided setup takes about a minute. You can go back and change your answers at any time.</p>
              </div>
              <button
                type="button"
                onClick={() => { setWizardStep(0); setWizardQuestionsStarted(true); }}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
              >
                <Calculator className="h-4 w-4" /> Try Simulation <span aria-hidden="true">→</span>
              </button>
            </div>
            <p className="mt-5 text-[11px] leading-5 text-slate-400">These are planning estimates, not a final installer quote or a guarantee of electricity production.</p>
          </div>
        </section>
        ) : (
          <section className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
            <div className="mb-7 flex items-center justify-between gap-4">
              <button type="button" onClick={() => wizardStep === 0 ? setWizardQuestionsStarted(false) : setWizardStep((step) => step - 1)} className="inline-flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900">← Back</button>
              <span className="text-xs font-bold text-slate-500">Step {wizardStep + 1} of {wizardQuestions.length}</span>
            </div>
            <div className="mb-8 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500 transition-all duration-300" style={{ width: `${((wizardStep + 1) / wizardQuestions.length) * 100}%` }} /></div>
            <div className="min-h-[300px]">
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">{currentQuestion.title}</h1>
              <p className="mt-3 text-sm leading-6 text-slate-500">{currentQuestion.description}</p>
              <div className="mt-8">
                {currentQuestion.type === "number" && (
                  <div className="max-w-md">
                    <label className="block text-sm font-bold text-slate-700">
                      {currentQuestion.key === "monthlyConsumption" ? "Monthly electricity usage" : "Monthly electricity bill"}
                      <div className="relative mt-2">
                        <input autoFocus type="number" min={currentQuestion.min} max={currentQuestion.max} step={currentQuestion.step} value={inputs[currentQuestion.key]} onChange={(e) => update(currentQuestion.key, e.target.value)} className="w-full rounded-2xl border border-slate-200 px-4 py-4 pr-28 text-xl font-bold text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100" />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">{currentQuestion.suffix}</span>
                      </div>
                    </label>
                    <p className="mt-3 text-xs leading-5 text-slate-400">{currentQuestion.helper}</p>
                  </div>
                )}
                {currentQuestion.type === "capacity" && (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {CAPACITY_OPTIONS.map((kw) => (
                      <button key={kw} type="button" aria-pressed={Number(inputs.systemCapacity) === kw} onClick={() => update("systemCapacity", kw)} className={`rounded-2xl border p-4 text-left transition ${Number(inputs.systemCapacity) === kw ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100" : "border-slate-200 hover:border-emerald-300 hover:bg-slate-50"}`}>
                        <span className="block text-xl font-extrabold text-slate-900">{kw} kW</span>
                        <span className="mt-1 block text-[11px] text-slate-500">Choose this system size</span>
                      </button>
                    ))}
                  </div>
                )}
                {currentQuestion.type === "panel" && (
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <button type="button" aria-pressed={inputs.panelType === "monofacial"} onClick={() => update("panelType", "monofacial")} className={`rounded-2xl border p-5 text-left transition ${inputs.panelType === "monofacial" ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100" : "border-slate-200 hover:border-emerald-300"}`}>
                        <Sun className="h-6 w-6 text-amber-500" />
                        <span className="mt-3 block font-extrabold text-slate-900">Monofacial (standard)</span>
                        <span className="mt-1 block text-xs leading-5 text-slate-500">Usually a practical choice for typical home rooftops where the panel back receives little reflected light.</span>
                      </button>
                      <button type="button" aria-pressed={inputs.panelType === "bifacial"} onClick={() => update("panelType", "bifacial")} className={`rounded-2xl border p-5 text-left transition ${inputs.panelType === "bifacial" ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100" : "border-slate-200 hover:border-emerald-300"}`}>
                        <Zap className="h-6 w-6 text-emerald-600" />
                        <span className="mt-3 block font-extrabold text-slate-900">Bifacial panels</span>
                        <span className="mt-1 block text-xs leading-5 text-slate-500">Can collect some reflected light from behind; most useful with suitable mounting height and a reflective surface.</span>
                      </button>
                    </div>
                    <button type="button" aria-expanded={showPanelGuide} onClick={() => setShowPanelGuide((open) => !open)} className="w-full rounded-xl border border-dashed border-emerald-300 bg-emerald-50/60 px-4 py-3 text-left text-sm font-bold text-emerald-800 transition hover:bg-emerald-50">
                      {showPanelGuide ? "Hide panel guide −" : "Help me choose / design it my way +"}
                      <span className="mt-1 block text-xs font-normal leading-5 text-emerald-700">Compare the options before deciding. The best choice depends on your roof, mounting and budget.</span>
                    </button>
                    {showPanelGuide && (
                      <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
                        <div>
                          <h3 className="text-sm font-extrabold text-slate-900">Choose monofacial when…</h3>
                          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5 text-slate-600">
                            <li>Panels sit close to a typical opaque rooftop.</li>
                            <li>There is little useful light reaching the back of the panels.</li>
                            <li>You want a straightforward, common rooftop option.</li>
                          </ul>
                        </div>
                        <div>
                          <h3 className="text-sm font-extrabold text-slate-900">Consider bifacial when…</h3>
                          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5 text-slate-600">
                            <li>The back of the panels can receive reflected sunlight.</li>
                            <li>Panels are raised or installed over a suitable reflective surface.</li>
                            <li>A supplier can confirm the real extra yield and cost for your site.</li>
                          </ul>
                        </div>
                        <p className="sm:col-span-2 text-[11px] leading-5 text-slate-500">SolarIQ+ does not know your exact roof reflectivity or mounting arrangement from these answers alone, so this guide explains trade-offs rather than declaring one panel type best for you.</p>
                      </div>
                    )}
                  </div>
                )}
                {currentQuestion.type === "battery" && (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <button type="button" aria-pressed={!compareBothBatteryOptions && Number(inputs.batterySize) === 0} onClick={() => { setCompareBothBatteryOptions(false); update("batterySize", 0); }} className={`rounded-2xl border p-5 text-left transition ${!compareBothBatteryOptions && Number(inputs.batterySize) === 0 ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100" : "border-slate-200 hover:border-emerald-300"}`}><Sun className="h-6 w-6 text-amber-500" /><span className="mt-3 block font-extrabold text-slate-900">Solar only</span><span className="mt-1 block text-xs leading-5 text-slate-500">Lower upfront cost; no battery backup.</span></button>
                    <button type="button" aria-pressed={!compareBothBatteryOptions && Number(inputs.batterySize) > 0} onClick={() => { setCompareBothBatteryOptions(false); update("batterySize", 5); }} className={`rounded-2xl border p-5 text-left transition ${!compareBothBatteryOptions && Number(inputs.batterySize) > 0 ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100" : "border-slate-200 hover:border-emerald-300"}`}><Battery className="h-6 w-6 text-emerald-600" /><span className="mt-3 block font-extrabold text-slate-900">Solar + battery</span><span className="mt-1 block text-xs leading-5 text-slate-500">Includes an estimated 5 kWh battery.</span></button>
                    <button type="button" aria-pressed={compareBothBatteryOptions} onClick={() => setCompareBothBatteryOptions(true)} className={`rounded-2xl border p-5 text-left transition ${compareBothBatteryOptions ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100" : "border-slate-200 hover:border-emerald-300"}`}><TrendingUp className="h-6 w-6 text-sky-600" /><span className="mt-3 block font-extrabold text-slate-900">Compare both</span><span className="mt-1 block text-xs leading-5 text-slate-500">See estimates with and without battery before deciding.</span></button>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-8 flex items-center justify-between border-t border-slate-100 pt-5">
              <span className="text-xs text-slate-400">Your answers can be changed later.</span>
              <button type="button" onClick={nextStep} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2">{wizardStep === wizardQuestions.length - 1 ? "Simulate results" : "Continue"} <span aria-hidden="true">→</span></button>
            </div>
          </section>
        )
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[330px_minmax(0,1fr)]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-4" style={{ animation: "solariqSlideIn 450ms ease-out both" }}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Calculator className="h-4 w-4" /></div>
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900">Your answers</h2>
                  <p className="text-[11px] text-slate-500">You can edit these and simulate again.</p>
                </div>
              </div>
              <button type="button" onClick={reset} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900">
                <RefreshCcw className="h-3.5 w-3.5" /> Reset
              </button>
            </div>

            <div className="mt-5 space-y-3">
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">Monthly electricity use</span>
                <div className="relative mt-1">
                  <input aria-label="Monthly electricity use in kWh" type="number" min="50" value={inputs.monthlyConsumption} onChange={(e) => update("monthlyConsumption", e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 pr-16 text-sm font-semibold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">kWh/mo</span>
                </div>
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">Monthly electricity bill</span>
                <div className="relative mt-1">
                  <input aria-label="Monthly electricity bill in rupees" type="number" min="100" value={inputs.monthlyBill} onChange={(e) => update("monthlyBill", e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 pr-12 text-sm font-semibold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">₹</span>
                </div>
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">Solar system size</span>
                <select aria-label="Solar system size" value={inputs.systemCapacity} onChange={(e) => update("systemCapacity", e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100">
                  {CAPACITY_OPTIONS.map((kw) => <option key={kw} value={kw}>{kw} kW{kw === suggestedCapacity ? " — suggested" : ""}</option>)}
                </select>
              </label>
              <div>
                <span className="text-xs font-semibold text-slate-600">Solar panel type</span>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  {["monofacial", "bifacial"].map((type) => (
                    <button key={type} type="button" aria-pressed={inputs.panelType === type} onClick={() => update("panelType", type)} className={`rounded-xl border px-3 py-2.5 text-left text-xs font-bold capitalize transition ${inputs.panelType === type ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>
                      {type === "monofacial" ? "Standard" : "Bifacial"}
                      <span className="mt-1 block text-[10px] font-normal text-slate-500">{type === "bifacial" ? "Can capture reflected light" : "Common rooftop option"}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="text-xs font-semibold text-slate-600">Battery backup</span>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <button type="button" aria-pressed={Number(inputs.batterySize) === 0} onClick={() => update("batterySize", 0)} className={`rounded-xl border px-3 py-2.5 text-xs font-bold transition ${Number(inputs.batterySize) === 0 ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>No battery</button>
                  <button type="button" aria-pressed={Number(inputs.batterySize) > 0} onClick={() => update("batterySize", Number(inputs.batterySize) > 0 ? inputs.batterySize : 5)} className={`rounded-xl border px-3 py-2.5 text-xs font-bold transition ${Number(inputs.batterySize) > 0 ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>Add 5 kWh battery</button>
                </div>
              </div>
            </div>
            <button type="button" onClick={() => { setSimulationStarted(false); setWizardStep(0); setWizardQuestionsStarted(false); }} className="mt-4 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50">Back to start</button>
          </section>

          <section className="min-w-0 space-y-5" style={{ animation: "solariqFadeIn 500ms ease-out both" }}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700"><Sun className="h-4 w-4" /> Simulation results</div>
                <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">Your solar outlook</h1>
                <p className="mt-1 text-sm leading-6 text-slate-500">A simple estimate based on the answers you provided.</p>
              </div>
              <button type="button" onClick={reset} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"><RefreshCcw className="h-4 w-4" /> Start again</button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <ResultCard icon={Sun} label="Annual generation" value={`${formatNumber(result.annualGeneration)} kWh`} sub={`${formatNumber(result.monthlyGeneration)} kWh/month · ${result.generationSource}`} featured />
              <ResultCard icon={CircleDollarSign} label="Estimated yearly savings" value={formatINR(result.annualSavings)} sub={`${formatNumber(annualBillSavingsPercent, 1)}% of your current annual bill`} />
              <ResultCard icon={Gauge} label="Payback period" value={Number.isFinite(result.paybackYears) ? `${formatNumber(result.paybackYears, 1)} years` : "—"} sub="Estimated time to recover solar cost" />
              <ResultCard icon={Leaf} label="CO₂ reduction" value={`${formatNumber(result.co2Reduction / 1000, 2)} tonnes`} sub="Estimated per year" />
            </div>

            {pvgisLoading && (
              <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                Calculating the PVGIS-assisted annual generation estimate… Your current engineering estimate remains visible until the response arrives.
              </div>
            )}
            {!pvgisLoading && pvgisGeneration && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                <strong>PVGIS-assisted estimate applied.</strong> Final annual generation combines the ML estimate (70%) and engineering estimate (30%). The model uses the nearest available historical location profile.
              </div>
            )}
            {!pvgisLoading && liveXgboostError && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                PVGIS estimate was unavailable, so the simulator is using its engineering calculation. Details: {liveXgboostError}
              </div>
            )}

            {compareBothBatteryOptions && (
              <section className="rounded-2xl border border-sky-200 bg-sky-50/60 p-5">
                <div className="flex items-start gap-3">
                  <TrendingUp className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" />
                  <div>
                    <h2 className="font-extrabold text-slate-900">Compare solar-only vs solar + battery</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-600">Both estimates use the same consumption, solar capacity and panel choice. The battery option assumes a 5 kWh battery. If solar already covers your annual electricity use, the battery may add backup capability without increasing bill savings; actual results depend on your site, load timing and utility rules.</p>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-white bg-white p-4">
                    <h3 className="text-sm font-extrabold text-slate-900">Solar only</h3>
                    <div className="mt-3 space-y-2 text-sm">
                      <div className="flex justify-between gap-3"><span className="text-slate-500">Annual savings</span><strong>{formatINR(batteryComparison.solarOnly.annualSavings)}</strong></div>
                      <div className="flex justify-between gap-3"><span className="text-slate-500">Payback</span><strong>{Number.isFinite(batteryComparison.solarOnly.paybackYears) ? `${formatNumber(batteryComparison.solarOnly.paybackYears, 1)} years` : "—"}</strong></div>
                      <div className="flex justify-between gap-3"><span className="text-slate-500">Investment</span><strong>{formatINR(inputs.installationCost)}</strong></div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-white bg-white p-4">
                    <h3 className="text-sm font-extrabold text-slate-900">Solar + 5 kWh battery</h3>
                    <div className="mt-3 space-y-2 text-sm">
                      <div className="flex justify-between gap-3"><span className="text-slate-500">Annual savings</span><strong>{formatINR(batteryComparison.withBattery.annualSavings)}</strong></div>
                      <div className="flex justify-between gap-3"><span className="text-slate-500">Payback</span><strong>{Number.isFinite(batteryComparison.withBattery.paybackWithBattery) ? `${formatNumber(batteryComparison.withBattery.paybackWithBattery, 1)} years` : "—"}</strong></div>
                      <div className="flex justify-between gap-3"><span className="text-slate-500">Investment</span><strong>{formatINR(batteryComparison.withBattery.totalInvestmentWithBattery)}</strong></div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  {Number(inputs.batterySize) > 0 ? "25-year net savings · solar + battery" : "25-year net savings · solar only"}
                </div>
                <div className="mt-2 text-2xl font-extrabold text-slate-950">
                  {formatINR(Number(inputs.batterySize) > 0 ? result.longTermSavingsWithBattery : result.longTermSavings)}
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {Number(inputs.batterySize) > 0 && result.longTermSavingsWithBattery <= 0
                    ? `At the current estimated battery price, the combined investment is not recovered within ${inputs.lifetime} years. The display is capped at ₹0; this does not mean the battery is free or profitable.`
                    : Number(inputs.batterySize) === 0 && result.longTermSavings <= 0
                      ? `The estimated bill savings do not recover the upfront solar investment within ${inputs.lifetime} years. Net savings are shown as ₹0 rather than as a misleading negative savings figure.`
                      : `Estimated lifetime bill savings minus the upfront investment over ${inputs.lifetime} years. This is a planning estimate, not a guaranteed return.`}
                </p>
                {Number(inputs.batterySize) > 0 && (
                  <div className="mt-4 rounded-xl bg-slate-50 p-3">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">For comparison · solar only</div>
                    <div className="mt-1 text-lg font-extrabold text-slate-900">{formatINR(batteryComparison.solarOnly.longTermSavings)}</div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">Estimated 25-year net savings without battery storage.</div>
                  </div>
                )}
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-800"><Lightbulb className="h-4 w-4" /> SolarIQ+ recommendation</div>
                <p className="mt-2 text-sm leading-6 text-emerald-950">{result.recommendation}</p>
              </div>
            </div>

            <details className="rounded-2xl border border-slate-200 bg-white p-5">
              <summary className="cursor-pointer list-none font-bold text-slate-800">Explore more details <span className="float-right text-emerald-700">+</span></summary>
              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <div>
                  <h3 className="mb-3 text-sm font-extrabold text-slate-900">Where your solar energy goes</h3>
                  <div className="space-y-4">
                    <FlowBar label="Solar → Home" value={result.energyFlow.solarToHome} total={result.annualGeneration} icon={Sun} />
                    <FlowBar label="Solar → Battery" value={result.energyFlow.solarToBattery} total={result.annualGeneration} icon={Battery} />
                    <FlowBar label="Solar → Grid" value={result.energyFlow.solarToGrid} total={result.annualGeneration} icon={TrendingUp} />
                    <FlowBar label="Battery → Home" value={result.energyFlow.batteryToHome} total={result.annualConsumption} icon={Wallet} />
                  </div>
                </div>
                <div>
                  <h3 className="mb-3 text-sm font-extrabold text-slate-900">Solar system comparison</h3>
                  <div className="space-y-3 rounded-xl bg-slate-50 p-4 text-sm">
                    <div className="flex justify-between gap-3"><span className="text-slate-500">Demand-matched capacity estimate</span><strong>{formatNumber(result.suitableCapacity.low, 1)}–{formatNumber(result.suitableCapacity.high, 1)} kW</strong></div>
                    <div className="flex justify-between gap-3"><span className="text-slate-500">Solar share of usage</span><strong>{formatNumber(result.solarShare, 1)}%</strong></div>
                    <div className="flex justify-between gap-3"><span className="text-slate-500">Estimated total investment</span><strong>{formatINR(Number(inputs.batterySize) > 0 ? result.totalInvestmentWithBattery : inputs.installationCost)}</strong></div>
                    <div className="flex justify-between gap-3"><span className="text-slate-500">Battery option</span><strong>{Number(inputs.batterySize) > 0 ? `${formatNumber(inputs.batterySize)} kWh` : "Not selected"}</strong></div>
                  </div>
                </div>
              </div>
              <div className="mt-5">
                <h3 className="mb-1 text-sm font-extrabold text-slate-900">Year-by-year projection</h3>
                <p className="mb-3 text-[11px] leading-5 text-slate-500">
                  Generation decreases by the modelled degradation rate. Savings can remain flat when the estimate is capped at your entered electricity bill.
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {result.yearlyProjection.filter((row) => row.year === 1 || row.year % 5 === 0 || row.year === result.input.lifetime).map((row) => (
                    <div key={row.year} className="rounded-xl bg-slate-50 p-3">
                      <div className="text-[10px] font-bold uppercase text-slate-400">Year {row.year}</div>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <span className="text-xs text-slate-500">Generation</span>
                        <strong className="text-xs text-slate-800">{formatNumber(row.generation)} kWh</strong>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-3">
                        <span className="text-xs text-slate-500">Estimated bill savings</span>
                        <strong className="text-xs text-slate-800">{formatINR(row.savings)}</strong>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-3">
                        <span className="text-xs text-slate-500">Cumulative savings</span>
                        <strong className="text-xs text-emerald-800">{formatINR(row.cumulativeSavings)}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <p className="mt-4 text-[11px] leading-5 text-slate-400">Estimates use planning assumptions for sunlight, system performance, degradation and grid export. Actual generation, savings and payback depend on site conditions, utility rules and installer pricing.</p>
            </details>

          </section>
        </div>
      )}
    </div>
  );
}

/*
 * Small local icon component used for the
 * planner panel-brand badge.
 */
function PanelIcon() {
  return (
    <span className="inline-flex h-3 w-3 items-center justify-center rounded-sm border border-blue-500">
      <span className="h-1.5 w-1.5 rounded-sm bg-blue-500" />
    </span>
  );
}