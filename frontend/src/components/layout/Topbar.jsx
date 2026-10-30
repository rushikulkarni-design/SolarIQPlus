import { useAuth } from "@/context/AuthContext";
import { useProjectContext } from "@/context/ProjectContext";
import {
  ChevronDown,
  MapPin,
  Zap,
  LogOut,
  Leaf,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

export function Topbar() {
  const { user, logout } = useAuth();
  const { activeProject } = useProjectContext();

  const initials = (user?.name || "U")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const projectName =
    activeProject?.name ||
    "New Solar Project";

  const location =
    activeProject?.location ||
    "Set project location";

  const type =
    activeProject?.consumer_type ||
    "Planning workspace";

  const capacity =
    activeProject?.capacity_kw ??
    activeProject?.capacityKw;

  return (
    <header className="hidden lg:flex items-center justify-between h-16 px-8 bg-white border-b border-slate-200 sticky top-0 z-20">
      <div className="flex items-center gap-6">
        <button
          data-testid="project-selector"
          className="flex items-center gap-2.5 text-left group focus:outline-none"
        >
          <div className="h-9 w-9 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center">
            <Leaf className="h-4 w-4 text-emerald-600" />
          </div>

          <div>
            <div className="text-sm font-semibold text-slate-900 flex items-center gap-1 font-display">
              {projectName}
              <ChevronDown className="h-3.5 w-3.5 text-slate-400 group-hover:text-emerald-600" />
            </div>

            <div className="text-xs text-slate-500 flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {location}
            </div>
          </div>
        </button>

        <div className="h-8 w-px bg-slate-200" />

        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Project Type
          </div>
          <div className="text-sm font-semibold text-slate-800">
            {type}
          </div>
        </div>

        {capacity && (
          <>
            <div className="h-8 w-px bg-slate-200" />
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Capacity
              </div>
              <div className="text-sm font-semibold text-emerald-700 font-mono">
                {capacity} kW
              </div>
            </div>
          </>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            data-testid="user-menu"
            className="flex items-center gap-2.5 pl-3 pr-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            <div className="text-right">
              <div className="text-sm font-medium text-slate-900 leading-none">
                {user?.name || "User"}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {user?.email}
              </div>
            </div>

            <div className="h-9 w-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center text-sm font-bold font-display">
              {initials}
            </div>
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal text-xs text-slate-500">
            Signed in as {user?.email}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            data-testid="logout-btn"
            onClick={logout}
            className="text-red-600 focus:text-red-600"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
