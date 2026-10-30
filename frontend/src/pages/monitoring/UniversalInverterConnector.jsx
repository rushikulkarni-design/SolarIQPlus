import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowLeft,
  Cable,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Cpu,
  EthernetPort,
  Gauge,
  Info,
  Loader2,
  Network,
  PlugZap,
  Radio,
  RefreshCw,
  Search,
  Server,
  Settings2,
  ShieldCheck,
  Signal,
  Terminal,
  Wifi,
  XCircle,
  Zap,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useProjectContext } from "@/context/ProjectContext";

const MONITORING_SERVER_URL =
  process.env.REACT_APP_MONITORING_URL ||
  "http://127.0.0.1:8001";

const UNIVERSAL_BASE =
  `${MONITORING_SERVER_URL}/api/monitoring/universal-sunspec`;

const DEFAULT_FORM = {
  mode: "tcp",
  host: "",
  tcp_port: "502",
  serial_port: "",
  baudrate: "9600",
  parity: "N",
  device_address: "1",
  timeout: "3",
};

const MODE_OPTIONS = [
  {
    id: "tcp",
    title: "Modbus TCP",
    description:
      "Connect through the inverter, logger or gateway IP address.",
    icon: EthernetPort,
    badge: "LAN / Wi-Fi",
  },
  {
    id: "rtu",
    title: "Modbus RTU / RS485",
    description:
      "Connect directly through a USB-to-RS485 or RS485 gateway.",
    icon: Cable,
    badge: "RS485",
  },
];

