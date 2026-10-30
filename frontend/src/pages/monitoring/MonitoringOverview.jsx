import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  CloudSun,
  Database,
  Link2,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Sun,
  Zap,
  Cpu,
  Gauge,
  Wifi,
  AlertTriangle,
} from "lucide-react";

import { useProjectContext } from "@/context/ProjectContext";

const MONITORING_SERVER_URL =
  process.env.REACT_APP_MONITORING_URL ||
  "http://127.0.0.1:8001";

const ENPHASE_OAUTH_URL =
  process.env.REACT_APP_ENPHASE_OAUTH_URL ||
  "http://127.0.0.1:8002";

/*
|--------------------------------------------------------------------------
| CURRENT INTEGRATION TRACK
|--------------------------------------------------------------------------
| These are the six manufacturers currently being developed/integrated.
| Alphabetical order.
|--------------------------------------------------------------------------
*/

const CURRENT_INTEGRATIONS = [
  {
    id: "enphase",
    name: "Enphase",
    category: "Microinverter / Energy System",
    integration: "available",
    protocol: "Cloud API / OAuth",
  },
  {
    id: "fronius",
    name: "Fronius",
    category: "Solar Inverter",
    integration: "in_progress",
    protocol: "SunSpec / Modbus",
  },
  {
    id: "ksolare",
    name: "KSolare",
    category: "On-Grid / Hybrid Inverter",
    integration: "available",
    protocol: "Modbus RTU / RS485",
  },
  {
    id: "microtek",
    name: "Microtek",
    category: "Solar / Hybrid Inverter",
    integration: "in_progress",
    protocol: "Manufacturer Adapter / Modbus",
  },
  {
    id: "sma",
    name: "SMA",
    category: "PV / Hybrid Inverter",
    integration: "in_progress",
    protocol: "SunSpec / Modbus",
  },
  {
    id: "sungrow",
    name: "Sungrow",
    category: "String / Hybrid Inverter",
    integration: "in_progress",
    protocol: "SunSpec / Modbus",
  },
].sort((a, b) =>
  a.name.localeCompare(b.name)
);

/*
|--------------------------------------------------------------------------
| UPCOMING INTEGRATIONS
|--------------------------------------------------------------------------
| Complete remaining supported/planned list.
| Alphabetical order.
|--------------------------------------------------------------------------
*/

const UPCOMING_INTEGRATIONS = [
  {
    id: "abb",
    name: "ABB",
    category: "Solar Inverter",
    integration: "planned",
    protocol: "Manufacturer Adapter",
  },
  {
    id: "apsystems",
    name: "APsystems",
    category: "Microinverter / MLPE",
    integration: "planned",
    protocol: "Manufacturer Adapter",
  },
  {
    id: "delta",
    name: "Delta",
    category: "Solar Inverter",
    integration: "planned",
    protocol: "Manufacturer Adapter",
  },
  {
    id: "deye",
    name: "Deye",
    category: "String / Hybrid Inverter",
    integration: "planned",
    protocol: "Manufacturer Adapter",
  },
  {
    id: "fimer",
    name: "FIMER",
    category: "Solar Inverter",
    integration: "planned",
    protocol: "Manufacturer Adapter",
  },
  {
    id: "goodwe",
    name: "GoodWe",
    category: "String / Hybrid Inverter",
    integration: "planned",
    protocol: "Manufacturer Adapter",
  },
  {
    id: "growatt",
    name: "Growatt",
    category: "String / Hybrid Inverter",
    integration: "planned",
    protocol: "Manufacturer Adapter",
  },
  {
    id: "huawei",
    name: "Huawei FusionSolar",
    category: "Smart PV / Inverter",
    integration: "planned",
    protocol: "Cloud API / Gateway",
  },
  {
    id: "invt",
    name: "INVT",
    category: "Solar Inverter",
    integration: "planned",
    protocol: "Manufacturer Adapter",
  },
  {
    id: "jakson",
    name: "Jakson",
    category: "Solar Energy Systems",
    integration: "planned",
    protocol: "Manufacturer Adapter",
  },
  {
    id: "livoltek",
    name: "LIVOLTEK",
    category: "Grid-Tied / Hybrid Inverter",
    integration: "planned",
    protocol: "Manufacturer Adapter",
  },
  {
    id: "luminous",
    name: "Luminous",
    category: "On-Grid / Hybrid / Off-Grid",
    integration: "planned",
    protocol: "Manufacturer Adapter",
  },
  {
    id: "power_electronics",
    name: "Power Electronics",
    category: "Utility / String Inverter",
    integration: "planned",
    protocol: "Manufacturer Adapter",
  },
  {
    id: "saj",
    name: "SAJ",
    category: "String / Hybrid Inverter",
    integration: "planned",
    protocol: "Manufacturer Adapter",
  },
  {
    id: "schneider",
    name: "Schneider Electric",
    category: "Solar / Storage Inverter",
    integration: "planned",
    protocol: "Manufacturer Adapter",
  },
  {
    id: "servotech",
    name: "Servotech",
    category: "On-Grid / Hybrid / Off-Grid",
    integration: "planned",
    protocol: "Manufacturer Adapter",
  },
  {
    id: "sineng",
    name: "Sineng Electric",
    category: "String / Central Inverter",
    integration: "planned",
    protocol: "Manufacturer Adapter",
  },
  {
    id: "sofar",
    name: "SOFAR",
    category: "String / Hybrid Inverter",
    integration: "planned",
    protocol: "Manufacturer Adapter",
  },
  {
    id: "solaredge",
    name: "SolarEdge",
    category: "Power Optimizer / Inverter",
    integration: "planned",
    protocol: "Manufacturer Adapter",
  },
  {
    id: "solax",
    name: "SolaX Power",
    category: "String / Hybrid Inverter",
    integration: "planned",
    protocol: "Manufacturer Adapter",
  },
  {
    id: "solis",
    name: "Solis",
    category: "String / Hybrid Inverter",
    integration: "planned",
    protocol: "Manufacturer Adapter",
  },
  {
    id: "solplanet",
    name: "Solplanet",
    category: "String / Hybrid Inverter",
    integration: "planned",
    protocol: "Manufacturer Adapter",
  },
  {
    id: "tbea",
    name: "TBEA",
    category: "String / Central Inverter",
    integration: "planned",
    protocol: "Manufacturer Adapter",
  },
  {
    id: "v_guard",
    name: "V-Guard",
    category: "Solar / Hybrid Inverter",
    integration: "planned",
    protocol: "Manufacturer Adapter",
  },
  {
    id: "waaree",
    name: "Waaree",
    category: "Solar Energy Systems",
    integration: "planned",
    protocol: "Manufacturer Adapter",
  },
  {
    id: "other",
    name: "Other / Not Listed",
    category: "Other inverter or monitoring platform",
    integration: "planned",
    protocol: "Custom Adapter",
  },
].sort((a, b) =>
  a.name.localeCompare(b.name)
);

