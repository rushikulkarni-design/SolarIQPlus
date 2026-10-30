import {
  NavLink,
  Outlet,
  useNavigate,
} from "react-router-dom";

import {
  Activity,
  BarChart3,
  CloudSun,
  BrainCircuit,
  Wrench,
  AlertTriangle,
  PlayCircle,
  ArrowLeft,
  Settings,
} from "lucide-react";

import { useProjectContext } from "@/context/ProjectContext";

const navItems = [
  {
    to: "/monitoring",
    label: "Overview",
    icon: Activity,
    end: true,
  },
  {
    to: "/monitoring/generation",
    label: "Generation",
    icon: BarChart3,
  },
  {
    to: "/monitoring/weather",
    label: "Weather",
    icon: CloudSun,
  },
  {
    to: "/monitoring/ai",
    label: "AI Insights",
    icon: BrainCircuit,
  },
  {
    to: "/monitoring/issue-diagnosis",
    label: "Issue Diagnosis",
    icon: AlertTriangle,
  },
  {
    to: "/maintenance",
    label: "Maintenance",
    icon: Wrench,
  },
  {
    to: "/simulator",
    label: "Simulation",
    icon: PlayCircle,
  },
];

export function MonitoringLayout() {
  const navigate = useNavigate();
  const { activeProject } = useProjectContext();

  const projectName =
    activeProject?.name ||
    activeProject?.project_name ||
    "Existing Solar System";

  const capacity =
    activeProject?.capacity_kw ??
    activeProject?.capacityKw ??
    activeProject?.system_capacity_kw ??
    activeProject?.systemCapacityKw;

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex">

      {/* SIDEBAR */}
      <aside className="hidden lg:flex w-64 shrink-0 bg-white border-r border-slate-200 flex-col">

        {/* BRAND */}
        <div className="h-16 px-5 flex items-center border-b border-slate-100">
          <div>
            <div className="font-display font-extrabold text-xl text-navy-dark">
              SolarIQ<span className="text-blue-600">+</span>
            </div>

            <div className="text-[9px] uppercase tracking-[0.16em] text-slate-400 font-semibold">
              System Monitoring
            </div>
          </div>
        </div>

        {/* PROJECT */}
        <div className="px-4 py-4">
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">

            <div className="text-[10px] uppercase tracking-wider text-blue-600 font-bold">
              Existing System
            </div>

            <div className="mt-1 text-sm font-bold text-navy-dark truncate">
              {projectName}
            </div>

            <div className="mt-0.5 text-xs text-slate-500">
              {capacity
                ? `${capacity} kW system`
                : "Capacity not provided"}
            </div>

          </div>
        </div>

        {/* NAVIGATION */}
        <nav className="px-3 space-y-1">

          {navItems.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition ${
                    isActive
                      ? "bg-blue-50 text-blue-700"
                      : "text-slate-600 hover:bg-slate-50 hover:text-navy-dark"
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            );
          })}

        </nav>

        {/* BOTTOM */}
        <div className="mt-auto p-4 border-t border-slate-100 space-y-2">

          <button
            type="button"
            onClick={() => navigate("/settings")}
            className="w-full flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            <Settings className="h-4 w-4" />
            Settings
          </button>

          <button
            type="button"
            onClick={() => navigate("/planner/project")}
            className="w-full flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Project setup
          </button>

        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 min-w-0">

        {/* MOBILE HEADER */}
        <div className="lg:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">

          <div>
            <div className="font-display font-extrabold text-lg text-navy-dark">
              SolarIQ<span className="text-blue-600">+</span>
            </div>

            <div className="text-[9px] uppercase tracking-wider text-slate-400">
              Monitoring
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate("/planner/project")}
            className="text-xs font-semibold text-blue-600"
          >
            Project setup
          </button>

        </div>

        <Outlet />

      </main>
    </div>
  );
}