function createConnectionId() {
  try {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      return crypto.randomUUID();
    }
  } catch {
    // Ignore and use fallback.
  }

  return `siq-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function numberOrNull(value) {
  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function formatNumber(value, digits = 2) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "—";
  }

  return number.toFixed(digits);
}

function formatTimestamp(value) {
  if (!value) {
    return "—";
  }

  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function firstDefined(...values) {
  for (const value of values) {
    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      return value;
    }
  }

  return null;
}

function extractErrorMessage(data, fallback) {
  if (!data) {
    return fallback;
  }

  if (typeof data === "string") {
    return data;
  }

  if (typeof data.detail === "string") {
    return data.detail;
  }

  if (typeof data.message === "string") {
    return data.message;
  }

  if (typeof data.error === "string") {
    return data.error;
  }

  if (
    data.error &&
    typeof data.error.message === "string"
  ) {
    return data.error.message;
  }

  return fallback;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body
        ? {
            "Content-Type": "application/json",
          }
        : {}),
      ...(options.headers || {}),
    },
  });

  const contentType =
    response.headers.get("content-type") || "";

  let data = null;

  if (contentType.includes("application/json")) {
    data = await response.json().catch(() => null);
  } else {
    const text = await response.text().catch(() => "");
    data = text || null;
  }

  if (!response.ok) {
    throw new Error(
      extractErrorMessage(
        data,
        `Request failed with HTTP ${response.status}.`
      )
    );
  }

  return data;
}

function StatusPill({ status }) {
  const normalized = String(status || "")
    .toLowerCase()
    .replace(/[\s_-]+/g, "");

  const connected =
    normalized.includes("connected") ||
    normalized.includes("available") ||
    normalized.includes("online") ||
    normalized.includes("healthy");

  const failed =
    normalized.includes("error") ||
    normalized.includes("failed") ||
    normalized.includes("offline") ||
    normalized.includes("unavailable");

  if (connected) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Connected
      </span>
    );
  }

  if (failed) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        Connection error
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-600">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
      {status || "Ready"}
    </span>
  );
}

function SectionTitle({
  icon: Icon,
  eyebrow,
  title,
  description,
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-600">
        <Icon className="h-4 w-4" />
      </div>

      <div className="min-w-0">
        {eyebrow && (
          <div className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-blue-600">
            {eyebrow}
          </div>
        )}

        <h2 className="mt-0.5 text-base font-extrabold text-slate-900">
          {title}
        </h2>

        {description && (
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  disabled = false,
  hint,
  className = "",
}) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-xs font-bold text-slate-700">
        {label}
      </label>

      <input
        type={type}
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-50 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
      />

      {hint && (
        <div className="mt-1.5 text-[11px] text-slate-400">
          {hint}
        </div>
      )}
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  disabled = false,
  hint,
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-bold text-slate-700">
        {label}
      </label>

      <select
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        disabled={disabled}
        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50 disabled:cursor-not-allowed disabled:bg-slate-50"
      >
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
          >
            {option.label}
          </option>
        ))}
      </select>

      {hint && (
        <div className="mt-1.5 text-[11px] text-slate-400">
          {hint}
        </div>
      )}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  unit,
  subtext,
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <Icon className="h-4 w-4" />
        </div>

        {unit && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {unit}
          </span>
        )}
      </div>

      <div className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900">
        {value}
      </div>

      <div className="mt-0.5 text-xs font-bold text-slate-600">
        {label}
      </div>

      {subtext && (
        <div className="mt-1 text-[10px] text-slate-400">
          {subtext}
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 py-2.5 last:border-b-0">
      <span className="text-xs font-medium text-slate-500">
        {label}
      </span>

      <span className="max-w-[60%] truncate text-right text-xs font-bold text-slate-800">
        {value || "—"}
      </span>
    </div>
  );
}

function EmptyResult() {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm">
        <Search className="h-5 w-5" />
      </div>

      <div className="mt-3 text-sm font-extrabold text-slate-700">
        No inverter discovered yet
      </div>

      <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500">
        Enter the connection details and start automatic
        SunSpec discovery. SolarIQ+ will identify the
        device when a compatible inverter or gateway
        responds.
      </p>
    </div>
  );
}

function ConnectionTypeCard({
  option,
  selected,
  onClick,
  disabled,
}) {
  const Icon = option.icon;

  return (
    <button
      type="button"
      onClick={() => onClick(option.id)}
      disabled={disabled}
      className={`group relative w-full rounded-2xl border p-4 text-left transition ${
        selected
          ? "border-blue-400 bg-blue-50/70 shadow-sm ring-2 ring-blue-100"
          : "border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50"
      } disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {selected && (
        <div className="absolute right-3 top-3">
          <CheckCircle2 className="h-5 w-5 text-blue-600" />
        </div>
      )}

      <div
        className={`flex h-10 w-10 items-center justify-center rounded-xl ${
          selected
            ? "bg-blue-600 text-white"
            : "bg-slate-100 text-slate-600 group-hover:bg-blue-50 group-hover:text-blue-600"
        }`}
      >
        <Icon className="h-5 w-5" />
      </div>

      <div className="mt-3 pr-5">
        <div className="text-sm font-extrabold text-slate-900">
          {option.title}
        </div>

        <div className="mt-1 text-xs leading-5 text-slate-500">
          {option.description}
        </div>
      </div>

      <div className="mt-3">
        <span
          className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold ${
            selected
              ? "bg-blue-100 text-blue-700"
              : "bg-slate-100 text-slate-500"
          }`}
        >
          {option.badge}
        </span>
      </div>
    </button>
  );
}

export default function UniversalInverterConnector() {
  const navigate = useNavigate();

  const { activeProject, activeProjectId } =
    useProjectContext();

  const [form, setForm] = useState(DEFAULT_FORM);

  const [connectionId, setConnectionId] =
    useState("");

  const [backendStatus, setBackendStatus] =
    useState("checking");

  const [connecting, setConnecting] =
    useState(false);

  const [refreshing, setRefreshing] =
    useState(false);

  const [connectionState, setConnectionState] =
    useState("ready");

  const [error, setError] = useState("");

  const [connectionResponse, setConnectionResponse] =
    useState(null);

  const [discovery, setDiscovery] =
    useState(null);

  const [device, setDevice] =
    useState(null);

  const [realtime, setRealtime] =
    useState(null);

  const [lastUpdated, setLastUpdated] =
    useState(null);

  const projectId =
    activeProjectId ||
    activeProject?.id ||
    "unassigned-project";

  const selectedMode = useMemo(
    () =>
      MODE_OPTIONS.find(
        (option) => option.id === form.mode
      ) || MODE_OPTIONS[0],
    [form.mode]
  );

  const latestReading =
    realtime?.readings?.[0] ||
    realtime?.reading ||
    realtime?.data?.readings?.[0] ||
    null;

  const deviceData =
    device?.device ||
    device?.data?.device ||
    device?.result?.device ||
    device ||
    null;

  const discoveryModels =
    discovery?.models ||
    discovery?.data?.models ||
    discovery?.result?.models ||
    [];

  const modelCount = Array.isArray(
    discoveryModels
  )
    ? discoveryModels.length
    : Number(
        discovery?.count ||
          discovery?.data?.count ||
          0
      );

  const currentPower = firstDefined(
    latestReading?.current_power_kw,
    latestReading?.power_kw,
    latestReading?.realtime?.current_power_kw,
    latestReading?.realtime?.power_kw
  );

  const todayEnergy = firstDefined(
    latestReading?.energy?.today_kwh,
    latestReading?.energy_kwh,
    latestReading?.today_kwh
  );

  const totalEnergy = firstDefined(
    latestReading?.energy?.total_kwh,
    latestReading?.total_kwh
  );

  const pvVoltage = firstDefined(
    latestReading?.pv_voltage_v,
    latestReading?.realtime?.pv_voltage_v
  );

  const pvCurrent = firstDefined(
    latestReading?.pv_current_a,
    latestReading?.realtime?.pv_current_a
  );

  const gridFrequency = firstDefined(
    latestReading?.grid_frequency_hz,
    latestReading?.realtime?.grid_frequency_hz
  );

  const inverterStatus = firstDefined(
    latestReading?.inverter_status,
    latestReading?.status?.state,
    latestReading?.realtime?.status?.state,
    deviceData?.status
  );

  const isConnected =
    connectionState === "connected";

  const updateField = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  useEffect(() => {
    let cancelled = false;

    async function checkBackend() {
      try {
        const response = await requestJson(
          `${UNIVERSAL_BASE}/health`
        );

        if (!cancelled) {
          setBackendStatus(
            response?.status === "available"
              ? "available"
              : "ready"
          );
        }
      } catch {
        if (!cancelled) {
          setBackendStatus("unavailable");
        }
      }
    }

    checkBackend();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      // Connection lifecycle is managed by the
      // backend gateway. No credentials are stored
      // in the browser.
    };
  }, []);

  const validateForm = () => {
    if (form.mode === "tcp") {
      if (!form.host.trim()) {
        return "Enter the inverter or gateway IP address.";
      }

      const port = numberOrNull(form.tcp_port);

      if (
        port === null ||
        port < 1 ||
        port > 65535
      ) {
        return "Enter a valid Modbus TCP port.";
      }
    }

    if (form.mode === "rtu") {
      if (!form.serial_port.trim()) {
        return "Enter the RS485 serial port, for example COM3.";
      }

      const baudrate = numberOrNull(
        form.baudrate
      );

      if (
        baudrate === null ||
        baudrate <= 0
      ) {
        return "Enter a valid baud rate.";
      }
    }

    const address = numberOrNull(
      form.device_address
    );

    if (
      address === null ||
      address < 1 ||
      address > 247
    ) {
      return "Unit ID must be between 1 and 247.";
    }

    const timeout = numberOrNull(
      form.timeout
    );

    if (
      timeout === null ||
      timeout <= 0
    ) {
      return "Timeout must be greater than zero.";
    }

    return null;
  };

  const buildRequestBody = () => {
    const body = {
      mode: form.mode,
      device_address:
        numberOrNull(form.device_address) || 1,
      timeout:
        numberOrNull(form.timeout) || 3,
    };

    if (form.mode === "tcp") {
      body.host = form.host.trim();
      body.tcp_port =
        numberOrNull(form.tcp_port) || 502;
    } else {
      body.serial_port =
        form.serial_port.trim();

      body.baudrate =
        numberOrNull(form.baudrate) || 9600;

      body.parity = form.parity;
    }

    return body;
  };

  const runDiscovery = async (
    currentConnectionId
  ) => {
    const discoveryResponse =
      await requestJson(
        `${UNIVERSAL_BASE}/${encodeURIComponent(
          currentConnectionId
        )}/discovery`
      );

    setDiscovery(discoveryResponse);

    let discoveredDevice = null;

    try {
      discoveredDevice =
        await requestJson(
          `${UNIVERSAL_BASE}/${encodeURIComponent(
            currentConnectionId
          )}/device`
        );

      setDevice(discoveredDevice);
    } catch {
      // Device endpoint is supplementary.
      // Discovery itself can still be valid.
      setDevice(null);
    }

    try {
      const realtimeResponse =
        await requestJson(
          `${UNIVERSAL_BASE}/${encodeURIComponent(
            currentConnectionId
          )}/realtime`
        );

      setRealtime(realtimeResponse);
    } catch {
      // Realtime is supplementary to discovery.
      setRealtime(null);
    }

    setLastUpdated(new Date());

    return {
      discovery: discoveryResponse,
      device: discoveredDevice,
    };
  };

  const connectAndDiscover = async () => {
    setError("");

    const validationError =
      validateForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    const newConnectionId =
      createConnectionId();

    setConnectionId(newConnectionId);

    setConnecting(true);
    setConnectionState("connecting");

    setConnectionResponse(null);
    setDiscovery(null);
    setDevice(null);
    setRealtime(null);
    setLastUpdated(null);

    try {
      const body = buildRequestBody();

      const response =
        await requestJson(
          `${UNIVERSAL_BASE}/connect?connection_id=${encodeURIComponent(
            newConnectionId
          )}`,
          {
            method: "POST",
            body: JSON.stringify(body),
          }
        );

      setConnectionResponse(response);

      await runDiscovery(
        newConnectionId
      );

      setConnectionState("connected");
    } catch (requestError) {
      setConnectionState("error");

      setError(
        requestError?.message ||
          "Could not connect to the inverter."
      );
    } finally {
      setConnecting(false);
    }
  };

  const refreshTelemetry = async () => {
    if (!connectionId) {
      return;
    }

    setError("");
    setRefreshing(true);

    try {
      await runDiscovery(connectionId);
      setConnectionState("connected");
    } catch (requestError) {
      setError(
        requestError?.message ||
          "Could not refresh inverter telemetry."
      );
    } finally {
      setRefreshing(false);
    }
  };

  const disconnect = async () => {
    if (!connectionId) {
      return;
    }

    setRefreshing(true);
    setError("");

    try {
      await requestJson(
        `${UNIVERSAL_BASE}/${encodeURIComponent(
          connectionId
        )}`,
        {
          method: "DELETE",
        }
      );
    } catch {
      // Even if backend cleanup fails, clear the
      // browser-side connection state.
    } finally {
      setConnectionId("");
      setConnectionResponse(null);
      setDiscovery(null);
      setDevice(null);
      setRealtime(null);
      setLastUpdated(null);
      setConnectionState("ready");
      setRefreshing(false);
    }
  };

  const hasDiscovery =
    Boolean(discovery) ||
    Boolean(deviceData);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* =========================================================
            PAGE HEADER
        ========================================================= */}

        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={() =>
                navigate("/monitoring")
              }
              className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
              title="Back to monitoring"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>

            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-blue-700">
                  <Radio className="h-3 w-3" />
                  Universal Connector
                </span>

                <StatusPill
                  status={
                    backendStatus ===
                    "unavailable"
                      ? "unavailable"
                      : isConnected
                      ? "connected"
                      : "ready"
                  }
                />
              </div>

              <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900">
                Connect Your Inverter
              </h1>

              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                Connect a compatible inverter or
                monitoring gateway directly to
                SolarIQ+ using standardized
                SunSpec Modbus communication.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-blue-600" />

              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Active Project
                </div>

                <div className="mt-0.5 max-w-[220px] truncate text-xs font-extrabold text-slate-800">
                  {activeProject?.name ||
                    activeProject?.project_name ||
                    projectId}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* =========================================================
            UNIVERSAL ARCHITECTURE BANNER
        ========================================================= */}

        <div className="mb-6 overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 via-white to-slate-50">
          <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
                <Network className="h-5 w-5" />
              </div>

              <div>
                <div className="text-sm font-extrabold text-slate-900">
                  Provider-agnostic inverter
                  integration
                </div>

                <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
                  SolarIQ+ first attempts standardized
                  SunSpec discovery. When a device does
                  not expose SunSpec, a manufacturer-specific
                  adapter or supported cloud integration can
                  be used instead.
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />

              <span className="text-[11px] font-bold text-emerald-700">
                No credentials stored in browser
              </span>
            </div>
          </div>
        </div>

        {/* =========================================================
            MAIN GRID
        ========================================================= */}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          {/* =======================================================
              LEFT — CONNECTION CONFIGURATION
          ======================================================= */}

          <div className="space-y-6">
            {/* Connection method */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <SectionTitle
                icon={PlugZap}
                eyebrow="Step 01"
                title="Choose connection method"
                description="Select how SolarIQ+ should communicate with the inverter or monitoring gateway."
              />

              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {MODE_OPTIONS.map(
                  (option) => (
                    <ConnectionTypeCard
                      key={option.id}
                      option={option}
                      selected={
                        form.mode ===
                        option.id
                      }
                      disabled={connecting}
                      onClick={(mode) =>
                        updateField(
                          "mode",
                          mode
                        )
                      }
                    />
                  )
                )}
              </div>
            </section>

            {/* Connection details */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <SectionTitle
                icon={Settings2}
                eyebrow="Step 02"
                title="Connection details"
                description={
                  form.mode === "tcp"
                    ? "Enter the local IP address and Modbus TCP settings exposed by the inverter or gateway."
                    : "Enter the serial interface and RS485 communication settings used by the inverter."
                }
              />

              <div className="mt-5 space-y-4">
                {form.mode === "tcp" ? (
                  <>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_150px]">
                      <Field
                        label="Inverter / Gateway IP address"
                        value={form.host}
                        onChange={(value) =>
                          updateField(
                            "host",
                            value
                          )
                        }
                        placeholder="192.168.1.100"
                        disabled={connecting}
                        hint="Use the local IP address reachable from the SolarIQ+ backend."
                      />

                      <Field
                        label="Modbus TCP port"
                        value={
                          form.tcp_port
                        }
                        onChange={(value) =>
                          updateField(
                            "tcp_port",
                            value
                          )
                        }
                        placeholder="502"
                        type="number"
                        disabled={connecting}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <Field
                      label="Serial / COM port"
                      value={
                        form.serial_port
                      }
                      onChange={(value) =>
                        updateField(
                          "serial_port",
                          value
                        )
                      }
                      placeholder="COM3"
                      disabled={connecting}
                      hint="Example on Windows: COM3. Example on Linux: /dev/ttyUSB0."
                    />

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <Field
                        label="Baud rate"
                        value={
                          form.baudrate
                        }
                        onChange={(value) =>
                          updateField(
                            "baudrate",
                            value
                          )
                        }
                        placeholder="9600"
                        type="number"
                        disabled={connecting}
                      />

                      <SelectField
                        label="Parity"
                        value={form.parity}
                        onChange={(value) =>
                          updateField(
                            "parity",
                            value
                          )
                        }
                        disabled={
                          connecting
                        }
                        options={[
                          {
                            value: "N",
                            label: "None",
                          },
                          {
                            value: "E",
                            label: "Even",
                          },
                          {
                            value: "O",
                            label: "Odd",
                          },
                        ]}
                      />

                      <Field
                        label="Stop bits"
                        value="1"
                        onChange={() => {}}
                        disabled
                        hint="Current gateway uses 1 stop bit."
                      />
                    </div>
                  </>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field
                    label="Modbus Unit ID"
                    value={
                      form.device_address
                    }
                    onChange={(value) =>
                      updateField(
                        "device_address",
                        value
                      )
                    }
                    placeholder="1"
                    type="number"
                    disabled={connecting}
                    hint="Typical inverter addresses are 1–16."
                  />

                  <Field
                    label="Connection timeout"
                    value={form.timeout}
                    onChange={(value) =>
                      updateField(
                        "timeout",
                        value
                      )
                    }
                    placeholder="3"
                    type="number"
                    disabled={connecting}
                    hint="Timeout in seconds."
                  />
                </div>
              </div>
            </section>

            {/* Discovery information */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <SectionTitle
                icon={Search}
                eyebrow="Step 03"
                title="Automatic device discovery"
                description="SolarIQ+ will connect, scan the device information models, identify the inverter and then request normalized telemetry."
              />

              <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50 p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-blue-600 shadow-sm">
                      <Search className="h-4 w-4" />
                    </div>

                    <div>
                      <div className="text-xs font-bold text-slate-700">
                        Discover
                      </div>

                      <div className="text-[10px] text-slate-400">
                        Scan SunSpec models
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-blue-600 shadow-sm">
                      <Cpu className="h-4 w-4" />
                    </div>

                    <div>
                      <div className="text-xs font-bold text-slate-700">
                        Identify
                      </div>

                      <div className="text-[10px] text-slate-400">
                        Manufacturer & model
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-blue-600 shadow-sm">
                      <Activity className="h-4 w-4" />
                    </div>

                    <div>
                      <div className="text-xs font-bold text-slate-700">
                        Monitor
                      </div>

                      <div className="text-[10px] text-slate-400">
                        Normalized telemetry
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {error && (
                <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />

                  <div className="min-w-0">
                    <div className="text-xs font-extrabold text-red-800">
                      Connection failed
                    </div>

                    <p className="mt-1 break-words text-xs leading-5 text-red-700">
                      {error}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setError("")
                    }
                    className="ml-auto shrink-0 text-red-400 transition hover:text-red-700"
                  >
                    <XCircle className="h-4 w-4" />
                  </button>
                </div>
              )}

              {backendStatus ===
                "unavailable" && (
                <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />

                  <div>
                    <div className="text-xs font-extrabold text-amber-800">
                      Monitoring backend is
                      unavailable
                    </div>

                    <p className="mt-1 text-xs leading-5 text-amber-700">
                      Start the SolarIQ+ monitoring
                      server on port 8001 before
                      attempting a real connection.
                    </p>
                  </div>
                </div>
              )}

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={
                    connectAndDiscover
                  }
                  disabled={
                    connecting ||
                    backendStatus ===
                      "unavailable"
                  }
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {connecting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Connecting & discovering…
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4" />
                      Connect & Discover
                    </>
                  )}
                </button>

                {isConnected && (
                  <button
                    type="button"
                    onClick={disconnect}
                    disabled={
                      refreshing
                    }
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-extrabold text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <XCircle className="h-4 w-4" />
                    Disconnect
                  </button>
                )}
              </div>

              <div className="mt-4 flex items-start gap-2 text-[10px] leading-4 text-slate-400">
                <Info className="mt-0.5 h-3 w-3 shrink-0" />

                <span>
                  A real inverter requires a reachable
                  communication interface. Software alone
                  cannot create a physical RS485, LAN or
                  manufacturer-cloud connection.
                </span>
              </div>
            </section>
          </div>

          {/* =======================================================
              RIGHT — DISCOVERY / TELEMETRY
          ======================================================= */}

          <div className="space-y-6">
            {!hasDiscovery ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-5 flex items-center justify-between">
                  <SectionTitle
                    icon={Signal}
                    eyebrow="Live connection"
                    title="Inverter discovery"
                    description="The discovered device and telemetry will appear here."
                  />

                  <div className="hidden sm:block">
                    <StatusPill
                      status={
                        connectionState
                      }
                    />
                  </div>
                </div>

                <EmptyResult />
              </section>
            ) : (
              <>
                {/* Device identity */}
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <SectionTitle
                      icon={Cpu}
                      eyebrow="Device identified"
                      title={
                        deviceData?.manufacturer ||
                        deviceData?.model
                          ? `${deviceData?.manufacturer || "Inverter"}`
                          : "SunSpec device"
                      }
                      description="SolarIQ+ successfully received standardized device information."
                    />

                    <StatusPill
                      status={
                        isConnected
                          ? "connected"
                          : connectionState
                      }
                    />
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Manufacturer
                      </div>

                      <div className="mt-1 text-base font-extrabold text-slate-900">
                        {firstDefined(
                          deviceData?.manufacturer,
                          deviceData?.Mn,
                          deviceData?.mn,
                          "Unknown"
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Model
                      </div>

                      <div className="mt-1 text-base font-extrabold text-slate-900">
                        {firstDefined(
                          deviceData?.model,
                          deviceData?.Md,
                          deviceData?.md,
                          "Unknown"
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Serial Number
                      </div>

                      <div className="mt-1 break-all text-sm font-extrabold text-slate-900">
                        {firstDefined(
                          deviceData?.serial_number,
                          deviceData?.SN,
                          deviceData?.sn,
                          "Not reported"
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Rated Capacity
                      </div>

                      <div className="mt-1 text-base font-extrabold text-slate-900">
                        {firstDefined(
                          deviceData?.rated_power_kw,
                          deviceData?.capacity_kw
                        ) !== null
                          ? `${formatNumber(
                              firstDefined(
                                deviceData?.rated_power_kw,
                                deviceData?.capacity_kw
                              ),
                              2
                            )} kW`
                          : "Not reported"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border border-slate-100 bg-white">
                    <DetailRow
                      label="Protocol"
                      value={firstDefined(
                        deviceData?.protocol,
                        "SunSpec Modbus"
                      )}
                    />

                    <DetailRow
                      label="Connection"
                      value={firstDefined(
                        deviceData?.connection_type,
                        selectedMode.title
                      )}
                    />

                    <DetailRow
                      label="Device / Unit ID"
                      value={firstDefined(
                        deviceData?.device_id,
                        form.device_address
                      )}
                    />

                    <DetailRow
                      label="Firmware"
                      value={firstDefined(
                        deviceData?.firmware_version,
                        deviceData?.Vr,
                        "Not reported"
                      )}
                    />

                    <DetailRow
                      label="Project"
                      value={
                        activeProject?.name ||
                        activeProject?.project_name ||
                        projectId
                      }
                    />
                  </div>
                </section>

                {/* Telemetry */}
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <SectionTitle
                      icon={Activity}
                      eyebrow="Realtime"
                      title="Live inverter telemetry"
                      description={
                        lastUpdated
                          ? `Last updated ${formatTimestamp(
                              lastUpdated
                            )}`
                          : "Current normalized readings from the connected device."
                      }
                    />

                    <button
                      type="button"
                      onClick={
                        refreshTelemetry
                      }
                      disabled={
                        refreshing ||
                        !connectionId
                      }
                      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-extrabold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 ${
                          refreshing
                            ? "animate-spin"
                            : ""
                        }`}
                      />
                      Refresh
                    </button>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
                    <MetricCard
                      icon={Zap}
                      label="Current Power"
                      value={
                        currentPower !==
                        null
                          ? formatNumber(
                              currentPower,
                              2
                            )
                          : "—"
                      }
                      unit="kW"
                      subtext="AC output"
                    />

                    <MetricCard
                      icon={Gauge}
                      label="Energy Today"
                      value={
                        todayEnergy !==
                        null
                          ? formatNumber(
                              todayEnergy,
                              2
                            )
                          : "—"
                      }
                      unit="kWh"
                      subtext="Daily counter"
                    />

                    <MetricCard
                      icon={Activity}
                      label="Lifetime Energy"
                      value={
                        totalEnergy !==
                        null
                          ? formatNumber(
                              totalEnergy,
                              1
                            )
                          : "—"
                      }
                      unit="kWh"
                      subtext="Cumulative counter"
                    />

                    <MetricCard
                      icon={Signal}
                      label="PV Voltage"
                      value={
                        pvVoltage !==
                        null
                          ? formatNumber(
                              pvVoltage,
                              1
                            )
                          : "—"
                      }
                      unit="V"
                      subtext="DC input"
                    />

                    <MetricCard
                      icon={Radio}
                      label="PV Current"
                      value={
                        pvCurrent !==
                        null
                          ? formatNumber(
                              pvCurrent,
                              1
                            )
                          : "—"
                      }
                      unit="A"
                      subtext="DC input"
                    />

                    <MetricCard
                      icon={Wifi}
                      label="Grid Frequency"
                      value={
                        gridFrequency !==
                        null
                          ? formatNumber(
                              gridFrequency,
                              2
                            )
                          : "—"
                      }
                      unit="Hz"
                      subtext="AC grid"
                    />
                  </div>

                  <div className="mt-4 flex flex-col gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                          String(
                            inverterStatus ||
                              ""
                          )
                            .toLowerCase()
                            .includes(
                              "fault"
                            )
                            ? "bg-red-100 text-red-600"
                            : "bg-emerald-100 text-emerald-600"
                        }`}
                      >
                        <Activity className="h-4 w-4" />
                      </div>

                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Inverter state
                        </div>

                        <div className="mt-0.5 text-sm font-extrabold capitalize text-slate-800">
                          {inverterStatus ||
                            "Unknown"}
                        </div>
                      </div>
                    </div>

                    <div className="text-left sm:text-right">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Telemetry timestamp
                      </div>

                      <div className="mt-0.5 text-xs font-bold text-slate-700">
                        {formatTimestamp(
                          latestReading?.timestamp ||
                            latestReading?.realtime
                              ?.timestamp
                        )}
                      </div>
                    </div>
                  </div>
                </section>

                {/* SunSpec models */}
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <SectionTitle
                      icon={Terminal}
                      eyebrow="Protocol discovery"
                      title="SunSpec models"
                      description="Information models detected on the connected device."
                    />

                    <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-center">
                      <div className="text-lg font-extrabold text-blue-700">
                        {modelCount}
                      </div>

                      <div className="text-[9px] font-bold uppercase tracking-wider text-blue-500">
                        Models
                      </div>
                    </div>
                  </div>

                  {Array.isArray(
                    discoveryModels
                  ) &&
                  discoveryModels.length > 0 ? (
                    <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {discoveryModels.map(
                        (model, index) => {
                          const modelId =
                            firstDefined(
                              model?.id,
                              model?.model_id,
                              model?.modelId,
                              model?.name,
                              model
                            );

                          const modelName =
                            firstDefined(
                              model?.name,
                              model?.model,
                              model?.model_name,
                              `Model ${modelId}`
                            );

                          return (
                            <div
                              key={`${modelId}-${index}`}
                              className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-3"
                            >
                              <div className="flex min-w-0 items-center gap-2.5">
                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-blue-600 shadow-sm">
                                  <Cpu className="h-3.5 w-3.5" />
                                </div>

                                <div className="min-w-0">
                                  <div className="truncate text-xs font-extrabold text-slate-800">
                                    {modelName}
                                  </div>

                                  <div className="text-[10px] text-slate-400">
                                    SunSpec model
                                  </div>
                                </div>
                              </div>

                              <span className="ml-2 shrink-0 rounded-lg bg-white px-2 py-1 text-[10px] font-bold text-slate-500 shadow-sm">
                                {String(
                                  modelId
                                )}
                              </span>
                            </div>
                          );
                        }
                      )}
                    </div>
                  ) : (
                    <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center">
                      <div className="text-xs font-bold text-slate-600">
                        Discovery response received
                      </div>

                      <div className="mt-1 text-[11px] text-slate-400">
                        The device did not return a
                        model list in the expected
                        display format.
                      </div>
                    </div>
                  )}
                </section>
              </>
            )}

            {/* =====================================================
                CONNECTION PIPELINE
            ===================================================== */}

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <SectionTitle
                icon={Cable}
                eyebrow="SolarIQ+ pipeline"
                title="Connection architecture"
                description="The universal connector normalizes device communication before the monitoring layer consumes it."
              />

              <div className="mt-5 flex flex-col gap-2">
                <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-blue-600 shadow-sm">
                    <Wifi className="h-4 w-4" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-extrabold text-slate-800">
                      Inverter / Gateway
                    </div>

                    <div className="text-[10px] text-slate-400">
                      {form.mode === "tcp"
                        ? form.host ||
                          "Local network device"
                        : form.serial_port ||
                          "RS485 interface"}
                    </div>
                  </div>

                  <ChevronRight className="h-4 w-4 text-slate-300" />
                </div>

                <div className="ml-5 h-3 border-l border-dashed border-slate-300" />

                <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-indigo-600 shadow-sm">
                    <Search className="h-4 w-4" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-extrabold text-slate-800">
                      SunSpec discovery
                    </div>

                    <div className="text-[10px] text-slate-400">
                      Automatic model and device identification
                    </div>
                  </div>

                  <ChevronRight className="h-4 w-4 text-slate-300" />
                </div>

                <div className="ml-5 h-3 border-l border-dashed border-slate-300" />

                <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-emerald-600 shadow-sm">
                    <Activity className="h-4 w-4" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-extrabold text-slate-800">
                      Normalized telemetry
                    </div>

                    <div className="text-[10px] text-slate-400">
                      Power, energy, voltage, frequency and status
                    </div>
                  </div>

                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                </div>
              </div>

              {connectionId && (
                <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                    Connection ID
                  </div>

                  <div className="mt-1 break-all font-mono text-[10px] text-slate-600">
                    {connectionId}
                  </div>
                </div>
              )}

              {connectionResponse && (
                <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />

                    <span className="text-xs font-extrabold text-emerald-800">
                      Connection accepted
                    </span>
                  </div>

                  <div className="mt-1 text-[10px] leading-4 text-emerald-700">
                    SolarIQ+ successfully established
                    the universal gateway connection and
                    started device discovery.
                  </div>
                </div>
              )}
            </section>

            {/* =====================================================
                FALLBACK INFORMATION
            ===================================================== */}

            <section className="rounded-2xl border border-amber-100 bg-amber-50 p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-amber-600 shadow-sm">
                  <CircleAlert className="h-4 w-4" />
                </div>

                <div>
                  <div className="text-sm font-extrabold text-amber-900">
                    What if SunSpec is not detected?
                  </div>

                  <p className="mt-1 text-xs leading-5 text-amber-800/80">
                    The universal connector cannot make a
                    non-compatible inverter speak SunSpec.
                    SolarIQ+ can instead use a supported
                    manufacturer adapter, cloud API or
                    another compatible communication
                    gateway.
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-amber-800">
                      SunSpec Modbus
                    </span>

                    <span className="rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-amber-800">
                      Manufacturer Adapter
                    </span>

                    <span className="rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-amber-800">
                      Cloud API
                    </span>

                    <span className="rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-amber-800">
                      Gateway
                    </span>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>

        {/* =========================================================
            FOOTER
        ========================================================= */}

        <div className="mt-6 flex flex-col gap-2 border-t border-slate-200 pt-5 text-[10px] text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <div>
            SolarIQ+ Universal Inverter Integration
          </div>

          <div className="flex items-center gap-2">
            <span>
              SunSpec Modbus
            </span>

            <span>•</span>

            <span>
              Modbus TCP
            </span>

            <span>•</span>

            <span>
              Modbus RTU / RS485
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}