const INVERTER_PROVIDERS = [
  ...CURRENT_INTEGRATIONS,
  ...UPCOMING_INTEGRATIONS,
];

export default function MonitoringOverview() {
  const {
    activeProject,
    activeProjectId,
    isLoading,
  } = useProjectContext();

  const [generation, setGeneration] =
    useState(null);

  const [enphaseStatus, setEnphaseStatus] =
    useState(null);

  const [loadingGeneration, setLoadingGeneration] =
    useState(false);

  const [loadingEnphase, setLoadingEnphase] =
    useState(false);

  const [loadingDemoImport, setLoadingDemoImport] =
    useState(false);

  const [loadingKSolare, setLoadingKSolare] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [selectedProviderId, setSelectedProviderId] =
    useState("");

  const [providerOpen, setProviderOpen] =
    useState(false);

  const [providerSearch, setProviderSearch] =
    useState("");

  const [otherProviderName, setOtherProviderName] =
    useState("");

  const [ksolareConnection, setKsolareConnection] =
    useState(null);

  const [ksolareSystem, setKsolareSystem] =
    useState(null);

  const [ksolareRealtime, setKsolareRealtime] =
    useState(null);

  const [ksolareDetails, setKsolareDetails] =
    useState(null);

  const [ksolareLastUpdated, setKsolareLastUpdated] =
    useState(null);

  const providerPickerRef =
    useRef(null);

  const projectId =
    activeProjectId ||
    activeProject?.id ||
    null;

  const selectedProvider =
    useMemo(
      () =>
        INVERTER_PROVIDERS.find(
          (provider) =>
            provider.id ===
            selectedProviderId
        ) || null,
      [selectedProviderId]
    );

  const filteredCurrentIntegrations =
    useMemo(() => {
      const search =
        providerSearch
          .trim()
          .toLowerCase();

      if (!search) {
        return CURRENT_INTEGRATIONS;
      }

      return CURRENT_INTEGRATIONS.filter(
        (provider) =>
          provider.name
            .toLowerCase()
            .includes(search) ||
          provider.category
            .toLowerCase()
            .includes(search)
      );
    }, [providerSearch]);

  const filteredUpcomingIntegrations =
    useMemo(() => {
      const search =
        providerSearch
          .trim()
          .toLowerCase();

      if (!search) {
        return UPCOMING_INTEGRATIONS;
      }

      return UPCOMING_INTEGRATIONS.filter(
        (provider) =>
          provider.name
            .toLowerCase()
            .includes(search) ||
          provider.category
            .toLowerCase()
            .includes(search)
      );
    }, [providerSearch]);

  const totalFilteredProviders =
    filteredCurrentIntegrations.length +
    filteredUpcomingIntegrations.length;

  const readings =
    generation?.readings || [];

  const latest =
    readings.length > 0
      ? readings[readings.length - 1]
      : null;

  const demoReadings =
    readings.filter(
      (reading) =>
        reading.demo === true ||
        reading.data_mode === "demo" ||
        reading.source ===
          "demo_enphase_adapter"
    );

  const realEnphaseReadings =
    readings.filter(
      (reading) =>
        reading.provider === "Enphase" &&
        reading.demo !== true &&
        reading.data_mode !== "demo"
    );

  const hasEnphaseDemoData =
    demoReadings.length > 0;

  const hasRealEnphaseData =
    realEnphaseReadings.length > 0;

  const isEnphaseAuthorized =
    enphaseStatus?.authorized === true;

  const isEnphaseConnected =
    isEnphaseAuthorized ||
    hasEnphaseDemoData ||
    hasRealEnphaseData;

  const enphaseConnectionMode =
    isEnphaseAuthorized ||
    hasRealEnphaseData
      ? "real"
      : hasEnphaseDemoData
        ? "demo"
        : null;

  const isKSolareConnected =
    Boolean(
      ksolareConnection &&
      ksolareSystem &&
      ksolareRealtime
    );

  const ksolareReading =
    ksolareRealtime
      ?.readings?.[0] || null;

  const ksolareRaw =
    ksolareReading?.raw || {};

  const systemCapacity =
    activeProject?.capacity_kw ??
    activeProject?.system_capacity_kw ??
    activeProject?.installed_capacity_kw ??
    null;

  const monitoringStartDate =
    activeProject?.monitoring_start_date ||
    activeProject?.installation_date ||
    null;

  const dataCoverageDays =
    getUniqueDateCount(readings);

  const totalGeneration =
    readings.reduce(
      (total, reading) =>
        total +
        Number(
          reading.actual_generation_kwh ||
            0
        ),
      0
    );

  /*
  |--------------------------------------------------------------------------
  | Outside click
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    const handleOutsideClick =
      (event) => {
        if (
          providerPickerRef.current &&
          !providerPickerRef.current.contains(
            event.target
          )
        ) {
          setProviderOpen(false);
        }
      };

    document.addEventListener(
      "mousedown",
      handleOutsideClick
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleOutsideClick
      );
    };
  }, []);

  /*
  |--------------------------------------------------------------------------
  | Generation
  |--------------------------------------------------------------------------
  */

  const loadGeneration =
    async () => {
      if (!projectId) return;

      setLoadingGeneration(true);

      try {
        const response =
          await fetch(
            `${MONITORING_SERVER_URL}/api/monitoring/generation/${projectId}`
          );

        if (!response.ok) {
          throw new Error(
            "Generation data could not be loaded."
          );
        }

        const data =
          await response.json();

        setGeneration(data);

        const incomingReadings =
          data?.readings || [];

        const hasEnphaseData =
          incomingReadings.some(
            (reading) =>
              reading.provider ===
                "Enphase" ||
              reading.source ===
                "demo_enphase_adapter"
          );

        if (hasEnphaseData) {
          setSelectedProviderId(
            "enphase"
          );
        }
      } catch (error) {
        console.error(
          "Generation monitoring error:",
          error
        );

        setGeneration(null);
      } finally {
        setLoadingGeneration(false);
      }
    };

  /*
  |--------------------------------------------------------------------------
  | Enphase
  |--------------------------------------------------------------------------
  */

  const loadEnphaseStatus =
    async () => {
      setLoadingEnphase(true);

      try {
        const response =
          await fetch(
            `${ENPHASE_OAUTH_URL}/api/enphase/authorization`
          );

        if (!response.ok) {
          throw new Error(
            "Enphase status could not be loaded."
          );
        }

        const data =
          await response.json();

        setEnphaseStatus(data);

        if (data.authorized) {
          setSelectedProviderId(
            "enphase"
          );
        }
      } catch (error) {
        console.error(
          "Enphase status error:",
          error
        );

        setEnphaseStatus({
          provider: "Enphase",
          authorized: false,
          status: "unavailable",
        });
      } finally {
        setLoadingEnphase(false);
      }
    };

  /*
  |--------------------------------------------------------------------------
  | KSolare
  |--------------------------------------------------------------------------
  */

  const loadKSolare = async ({
    showLoading = true,
    showMessage = false,
  } = {}) => {
    if (!projectId) {
      return;
    }

    if (showLoading) {
      setLoadingKSolare(true);
    }

    try {
      let connection = null;

      const connectionsResponse =
        await fetch(
          `${MONITORING_SERVER_URL}/api/monitoring/inverters/connections?project_id=${encodeURIComponent(
            projectId
          )}&provider_id=ksolare`
        );

      if (!connectionsResponse.ok) {
        throw new Error(
          "KSolare connections could not be loaded."
        );
      }

      const connectionsData =
        await connectionsResponse.json();

      const existingConnections =
        connectionsData?.connections ||
        [];

      if (
        existingConnections.length >
        0
      ) {
        connection =
          existingConnections[0];
      } else {
        const createResponse =
          await fetch(
            `${MONITORING_SERVER_URL}/api/monitoring/inverters/ksolare/connections`,
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                project_id:
                  projectId,
                name:
                  activeProject?.name
                    ? `${activeProject.name} - KSolare`
                    : "SolarIQ+ KSolare Inverter",
                data_mode:
                  "simulator",
                config: {},
                metadata: {
                  source:
                    "solariq-monitoring-ui",
                },
              }),
            }
          );

        const createData =
          await createResponse
            .json()
            .catch(() => null);

        if (!createResponse.ok) {
          throw new Error(
            createData?.detail ||
              "KSolare connection could not be created."
          );
        }

        connection =
          createData?.connection;
      }

      if (
        !connection?.connection_id
      ) {
        throw new Error(
          "KSolare connection ID was not returned."
        );
      }

      setKsolareConnection(
        connection
      );

      const connectionId =
        connection.connection_id;

      const systemsResponse =
        await fetch(
          `${MONITORING_SERVER_URL}/api/monitoring/inverters/ksolare/systems?connection_id=${encodeURIComponent(
            connectionId
          )}`
        );

      const systemsData =
        await systemsResponse
          .json()
          .catch(() => null);

      if (!systemsResponse.ok) {
        throw new Error(
          systemsData?.detail ||
            "KSolare system could not be discovered."
        );
      }

      const systems =
        systemsData?.systems ||
        [];

      if (systems.length === 0) {
        throw new Error(
          "No KSolare inverter system was found."
        );
      }

      const system =
        systems[0];

      setKsolareSystem(
        system
      );

      const systemId =
        system.external_system_id;

      if (!systemId) {
        throw new Error(
          "KSolare system ID was not returned."
        );
      }

      const detailsResponse =
        await fetch(
          `${MONITORING_SERVER_URL}/api/monitoring/inverters/ksolare/systems/${encodeURIComponent(
            systemId
          )}?connection_id=${encodeURIComponent(
            connectionId
          )}`
        );

      if (detailsResponse.ok) {
        const detailsData =
          await detailsResponse.json();

        setKsolareDetails(
          detailsData?.system ||
            null
        );
      }

      const realtimeResponse =
        await fetch(
          `${MONITORING_SERVER_URL}/api/monitoring/inverters/ksolare/systems/${encodeURIComponent(
            systemId
          )}/realtime?connection_id=${encodeURIComponent(
            connectionId
          )}`
        );

      const realtimeData =
        await realtimeResponse
          .json()
          .catch(() => null);

      if (!realtimeResponse.ok) {
        throw new Error(
          realtimeData?.detail ||
            "KSolare realtime data could not be loaded."
        );
      }

      setKsolareRealtime(
        realtimeData
      );

      setKsolareLastUpdated(
        new Date()
      );

      if (showMessage) {
        setMessage(
          "KSolare monitoring connected successfully."
        );
      }
    } catch (error) {
      console.error(
        "KSolare monitoring error:",
        error
      );

      if (showMessage) {
        setMessage(
          error?.message ||
            "Unable to connect to KSolare monitoring."
        );
      }
    } finally {
      if (showLoading) {
        setLoadingKSolare(false);
      }
    }
  };

  /*
  |--------------------------------------------------------------------------
  | Initial loading
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    loadGeneration();
    loadEnphaseStatus();
  }, [projectId]);

  /*
  |--------------------------------------------------------------------------
  | KSolare loading
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    if (
      projectId &&
      selectedProviderId ===
        "ksolare"
    ) {
      loadKSolare({
        showLoading: true,
        showMessage: false,
      });
    }
  }, [
    projectId,
    selectedProviderId,
  ]);

  /*
  |--------------------------------------------------------------------------
  | KSolare automatic refresh
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    if (
      !projectId ||
      selectedProviderId !==
        "ksolare"
    ) {
      return undefined;
    }

    const interval =
      setInterval(() => {
        loadKSolare({
          showLoading: false,
          showMessage: false,
        });
      }, 15000);

    return () => {
      clearInterval(interval);
    };
  }, [
    projectId,
    selectedProviderId,
  ]);

  /*
  |--------------------------------------------------------------------------
  | Focus refresh
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    const refresh = () => {
      loadGeneration();
      loadEnphaseStatus();

      if (
        selectedProviderId ===
        "ksolare"
      ) {
        loadKSolare({
          showLoading: false,
          showMessage: false,
        });
      }
    };

    window.addEventListener(
      "focus",
      refresh
    );

    return () => {
      window.removeEventListener(
        "focus",
        refresh
      );
    };
  }, [
    projectId,
    selectedProviderId,
  ]);

  /*
  |--------------------------------------------------------------------------
  | Refresh all
  |--------------------------------------------------------------------------
  */

  const refreshAll = async () => {
    setMessage("");

    const tasks = [
      loadGeneration(),
      loadEnphaseStatus(),
    ];

    if (
      selectedProviderId ===
      "ksolare"
    ) {
      tasks.push(
        loadKSolare({
          showLoading: true,
          showMessage: false,
        })
      );
    }

    await Promise.all(tasks);
  };

  /*
  |--------------------------------------------------------------------------
  | Enphase OAuth
  |--------------------------------------------------------------------------
  */

  const startEnphaseConnection =
    async () => {
      setMessage("");
      setLoadingEnphase(true);

      try {
        const response =
          await fetch(
            `${ENPHASE_OAUTH_URL}/api/enphase/oauth/connect`
          );

        if (!response.ok) {
          const errorData =
            await response
              .json()
              .catch(() => null);

          throw new Error(
            errorData?.detail ||
              "SolarIQ+ could not start the Enphase connection."
          );
        }

        const data =
          await response.json();

        if (
          !data.authorization_url
        ) {
          throw new Error(
            "Enphase authorization URL was not returned."
          );
        }

        window.open(
          data.authorization_url,
          "_blank",
          "noopener,noreferrer"
        );

        setMessage(
          "Enphase authorization opened in a new tab. Complete authorization there, then return to SolarIQ+."
        );
      } catch (error) {
        console.error(
          "Enphase connection error:",
          error
        );

        setMessage(
          error?.message ||
            "Unable to start the Enphase connection."
        );
      } finally {
        setLoadingEnphase(false);
      }
    };

  /*
  |--------------------------------------------------------------------------
  | Enphase demo
  |--------------------------------------------------------------------------
  */

  const importDemoEnphaseData =
    async () => {
      if (!projectId) {
        setMessage(
          "No active SolarIQ+ project is selected."
        );
        return;
      }

      setMessage("");
      setLoadingDemoImport(true);

      try {
        const capacity =
          Number(systemCapacity) > 0
            ? Number(
                systemCapacity
              )
            : 2.5;

        const response =
          await fetch(
            `${MONITORING_SERVER_URL}/api/monitoring/enphase/demo/import`,
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                project_id:
                  projectId,
                days: 30,
                system_capacity_kw:
                  capacity,
              }),
            }
          );

        const data =
          await response
            .json()
            .catch(() => null);

        if (!response.ok) {
          throw new Error(
            data?.detail ||
              "Demo Enphase data import failed."
          );
        }

        setSelectedProviderId(
          "enphase"
        );

        setMessage(
          `Enphase demo integration connected. ${
            data?.days_imported ||
            30
          } days of integration data are now available for this project.`
        );

        await loadGeneration();
      } catch (error) {
        console.error(
          "Enphase demo import error:",
          error
        );

        setMessage(
          error?.message ||
            "Unable to import Enphase demo data."
        );
      } finally {
        setLoadingDemoImport(
          false
        );
      }
    };

  /*
  |--------------------------------------------------------------------------
  | Provider selection
  |--------------------------------------------------------------------------
  */

  const handleProviderSelect =
    (provider) => {
      setSelectedProviderId(
        provider.id
      );

      setProviderOpen(false);
      setProviderSearch("");
      setMessage("");

      if (
        provider.id !== "other"
      ) {
        setOtherProviderName("");
      }
    };

  const handleOtherProviderSelect =
    () => {
      const otherProvider =
        INVERTER_PROVIDERS.find(
          (provider) =>
            provider.id === "other"
        );

      if (otherProvider) {
        handleProviderSelect(
          otherProvider
        );
      }
    };

  /*
  |--------------------------------------------------------------------------
  | Loading states
  |--------------------------------------------------------------------------
  */

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!projectId) {
    return (
      <div className="max-w-5xl mx-auto px-5 py-10">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <div className="flex items-center gap-3">
            <Activity className="h-5 w-5 text-amber-600" />

            <div>
              <h2 className="font-bold text-slate-900">
                No active solar system selected
              </h2>

              <p className="mt-1 text-sm text-slate-600">
                Register or select an
                existing solar system
                before starting
                monitoring.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /*
  |--------------------------------------------------------------------------
  | UI
  |--------------------------------------------------------------------------
  */

  return (
    <div className="max-w-6xl mx-auto px-5 py-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-600">
            <Activity className="h-4 w-4" />
            Existing System Monitoring
          </div>

          <h1 className="mt-2 text-3xl font-extrabold text-navy-dark font-display">
            {activeProject?.name ||
              "My Home Solar"}
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Automatic monitoring for
            your registered solar
            system.
          </p>
        </div>

        <button
          type="button"
          onClick={refreshAll}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw
            className={`h-4 w-4 ${
              loadingGeneration ||
              loadingEnphase ||
              loadingKSolare
                ? "animate-spin"
                : ""
            }`}
          />

          Refresh
        </button>
      </div>

      {/* System summary */}
      <div className="mt-7 grid gap-4 md:grid-cols-3">
        <SummaryCard
          icon={Zap}
          label="Installed Capacity"
          value={
            systemCapacity
              ? `${systemCapacity} kW`
              : "Registered system"
          }
        />

        <SummaryCard
          icon={Activity}
          label="System Status"
          value={
            isKSolareConnected
              ? "KSOLARE CONNECTED"
              : isEnphaseConnected
                ? enphaseConnectionMode ===
                  "demo"
                  ? "ENPHASE DEMO"
                  : "CONNECTED"
                : "MONITORING"
          }
          valueClass={
            isKSolareConnected ||
            isEnphaseConnected
              ? "text-emerald-600"
              : "text-blue-600"
          }
        />

        <SummaryCard
          icon={Database}
          label={
            dataCoverageDays >
            0
              ? "Data Coverage"
              : "Monitoring Day"
          }
          value={
            dataCoverageDays >
            0
              ? `${dataCoverageDays} days`
              : monitoringStartDate
                ? calculateMonitoringDay(
                    monitoringStartDate
                  )
                : "Day 1"
          }
        />
      </div>

      {/* Inverter connection */}
      <div className="mt-6 rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-white p-6">
        <div className="flex flex-col gap-5">
          <div className="flex gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
              <Zap className="h-6 w-6" />
            </div>

            <div>
              <h2 className="text-lg font-extrabold text-navy-dark">
                Connect Your Inverter
              </h2>

              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
                SolarIQ+ supports a
                multi-brand inverter
                integration architecture
                using cloud APIs,
                SunSpec/Modbus and
                manufacturer-specific
                adapters.
              </p>
            </div>
          </div>

          {/* Integration overview */}
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-blue-100 bg-white p-4">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-blue-600">
                Current Integration Track
              </div>

              <div className="mt-2 text-2xl font-extrabold text-navy-dark">
                6
              </div>

              <div className="mt-1 text-xs text-slate-500">
                Manufacturers being
                integrated
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                Upcoming
              </div>

              <div className="mt-2 text-2xl font-extrabold text-navy-dark">
                {UPCOMING_INTEGRATIONS.length}
              </div>

              <div className="mt-1 text-xs text-slate-500">
                Additional manufacturers
              </div>
            </div>

            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-600">
                Architecture
              </div>

              <div className="mt-2 text-sm font-extrabold text-emerald-700">
                Universal Integration
              </div>

              <div className="mt-1 text-xs text-emerald-700">
                API · SunSpec · Modbus
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            {/* Provider picker */}
            <div
              ref={providerPickerRef}
              className="relative"
            >
              <label
                htmlFor="inverter-provider-search"
                className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500"
              >
                Inverter / Monitoring
                Provider
              </label>

              <button
                type="button"
                onClick={() => {
                  setProviderOpen(
                    (current) =>
                      !current
                  );

                  if (
                    !providerOpen
                  ) {
                    setTimeout(
                      () => {
                        document
                          .getElementById(
                            "inverter-provider-search"
                          )
                          ?.focus();
                      },
                      50
                    );
                  }
                }}
                className="flex w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-800 shadow-sm transition hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              >
                <span
                  className={
                    selectedProvider
                      ? "text-slate-800"
                      : "text-slate-400"
                  }
                >
                  {selectedProvider
                    ? selectedProvider.name
                    : "Select inverter / monitoring provider"}
                </span>

                <ChevronDown
                  className={`h-4 w-4 text-slate-400 transition-transform ${
                    providerOpen
                      ? "rotate-180"
                      : ""
                  }`}
                />
              </button>

              {providerOpen && (
                <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                  {/* Search */}
                  <div className="border-b border-slate-100 bg-white p-2.5">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                      <input
                        id="inverter-provider-search"
                        type="text"
                        value={
                          providerSearch
                        }
                        onChange={(
                          event
                        ) =>
                          setProviderSearch(
                            event
                              .target
                              .value
                          )
                        }
                        placeholder="Search inverter brand..."
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                  </div>

                  <div className="max-h-[420px] overflow-y-auto overscroll-contain">
                    {totalFilteredProviders ===
                    0 ? (
                      <div className="px-4 py-8 text-center">
                        <Search className="mx-auto h-5 w-5 text-slate-300" />

                        <p className="mt-2 text-sm font-bold text-slate-600">
                          No inverter found
                        </p>

                        <p className="mt-1 text-xs text-slate-400">
                          Try another brand
                          or use Other /
                          Not Listed.
                        </p>
                      </div>
                    ) : (
                      <>
                        {/* CURRENT */}
                        {filteredCurrentIntegrations.length >
                          0 && (
                          <div>
                            <div className="sticky top-0 z-10 border-b border-blue-100 bg-blue-50 px-3 py-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-700">
                                  Current Integration
                                  Track
                                </span>

                                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[9px] font-bold text-blue-700">
                                  6 brands
                                </span>
                              </div>
                            </div>

                            <div className="p-1.5">
                              {filteredCurrentIntegrations.map(
                                (
                                  provider
                                ) => {
                                  const selected =
                                    provider.id ===
                                    selectedProviderId;

                                  return (
                                    <ProviderOption
                                      key={
                                        provider.id
                                      }
                                      provider={
                                        provider
                                      }
                                      selected={
                                        selected
                                      }
                                      onSelect={
                                        handleProviderSelect
                                      }
                                    />
                                  );
                                }
                              )}
                            </div>
                          </div>
                        )}

                        {/* UPCOMING */}
                        {filteredUpcomingIntegrations.length >
                          0 && (
                          <div className="border-t border-slate-200">
                            <div className="sticky top-0 z-10 border-b border-slate-100 bg-slate-50 px-3 py-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                                  Upcoming
                                  Integrations
                                </span>

                                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[9px] font-bold text-slate-600">
                                  {UPCOMING_INTEGRATIONS.length}
                                </span>
                              </div>
                            </div>

                            <div className="p-1.5">
                              {filteredUpcomingIntegrations.map(
                                (
                                  provider
                                ) => {
                                  const selected =
                                    provider.id ===
                                    selectedProviderId;

                                  return (
                                    <ProviderOption
                                      key={
                                        provider.id
                                      }
                                      provider={
                                        provider
                                      }
                                      selected={
                                        selected
                                      }
                                      onSelect={
                                        handleProviderSelect
                                      }
                                    />
                                  );
                                }
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <div className="border-t border-slate-200 bg-slate-50 p-2.5">
                    <button
                      type="button"
                      onClick={
                        handleOtherProviderSelect
                      }
                      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition ${
                        selectedProviderId ===
                        "other"
                          ? "border-blue-200 bg-blue-50"
                          : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50"
                      }`}
                    >
                      <div>
                        <div
                          className={`text-sm font-bold ${
                            selectedProviderId ===
                            "other"
                              ? "text-blue-700"
                              : "text-slate-800"
                          }`}
                        >
                          Other / Not
                          Listed
                        </div>

                        <div className="mt-0.5 text-[11px] text-slate-500">
                          My inverter
                          brand is not
                          listed
                        </div>
                      </div>

                      {selectedProviderId ===
                        "other" && (
                        <Check className="h-4 w-4 text-blue-600" />
                      )}
                    </button>
                  </div>

                  <div className="border-t border-slate-100 bg-slate-50 px-3 py-2">
                    <p className="text-[10px] font-medium text-slate-400">
                      {totalFilteredProviders}{" "}
                      provider
                      {totalFilteredProviders ===
                      1
                        ? ""
                        : "s"}{" "}
                      shown
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Connection action */}
            <div>
              {selectedProvider?.id ===
                "enphase" && (
                <div className="flex flex-col gap-2 md:min-w-[270px]">
                  {isEnphaseConnected ? (
                    <div className="flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-bold text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" />

                      {enphaseConnectionMode ===
                      "demo"
                        ? "Enphase Demo Connected"
                        : "Enphase Connected"}
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={
                          startEnphaseConnection
                        }
                        disabled={
                          loadingEnphase ||
                          loadingDemoImport
                        }
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {loadingEnphase ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Connecting...
                          </>
                        ) : (
                          <>
                            <Link2 className="h-4 w-4" />
                            Connect
                            Enphase
                            <ArrowRight className="h-4 w-4" />
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={
                          importDemoEnphaseData
                        }
                        disabled={
                          loadingDemoImport ||
                          loadingEnphase
                        }
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-6 py-3 text-sm font-bold text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {loadingDemoImport ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Importing...
                          </>
                        ) : (
                          <>
                            <Database className="h-4 w-4" />
                            Import
                            30-Day
                            Demo Data
                          </>
                        )}
                      </button>
                    </>
                  )}
                </div>
              )}

              {selectedProvider?.id ===
                "ksolare" && (
                <div className="flex flex-col gap-2 md:min-w-[270px]">
                  <button
                    type="button"
                    onClick={() =>
                      loadKSolare({
                        showLoading: true,
                        showMessage: true,
                      })
                    }
                    disabled={
                      loadingKSolare
                    }
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loadingKSolare ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <Wifi className="h-4 w-4" />
                        Connect KSolare
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>

                  {isKSolareConnected && (
                    <div className="flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-xs font-bold text-amber-700">
                      <CheckCircle2 className="h-4 w-4" />
                      Simulator Data
                    </div>
                  )}
                </div>
              )}

              {selectedProvider &&
                selectedProvider.id !==
                  "enphase" &&
                selectedProvider.id !==
                  "ksolare" && (
                  <div className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-center md:min-w-[250px]">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Integration Status
                    </div>

                    <div
                      className={`mt-1 text-sm font-bold ${
                        selectedProvider.integration ===
                        "in_progress"
                          ? "text-blue-700"
                          : "text-slate-700"
                      }`}
                    >
                      {selectedProvider.integration ===
                      "in_progress"
                        ? "Integration In Progress"
                        : "Coming Soon"}
                    </div>

                    <div className="mt-1 text-[10px] text-slate-400">
                      {selectedProvider.protocol}
                    </div>
                  </div>
                )}
            </div>
          </div>

          {/* Other provider */}
          {selectedProvider?.id ===
            "other" && (
            <div className="rounded-xl border border-blue-100 bg-white p-4">
              <label
                htmlFor="other-provider-name"
                className="block text-xs font-bold uppercase tracking-wider text-slate-500"
              >
                Enter Inverter /
                Monitoring Brand
              </label>

              <div className="mt-2 flex flex-col gap-3 md:flex-row">
                <input
                  id="other-provider-name"
                  type="text"
                  value={
                    otherProviderName
                  }
                  onChange={(event) =>
                    setOtherProviderName(
                      event.target.value
                    )
                  }
                  placeholder="Example: Brand or monitoring platform name"
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />

                <div className="flex items-center rounded-xl bg-slate-50 px-4 py-3 text-xs font-medium text-slate-500">
                  Connector will be
                  configured through
                  an approved API,
                  gateway or adapter.
                </div>
              </div>
            </div>
          )}

          {/* Selected provider information */}
          {selectedProvider && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-extrabold text-navy-dark">
                  {selectedProvider.id ===
                    "other" &&
                  otherProviderName.trim()
                    ? otherProviderName.trim()
                    : selectedProvider.name}
                </span>

                {selectedProvider.id ===
                  "enphase" &&
                isEnphaseConnected ? (
                  <StatusBadge
                    type="success"
                    text={
                      enphaseConnectionMode ===
                      "demo"
                        ? "Demo Integration Connected"
                        : "Connected"
                    }
                  />
                ) : selectedProvider.id ===
                  "ksolare" &&
                  isKSolareConnected ? (
                  <StatusBadge
                    type="warning"
                    text="Simulator Connected"
                  />
                ) : selectedProvider.integration ===
                  "available" ? (
                  <StatusBadge
                    type="success"
                    text="Connector Available"
                  />
                ) : selectedProvider.integration ===
                  "in_progress" ? (
                  <StatusBadge
                    type="info"
                    text="Integration In Progress"
                  />
                ) : (
                  <StatusBadge
                    type="neutral"
                    text="Upcoming Integration"
                  />
                )}
              </div>

              <p className="mt-2 text-xs text-slate-500">
                {selectedProvider.id ===
                  "other" &&
                otherProviderName.trim()
                  ? "Other inverter / monitoring platform"
                  : selectedProvider.category}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                  <Cpu className="h-3 w-3" />
                  {selectedProvider.protocol}
                </span>

                {selectedProvider.integration ===
                  "in_progress" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-700">
                    <ShieldCheck className="h-3 w-3" />
                    Current Integration Track
                  </span>
                )}
              </div>

              {selectedProvider.id ===
                "enphase" && (
                <>
                  <p className="mt-3 text-xs leading-relaxed text-slate-500">
                    SolarIQ+ uses the
                    Enphase OAuth
                    integration for
                    authorized
                    system-owner
                    connections.
                  </p>

                  {enphaseConnectionMode ===
                    "demo" && (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                      <div className="text-xs font-extrabold uppercase tracking-wider text-amber-700">
                        Demo Integration
                        Data
                      </div>

                      <p className="mt-1 text-xs leading-relaxed text-amber-700">
                        {dataCoverageDays}{" "}
                        days of generated
                        Enphase integration
                        data are being used
                        for this project.
                        This is not real
                        inverter/customer
                        data.
                      </p>
                    </div>
                  )}

                  {enphaseConnectionMode ===
                    "real" && (
                    <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                      <div className="text-xs font-extrabold uppercase tracking-wider text-emerald-700">
                        Real Enphase
                        Connection
                      </div>

                      <p className="mt-1 text-xs leading-relaxed text-emerald-700">
                        Authorized Enphase
                        monitoring data
                        is connected to
                        this SolarIQ+
                        project.
                      </p>
                    </div>
                  )}
                </>
              )}

              {selectedProvider.id ===
                "ksolare" && (
                <>
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />

                      <span className="text-xs font-extrabold uppercase tracking-wider text-amber-700">
                        KSolare Data Mode
                      </span>
                    </div>

                    <p className="mt-2 text-xs leading-relaxed text-amber-700">
                      The current local
                      KSolare connection
                      is running in simulator
                      mode until a physical
                      inverter communication
                      interface is attached.
                    </p>
                  </div>

                  {isKSolareConnected && (
                    <div className="mt-4 grid gap-3 md:grid-cols-4">
                      <TelemetryCard
                        label="Live Power"
                        value={
                          ksolareReading?.power_kw !=
                          null
                            ? `${Number(
                                ksolareReading.power_kw
                              ).toFixed(
                                3
                              )} kW`
                            : "—"
                        }
                        icon={
                          Zap
                        }
                      />

                      <TelemetryCard
                        label="Energy Today"
                        value={
                          ksolareReading?.energy_kwh !=
                          null
                            ? `${Number(
                                ksolareReading.energy_kwh
                              ).toFixed(
                                2
                              )} kWh`
                            : "—"
                        }
                        icon={
                          Sun
                        }
                      />

                      <TelemetryCard
                        label="Status"
                        value={
                          ksolareReading?.inverter_status ||
                          "—"
                        }
                        icon={
                          Activity
                        }
                      />

                      <TelemetryCard
                        label="Data Mode"
                        value="SIMULATOR"
                        icon={
                          Database
                        }
                      />
                    </div>
                  )}

                  {isKSolareConnected && (
                    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="grid gap-4 md:grid-cols-4">
                        <TechnicalMetric
                          label="System ID"
                          value={
                            ksolareSystem?.external_system_id ||
                            ksolareDetails?.external_system_id ||
                            "—"
                          }
                        />

                        <TechnicalMetric
                          label="Manufacturer"
                          value={
                            ksolareSystem?.provider ||
                            "KSolare"
                          }
                        />

                        <TechnicalMetric
                          label="Model"
                          value={
                            ksolareSystem?.name ||
                            "KSolare"
                          }
                        />

                        <TechnicalMetric
                          label="Last Updated"
                          value={
                            ksolareLastUpdated
                              ? ksolareLastUpdated.toLocaleTimeString()
                              : "—"
                          }
                        />
                      </div>

                      {Object.keys(
                        ksolareRaw
                      ).length >
                        0 && (
                        <div className="mt-4 grid gap-3 md:grid-cols-4">
                          <TechnicalMetric
                            label="PV Voltage"
                            value={
                              formatMetric(
                                ksolareRaw.pv1_voltage_v,
                                " V"
                              )
                            }
                          />

                          <TechnicalMetric
                            label="PV Current"
                            value={
                              formatMetric(
                                ksolareRaw.pv1_current_a,
                                " A"
                              )
                            }
                          />

                          <TechnicalMetric
                            label="Grid Frequency"
                            value={
                              formatMetric(
                                ksolareRaw.grid_frequency_hz,
                                " Hz"
                              )
                            }
                          />

                          <TechnicalMetric
                            label="Power Factor"
                            value={
                              formatMetric(
                                ksolareRaw.power_factor,
                                ""
                              )
                            }
                          />
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {selectedProvider.id ===
                "other" && (
                <p className="mt-3 text-xs leading-relaxed text-slate-500">
                  If your inverter is
                  not listed, enter its
                  brand above. SolarIQ+
                  is designed to extend
                  support through approved
                  monitoring APIs,
                  SunSpec/Modbus gateways
                  and manufacturer-specific
                  adapters.
                </p>
              )}
            </div>
          )}

          {message && (
            <div className="rounded-xl border border-blue-100 bg-white px-4 py-3 text-xs font-medium text-slate-600">
              {message}
            </div>
          )}
        </div>
      </div>

      {/* Current generation */}
      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
            <Sun className="h-4 w-4" />
            Latest Generation
          </div>

          <div className="mt-4">
            <div className="text-4xl font-extrabold text-navy-dark">
              {latest
                ? Number(
                    latest.actual_generation_kwh ||
                      0
                  ).toFixed(2)
                : "—"}

              <span className="ml-2 text-base font-bold text-slate-400">
                kWh
              </span>
            </div>

            <p className="mt-2 text-sm text-slate-500">
              {latest
                ? `${latest.reading_date} · ${formatSource(
                    latest
                  )}`
                : "Waiting for generation observations."}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
            <CloudSun className="h-4 w-4" />
            AI Monitoring
          </div>

          <div className="mt-4">
            <div className="text-lg font-extrabold text-navy-dark">
              {readings.length >
              0
                ? "Generation data connected"
                : "Awaiting generation data"}
            </div>

            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              SolarIQ+ combines
              generation observations
              with weather data to
              estimate expected
              production and identify
              unusual system behavior.
            </p>

            {hasEnphaseDemoData && (
              <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                <Database className="h-3 w-3" />
                Enphase demo
                integration
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Generation summary */}
      {readings.length > 0 && (
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <MiniMetric
            label="Records"
            value={String(
              readings.length
            )}
          />

          <MiniMetric
            label="Total Generation"
            value={`${totalGeneration.toFixed(
              2
            )} kWh`}
          />

          <MiniMetric
            label="Data Source"
            value={
              hasEnphaseDemoData ||
              hasRealEnphaseData
                ? "Enphase"
                : "Monitoring"
            }
          />
        </div>
      )}

      {/* Generation history */}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <h2 className="font-extrabold text-navy-dark">
              Generation History
            </h2>

            <p className="mt-1 text-xs text-slate-500">
              Project-linked observations
              collected by SolarIQ+.
            </p>
          </div>

          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
            {readings.length}{" "}
            records
          </span>
        </div>

        {loadingGeneration ? (
          <div className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading generation
            history...
          </div>
        ) : readings.length ===
          0 ? (
          <div className="px-6 py-12 text-center">
            <Database className="mx-auto h-8 w-8 text-slate-300" />

            <p className="mt-3 text-sm font-bold text-slate-700">
              No generation history
              yet
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Connect an inverter
              monitoring platform to
              begin automatic data
              collection.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-400">
                  <th className="px-6 py-3 font-bold">
                    Date
                  </th>

                  <th className="px-6 py-3 font-bold">
                    Generation
                  </th>

                  <th className="px-6 py-3 font-bold">
                    Source
                  </th>
                </tr>
              </thead>

              <tbody>
                {readings.map(
                  (reading) => (
                    <tr
                      key={`${reading.reading_date}-${reading.source}`}
                      className="border-b border-slate-50 last:border-0"
                    >
                      <td className="px-6 py-4 text-sm font-semibold text-slate-700">
                        {
                          reading.reading_date
                        }
                      </td>

                      <td className="px-6 py-4 text-sm font-bold text-navy-dark">
                        {Number(
                          reading.actual_generation_kwh ||
                            0
                        ).toFixed(
                          2
                        )}{" "}
                        kWh
                      </td>

                      <td className="px-6 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${
                            reading.demo ===
                              true ||
                            reading.data_mode ===
                              "demo" ||
                            reading.source ===
                              "demo_enphase_adapter"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-blue-50 text-blue-700"
                          }`}
                        >
                          {formatSource(
                            reading
                          )}
                        </span>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Monitoring pipeline */}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-blue-600" />

          <h2 className="font-extrabold text-navy-dark">
            SolarIQ+ Monitoring
            Pipeline
          </h2>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-5">
          <PipelineStep
            number="01"
            title="Inverter"
            text="Generation data"
          />

          <PipelineStep
            number="02"
            title="Weather"
            text="Solar conditions"
          />

          <PipelineStep
            number="03"
            title="Expected"
            text="AI prediction"
          />

          <PipelineStep
            number="04"
            title="Fingerprint"
            text="Normal behavior"
          />

          <PipelineStep
            number="05"
            title="Decision"
            text="Monitoring signal"
          />
        </div>
      </div>
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| Provider Option
|--------------------------------------------------------------------------
*/

function ProviderOption({
  provider,
  selected,
  onSelect,
}) {
  const isCurrent =
    provider.integration ===
      "available" ||
    provider.integration ===
      "in_progress";

  return (
    <button
      type="button"
      onClick={() =>
        onSelect(provider)
      }
      className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left transition ${
        selected
          ? "bg-blue-50"
          : "hover:bg-slate-50"
      }`}
    >
      <div className="min-w-0">
        <div
          className={`flex items-center gap-2 text-sm font-bold ${
            selected
              ? "text-blue-700"
              : "text-slate-800"
          }`}
        >
          {provider.name}

          {isCurrent && (
            <span
              className={`rounded-full px-2 py-0.5 text-[8px] font-extrabold uppercase tracking-wider ${
                provider.integration ===
                "available"
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-blue-100 text-blue-700"
              }`}
            >
              {provider.integration ===
              "available"
                ? "Active"
                : "In Progress"}
            </span>
          )}
        </div>

        <div className="mt-0.5 text-[11px] text-slate-400">
          {provider.category}
        </div>

        <div className="mt-0.5 text-[9px] font-medium text-slate-400">
          {provider.protocol}
        </div>
      </div>

      {selected && (
        <Check className="ml-3 h-4 w-4 shrink-0 text-blue-600" />
      )}
    </button>
  );
}

/*
|--------------------------------------------------------------------------
| Status Badge
|--------------------------------------------------------------------------
*/

function StatusBadge({
  type = "neutral",
  text,
}) {
  const classes = {
    success:
      "bg-emerald-100 text-emerald-700",
    warning:
      "bg-amber-100 text-amber-700",
    info:
      "bg-blue-100 text-blue-700",
    neutral:
      "bg-slate-100 text-slate-500",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${
        classes[type] ||
        classes.neutral
      }`}
    >
      {type === "success" && (
        <CheckCircle2 className="h-3 w-3" />
      )}

      {type === "warning" && (
        <AlertTriangle className="h-3 w-3" />
      )}

      {text}
    </span>
  );
}

/*
|--------------------------------------------------------------------------
| Telemetry Card
|--------------------------------------------------------------------------
*/

function TelemetryCard({
  label,
  value,
  icon: Icon,
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>

      <div className="mt-2 text-lg font-extrabold text-navy-dark">
        {value}
      </div>
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| Technical Metric
|--------------------------------------------------------------------------
*/

function TechnicalMetric({
  label,
  value,
}) {
  return (
    <div>
      <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
        {label}
      </div>

      <div className="mt-1 break-words text-xs font-extrabold text-slate-700">
        {value}
      </div>
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| Summary Card
|--------------------------------------------------------------------------
*/

function SummaryCard({
  icon: Icon,
  label,
  value,
  valueClass = "text-navy-dark",
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
        <Icon className="h-4 w-4" />
        {label}
      </div>

      <div
        className={`mt-3 text-xl font-extrabold ${valueClass}`}
      >
        {value}
      </div>
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| Mini Metric
|--------------------------------------------------------------------------
*/

function MiniMetric({
  label,
  value,
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
        {label}
      </div>

      <div className="mt-1 text-lg font-extrabold text-navy-dark">
        {value}
      </div>
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| Pipeline Step
|--------------------------------------------------------------------------
*/

function PipelineStep({
  number,
  title,
  text,
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-[10px] font-extrabold tracking-widest text-blue-600">
        {number}
      </div>

      <div className="mt-2 text-sm font-extrabold text-navy-dark">
        {title}
      </div>

      <div className="mt-1 text-xs text-slate-500">
        {text}
      </div>
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| Formatting helpers
|--------------------------------------------------------------------------
*/

function formatSource(
  reading
) {
  if (
    reading?.demo === true ||
    reading?.data_mode === "demo" ||
    reading?.source ===
      "demo_enphase_adapter"
  ) {
    return "Enphase Demo";
  }

  if (
    reading?.provider ===
      "Enphase" ||
    reading?.source ===
      "enphase_api"
  ) {
    return "Enphase";
  }

  if (reading?.source) {
    return reading.source;
  }

  return "Monitoring";
}

function getUniqueDateCount(
  readings
) {
  const dates = new Set();

  readings.forEach(
    (reading) => {
      if (
        reading?.reading_date
      ) {
        dates.add(
          reading.reading_date
        );
      }
    }
  );

  return dates.size;
}

function calculateMonitoringDay(
  startDate
) {
  try {
    const start =
      new Date(startDate);

    const today =
      new Date();

    start.setHours(
      0,
      0,
      0,
      0
    );

    today.setHours(
      0,
      0,
      0,
      0
    );

    const diff =
      Math.floor(
        (today.getTime() -
          start.getTime()) /
          (1000 *
            60 *
            60 *
            24)
      ) + 1;

    return `Day ${Math.max(
      1,
      diff
    )}`;
  } catch {
    return "Day 1";
  }
}

function formatMetric(
  value,
  suffix = ""
) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return "—";
  }

  const numeric =
    Number(value);

  if (
    Number.isNaN(numeric)
  ) {
    return `${value}${suffix}`;
  }

  return `${numeric.toFixed(
    2
  )}${suffix}`;
}