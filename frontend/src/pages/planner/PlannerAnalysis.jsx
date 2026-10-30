import { useQuery } from "@tanstack/react-query";
import { Panel, PanelHeader, DataTag } from "@/components/common/Primitives";
import { StepFooter, NoActiveProject } from "./PlannerLayout";
import { useProjectContext } from "@/context/ProjectContext";
import { api } from "@/lib/api";
import {
  FileText,
  ScanEye,
  Sun,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

function formatMoney(value) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "—";
  }

  return `₹${number.toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  })}`;
}

function formatNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "—";
  }

  return number.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  });
}

function formatDate(value) {
  if (!value) {
    return "—";
  }

  const text = String(value).trim();

  // Keep already formatted DD/MM/YYYY values unchanged.
  // This avoids JavaScript timezone/date parsing problems.
  const slashMatch = text.match(
    /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/
  );

  if (slashMatch) {
    const day = slashMatch[1].padStart(2, "0");
    const month = slashMatch[2].padStart(2, "0");
    const year = slashMatch[3];

    return `${day}/${month}/${year}`;
  }

  // Handle ISO dates without shifting the day because of timezone conversion.
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  }

  return text;
}

function getBillFields(bill) {
  if (!bill) {
    return {};
  }

  /*
   * The backend may return the extracted fields directly,
   * inside "fields", or inside "extracted_fields".
   *
   * Keep all three supported so the Analysis page remains
   * compatible with the current Bill/OCR implementation.
   */
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

function getFirstValue(...values) {
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

function getNumericValue(...values) {
  const value = getFirstValue(...values);

  if (value === null) {
    return null;
  }

  const cleaned = String(value)
    .replace(/₹/g, "")
    .replace(/,/g, "")
    .replace(/\s/g, "")
    .replace(/[^\d.-]/g, "");

  const number = Number(cleaned);

  return Number.isFinite(number) ? number : null;
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
            {status === "available" ? "Available" : "Not detected"}
          </span>
        )}
      </div>

      <div className="mt-1 text-sm font-semibold text-navy-dark break-words">
        {value}
      </div>
    </div>
  );
}

