import { Outlet, useLocation, useNavigate, Link } from "react-router-dom";
import { SectionHeading, Panel } from "@/components/common/Primitives";
import { useProjectContext } from "@/context/ProjectContext";
import { cn } from "@/lib/utils";
import { Check, FolderPlus, Loader2, MapPin, Sparkles } from "lucide-react";

const SHADOW_CHOICE_PREFIX = "solariq_shadow_choice_";

export const PLANNER_STEPS = [
  { n: "01", label: "Project", to: "/planner/project" },
  { n: "02", label: "Bill", to: "/planner/bill" },
  { n: "03", label: "Rooftop", to: "/planner/rooftop" },
  {
    n: "04",
    label: "Shadow",
    to: "/planner/shadow",
    conditional: true,
  },
  { n: "05", label: "Analysis", to: "/planner/analysis" },
  { n: "06", label: "Recommendation", to: "/planner/recommendation" },
  { n: "07", label: "Financials", to: "/planner/financials" },
  { n: "08", label: "Report", to: "/planner/report" },
];

function getShadowChoice(projectId) {
  if (!projectId) return null;

  try {
    return localStorage.getItem(
      `${SHADOW_CHOICE_PREFIX}${projectId}`
    );
  } catch {
    return null;
  }
}

function getVisiblePlannerSteps(projectId) {
  const shadowChoice = getShadowChoice(projectId);

  return PLANNER_STEPS
    .filter((step) => !step.conditional || shadowChoice === "yes")
    .map((step, index) => ({
      ...step,
      n: String(index + 1).padStart(2, "0"),
    }));
}

export function PlannerLayout() {
  const { pathname } = useLocation();
  const { activeProject, activeProjectId, isLoading } =
    useProjectContext();

  const shadowChoice = getShadowChoice(activeProjectId);
  const visibleSteps = getVisiblePlannerSteps(activeProjectId);

  const activeIdx = visibleSteps.findIndex((step) =>
    pathname.startsWith(step.to)
  );

  return (
    <div className="space-y-5">
      <SectionHeading
        eyebrow="Solar Planner"
        title="Plan a solar installation"
        description="One guided workflow. Enter only the information SolarIQ+ needs, then move through bill analysis, rooftop assessment, recommendation and financials."
        right={
          isLoading ? (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading project…
            </div>
          ) : activeProject ? (
            <div
              data-testid="active-project-badge"
              className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-4 py-2.5 shadow-sm"
            >
              <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 font-mono">
                Active Project
              </div>
              <div className="text-sm font-semibold text-slate-900 leading-tight">
                {activeProject.name}
              </div>
              <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                <MapPin className="h-3 w-3" />
                {activeProject.location || "Location not set"} ·{" "}
                {activeProject.consumer_type || "Residential"}
              </div>
            </div>
          ) : null
        }
      />

      <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-white px-4 py-2.5 shadow-sm">
        <Sparkles className="h-4 w-4 text-emerald-600" />
        <span className="text-xs font-semibold text-slate-600">
          Guided planning workflow
        </span>
        <span className="text-xs text-slate-400">
          — the sidebar stays simple; this stepper controls the planning stages.
        </span>
      </div>

      <nav className="bg-white border border-slate-200 rounded-xl overflow-x-auto siq-scroll shadow-sm">
        <ol className="flex min-w-max">
          {visibleSteps.map((step, index) => {
            const done = index < activeIdx;
            const active = index === activeIdx;

            const shadowAvailable =
              step.label === "Shadow" &&
              shadowChoice === "yes" &&
              !active &&
              !done;

            return (
              <li
                key={step.to}
                className="flex-1 min-w-[120px]"
              >
                <Link
                  to={step.to}
                  data-testid={`step-${step.label.toLowerCase()}`}
                  className={cn(
                    "relative flex items-center gap-3 px-4 py-3 border-r border-slate-200 last:border-r-0 transition-all duration-200 group",
                    active && "bg-[#081126]",
                    done && "bg-emerald-50",
                    !active &&
                      !done &&
                      !shadowAvailable &&
                      "hover:bg-slate-50",
                    shadowAvailable &&
                      "bg-emerald-50 border-b-2 border-b-emerald-500 hover:bg-emerald-100"
                  )}
                >
                  {active && (
                    <span className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500" />
                  )}

                  {shadowAvailable && (
                    <span className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500" />
                  )}

                  <span
                    className={cn(
                      "h-7 w-7 rounded-lg flex items-center justify-center text-xs font-bold font-mono shrink-0 transition-all",
                      active &&
                        "bg-emerald-500 text-white ring-2 ring-emerald-400/30",
                      !active &&
                        done &&
                        "bg-emerald-500 text-white",
                      !active &&
                        !done &&
                        shadowAvailable &&
                        "bg-emerald-100 text-emerald-700 ring-2 ring-emerald-200",
                      !active &&
                        !done &&
                        !shadowAvailable &&
                        "bg-slate-100 text-slate-400"
                    )}
                  >
                    {done ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      step.n
                    )}
                  </span>

                  <span
                    className={cn(
                      "text-xs font-semibold uppercase tracking-wide transition-colors",
                      active && "text-white",
                      !active && done && "text-emerald-800",
                      !active &&
                        !done &&
                        shadowAvailable &&
                        "text-emerald-800",
                      !active &&
                        !done &&
                        !shadowAvailable &&
                        "text-slate-400"
                    )}
                  >
                    {step.label}
                  </span>

                  {shadowAvailable && (
                    <span className="ml-auto mr-1 hidden lg:inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-800">
                      Selected
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ol>
      </nav>

      <Outlet />
    </div>
  );
}

export function StepFooter({
  backTo,
  nextTo,
  nextLabel = "Continue",
  onNext,
}) {
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-between pt-2">
      {backTo ? (
        <Link
          to={backTo}
          className="text-sm text-slate-500 hover:text-emerald-700 transition-colors"
          data-testid="step-back"
        >
          ← Back
        </Link>
      ) : (
        <span />
      )}

      {nextTo && (
        <button
          data-testid="step-next"
          onClick={async () => {
            try {
              await onNext?.();
            } catch {
              return;
            }

            navigate(nextTo);
          }}
          className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors shadow-sm shadow-emerald-900/10"
        >
          {nextLabel} →
        </button>
      )}
    </div>
  );
}

export function NoActiveProject() {
  return (
    <Panel
      className="p-10 sm:p-14 flex flex-col items-center text-center"
      data-testid="no-active-project"
    >
      <div className="h-14 w-14 rounded-xl bg-emerald-50 flex items-center justify-center">
        <FolderPlus className="h-7 w-7 text-emerald-600" />
      </div>

      <h3 className="mt-4 text-lg font-bold text-slate-900 font-display">
        No active project
      </h3>

      <p className="mt-1.5 text-sm text-slate-500 max-w-sm leading-relaxed">
        Create a project first. Bill, rooftop and shadow analysis are stored against that project.
      </p>

      <Link
        to="/planner/project"
        data-testid="goto-project-step"
        className="mt-5 inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
      >
        <FolderPlus className="h-4 w-4" />
        Start a project
      </Link>
    </Panel>
  );
}