export default function PlannerAnalysis() {
  const { activeProject, activeProjectId } = useProjectContext();

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

  if (!activeProjectId || !activeProject) {
    return (
      <div className="space-y-4">
        <Panel>
          <PanelHeader
            title="Consolidated Analysis"
            hint="Real project and bill inputs"
          />

          <div className="p-5">
            <NoActiveProject />
          </div>
        </Panel>

        <StepFooter
          backTo="/planner/rooftop"
          nextTo="/planner/recommendation"
        />
      </div>
    );
  }

  const fields = getBillFields(bill);

  /*
   * Support the field names currently produced by the OCR/parser
   * as well as older backend field names.
   */

  const consumerNumber = getFirstValue(
    fields.consumer_number,
    fields.consumerNumber,
    fields.consumer_no,
    fields.consumerNo
  );

  const billNumber = getFirstValue(
    fields.bill_number,
    fields.billNumber,
    fields.bill_no,
    fields.billNo
  );

  const customerName = getFirstValue(
    fields.customer_name,
    fields.customerName,
    fields.name,
    activeProject.name
  );

  const billAmount = getNumericValue(
    fields.bill_amount,
    fields.current_bill_amount,
    fields.total_bill_amount,
    fields.net_bill_amount,
    fields.billAmount
  );

  const sanctionedLoad = getNumericValue(
    fields.sanctioned_load_kw,
    fields.sanctioned_load,
    fields.load_kw,
    fields.sanctionedLoadKw
  );

  const monthlyUnits = getNumericValue(
    fields.monthly_consumption_kwh,
    fields.monthly_units,
    fields.consumption_kwh,
    fields.units_consumed,
    fields.monthly_consumption,
    fields.consumption,
    fields.units
  );

  const billDate = getFirstValue(
    fields.bill_date,
    fields.billDate
  );

  const dueDate = getFirstValue(
    fields.due_date,
    fields.dueDate
  );

  const meterStatus = getFirstValue(
    fields.meter_status,
    fields.meterStatus
  );

  const consumerType = getFirstValue(
    fields.consumer_type,
    fields.consumerType,
    fields.category,
    activeProject.consumer_type
  );

  const supplyType = getFirstValue(
    fields.supply_at,
    fields.supply_type,
    fields.supplyType
  );

  const tariff = getFirstValue(
    fields.tariff,
    fields.tariff_code,
    fields.tariffCode
  );

  const connectedLoad = getNumericValue(
    fields.connected_load_kw,
    fields.connected_load,
    fields.connectedLoadKw
  );

  const contractDemand = getNumericValue(
    fields.contract_demand_kva,
    fields.contract_demand,
    fields.contractDemandKva
  );

  const hasConsumption =
    monthlyUnits !== null && monthlyUnits > 0;

  const annualConsumption = hasConsumption
    ? monthlyUnits * 12
    : null;

  /*
   * This is deliberately labelled as a preliminary engineering estimate.
   * It is NOT presented as an ML prediction.
   */
  const estimatedSolarCapacity =
    annualConsumption !== null
      ? annualConsumption / 1400
      : null;

  return (
    <div className="space-y-4">
      {/* ---------------------------------------------------------
          CONSOLIDATED ANALYSIS
      --------------------------------------------------------- */}

      <Panel>
        <PanelHeader
          title="Consolidated Analysis"
          hint="Real project and bill inputs"
          right={<DataTag variant="live" />}
        />

        <div className="p-5 grid sm:grid-cols-3 gap-3">

          {/* BILL ANALYSIS */}

          <div className="rounded-md border border-slate-200 p-4">
            <div className="flex items-center gap-2 text-slate-400">
              <FileText className="h-4 w-4" />

              <span className="text-[10px] font-semibold uppercase tracking-wide">
                Bill analysis
              </span>
            </div>

            <div className="mt-2 text-lg font-bold text-navy-dark font-display">
              {billLoading
                ? "Loading…"
                : hasConsumption
                ? `${formatNumber(monthlyUnits)} kWh / month`
                : "Consumption not detected"}
            </div>

            <div className="text-xs mt-1 flex items-center gap-1">
              {hasConsumption ? (
                <>
                  <CheckCircle2 className="h-3 w-3 text-emerald-600" />

                  <span className="text-emerald-600">
                    Extracted from bill
                  </span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-3 w-3 text-amber-600" />

                  <span className="text-amber-600">
                    No reliable value available
                  </span>
                </>
              )}
            </div>
          </div>

          {/* ROOFTOP */}

          <div className="rounded-md border border-slate-200 p-4">
            <div className="flex items-center gap-2 text-slate-400">
              <ScanEye className="h-4 w-4" />

              <span className="text-[10px] font-semibold uppercase tracking-wide">
                Rooftop classification
              </span>
            </div>

            <div className="mt-2 text-lg font-bold text-navy-dark font-display">
              Rooftop analysis
            </div>

            <div className="text-xs text-slate-500 mt-1">
              Rooftop assessment is handled separately
            </div>
          </div>

          {/* SOLAR CAPACITY */}

          <div className="rounded-md border border-slate-200 p-4">
            <div className="flex items-center gap-2 text-slate-400">
              <Sun className="h-4 w-4" />

              <span className="text-[10px] font-semibold uppercase tracking-wide">
                Preliminary capacity
              </span>
            </div>

            <div className="mt-2 text-lg font-bold text-navy-dark font-display">
              {estimatedSolarCapacity !== null
                ? `${estimatedSolarCapacity.toFixed(1)} kW`
                : "Pending consumption"}
            </div>

            <div className="text-xs text-slate-500 mt-1">
              Based on 1,400 kWh/kWp/year
            </div>
          </div>
        </div>
      </Panel>

      {/* ---------------------------------------------------------
          BILL DATA
      --------------------------------------------------------- */}

      <Panel>
        <PanelHeader
          title="Bill Data"
          hint="Values extracted from the uploaded electricity bill"
        />

        <div className="p-6">
          {billLoading ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
              Loading extracted bill data…
            </div>
          ) : billError ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center gap-2 text-amber-800 font-medium">
                <AlertTriangle className="h-4 w-4" />

                Bill data is not available yet.
              </div>

              <p className="text-sm text-amber-700 mt-1">
                Upload and process the electricity bill in the Bill
                step before using these values.
              </p>
            </div>
          ) : !bill ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
              No bill has been processed for this project yet.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">

              <DataItem
                label="Consumer number"
                value={consumerNumber || "Not detected"}
                status={consumerNumber ? "available" : "missing"}
              />

              <DataItem
                label="Bill number"
                value={billNumber || "Not detected"}
                status={billNumber ? "available" : "missing"}
              />

              <DataItem
                label="Customer name"
                value={customerName || "Not detected"}
                status={customerName ? "available" : "missing"}
              />

              <DataItem
                label="Bill amount"
                value={formatMoney(billAmount)}
                status={
                  billAmount !== null ? "available" : "missing"
                }
              />

              <DataItem
                label="Sanctioned load"
                value={
                  sanctionedLoad !== null
                    ? `${formatNumber(sanctionedLoad)} kW`
                    : "Not detected"
                }
                status={
                  sanctionedLoad !== null ? "available" : "missing"
                }
              />

              <DataItem
                label="Consumer type"
                value={consumerType || "Not detected"}
                status={consumerType ? "available" : "missing"}
              />

              <DataItem
                label="Bill date"
                value={formatDate(billDate)}
                status={billDate ? "available" : "missing"}
              />

              <DataItem
                label="Due date"
                value={formatDate(dueDate)}
                status={dueDate ? "available" : "missing"}
              />

              <DataItem
                label="Monthly consumption"
                value={
                  hasConsumption
                    ? `${formatNumber(monthlyUnits)} kWh`
                    : "Not detected"
                }
                status={
                  hasConsumption ? "available" : "missing"
                }
              />

              <DataItem
                label="Meter status"
                value={meterStatus || "Not detected"}
                status={
                  meterStatus ? "available" : "missing"
                }
              />

              <DataItem
                label="Supply type"
                value={supplyType || "Not detected"}
                status={
                  supplyType ? "available" : "missing"
                }
              />

              <DataItem
                label="Tariff"
                value={tariff || "Not detected"}
                status={
                  tariff ? "available" : "missing"
                }
              />

              <DataItem
                label="Connected load"
                value={
                  connectedLoad !== null
                    ? `${formatNumber(connectedLoad)} kW`
                    : "Not detected"
                }
                status={
                  connectedLoad !== null
                    ? "available"
                    : "missing"
                }
              />

              <DataItem
                label="Contract demand"
                value={
                  contractDemand !== null
                    ? `${formatNumber(contractDemand)} kVA`
                    : "Not detected"
                }
                status={
                  contractDemand !== null
                    ? "available"
                    : "missing"
                }
              />
            </div>
          )}
        </div>
      </Panel>

      {/* ---------------------------------------------------------
          ENGINEERING ASSESSMENT
      --------------------------------------------------------- */}

      <Panel>
        <PanelHeader
          title="Engineering Assessment"
          hint="Preliminary assessment from available bill inputs"
        />

        <div className="p-6">

          <div className="rounded-md border border-slate-200 bg-slate-50 p-4 mb-5">
            <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-400">
              Active project
            </div>

            <div className="mt-1 text-base font-bold text-navy-dark">
              {activeProject.name}
            </div>

            {activeProject.location && (
              <div className="text-xs text-slate-500 mt-1">
                {activeProject.location}
              </div>
            )}
          </div>

          <p className="text-slate-700 leading-relaxed max-w-4xl">
            The engineering analysis uses the electricity bill
            information extracted from the uploaded document.

            {billAmount !== null && (
              <>
                {" "}The detected bill amount is{" "}
                <span className="font-mono text-navy-dark font-semibold">
                  {formatMoney(billAmount)}
                </span>
                .
              </>
            )}

            {sanctionedLoad !== null && (
              <>
                {" "}The sanctioned electrical load is{" "}
                <span className="font-mono text-navy-dark font-semibold">
                  {formatNumber(sanctionedLoad)} kW
                </span>
                .
              </>
            )}

            {consumerType && (
              <>
                {" "}The consumer category identified from the
                bill is{" "}
                <span className="font-mono text-navy-dark font-semibold">
                  {consumerType}
                </span>
                .
              </>
            )}

            {hasConsumption ? (
              <>
                {" "}The detected monthly electricity consumption
                is{" "}
                <span className="font-mono text-navy-dark font-semibold">
                  {formatNumber(monthlyUnits)} kWh
                </span>
                , giving an estimated annual consumption of{" "}
                <span className="font-mono text-navy-dark font-semibold">
                  {formatNumber(annualConsumption)} kWh
                </span>
                .
              </>
            ) : (
              <>
                {" "}A reliable current monthly consumption value
                was not detected from this bill, so the system does
                not present a fabricated consumption figure.
              </>
            )}
          </p>

          {/* REAL INPUT TAGS */}

          <div className="mt-5 flex flex-wrap gap-2">

            {consumerType && (
              <span className="px-2.5 py-1 text-xs font-mono border border-slate-200 bg-slate-50 text-slate-600 rounded">
                {consumerType}
              </span>
            )}

            {sanctionedLoad !== null && (
              <span className="px-2.5 py-1 text-xs font-mono border border-slate-200 bg-slate-50 text-slate-600 rounded">
                {formatNumber(sanctionedLoad)} kW sanctioned load
              </span>
            )}

            {supplyType && (
              <span className="px-2.5 py-1 text-xs font-mono border border-slate-200 bg-slate-50 text-slate-600 rounded">
                Supply: {supplyType}
              </span>
            )}

            {tariff && (
              <span className="px-2.5 py-1 text-xs font-mono border border-slate-200 bg-slate-50 text-slate-600 rounded">
                Tariff: {tariff}
              </span>
            )}

            <span className="px-2.5 py-1 text-xs font-mono border border-emerald-200 bg-emerald-50 text-emerald-700 rounded">
              Real bill input
            </span>
          </div>

          {/* CAPACITY RESULT */}

          <div className="mt-6 rounded-md border border-slate-200 p-5">
            <div className="flex items-center gap-2">
              <Sun className="h-4 w-4 text-amber-500" />

              <div className="text-sm font-semibold text-navy-dark">
                Preliminary Solar Capacity
              </div>
            </div>

            {estimatedSolarCapacity !== null ? (
              <div className="mt-3">
                <div className="text-2xl font-bold text-navy-dark font-display">
                  {estimatedSolarCapacity.toFixed(1)} kW
                </div>

                <p className="text-xs text-slate-500 mt-1">
                  Estimated from annual electricity consumption
                  using 1,400 kWh of annual generation per kWp.
                </p>
              </div>
            ) : (
              <div className="mt-3">
                <div className="text-base font-semibold text-slate-600">
                  Cannot calculate yet
                </div>

                <p className="text-xs text-slate-500 mt-1">
                  A reliable monthly consumption value is required
                  before making a consumption-based capacity
                  estimate.
                </p>
              </div>
            )}
          </div>

          <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />

              <p className="text-xs text-amber-800 leading-relaxed">
                This page currently provides a preliminary
                engineering calculation from the extracted
                electricity bill. It is not presented as a
                machine-learning prediction. Rooftop suitability,
                solar generation prediction, financial analysis,
                and final recommendations are handled in their
                respective planner stages.
              </p>
            </div>
          </div>
        </div>
      </Panel>

      <StepFooter
        backTo="/planner/rooftop"
        nextTo="/planner/recommendation"
      />
    </div>
  );
}