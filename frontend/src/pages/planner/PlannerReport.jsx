import { useEffect, useState } from "react";
import { FileDown, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Panel, PanelHeader } from "@/components/common/Primitives";
import { StepFooter } from "./PlannerLayout";
import { api } from "@/lib/api";
import { useProjectContext } from "@/context/ProjectContext";

const STORAGE_KEY = "siq_active_project";

export default function PlannerReport() {
  const {
    activeProject,
    activeProjectId,
    setActiveProject,
  } = useProjectContext();

  const [recoveredProject, setRecoveredProject] =
    useState(null);

  const [loadingProject, setLoadingProject] =
    useState(true);

  const [isExporting, setIsExporting] =
    useState(false);

  useEffect(() => {
    let cancelled = false;

    async function resolveProject() {
      /*
       * First use the normal ProjectContext.
       */
      if (activeProjectId || activeProject?.id) {
        if (!cancelled) {
          setLoadingProject(false);
        }
        return;
      }

      /*
       * Then check localStorage.
       */
      let storedId = null;

      try {
        storedId =
          localStorage.getItem(
            STORAGE_KEY
          );
      } catch {
        storedId = null;
      }

      if (storedId) {
        try {
          const response =
            await api.get(
              `/projects/${storedId}`
            );

          if (
            response.data &&
            !cancelled
          ) {
            setRecoveredProject(
              response.data
            );

            setActiveProject(
              response.data
            );

            setLoadingProject(false);
            return;
          }
        } catch {
          try {
            localStorage.removeItem(
              STORAGE_KEY
            );
          } catch {
            // Ignore storage errors.
          }
        }
      }

      /*
       * No active project exists.
       *
       * Recover the most recently created project.
       * The backend already returns projects newest-first.
       */
      try {
        const response =
          await api.get("/projects");

        const projects =
          Array.isArray(response.data)
            ? response.data
            : [];

        if (
          projects.length > 0 &&
          !cancelled
        ) {
          const latestProject =
            projects[0];

          setRecoveredProject(
            latestProject
          );

          setActiveProject(
            latestProject
          );
        }
      } catch (error) {
        console.error(
          "Unable to recover project:",
          error
        );
      } finally {
        if (!cancelled) {
          setLoadingProject(false);
        }
      }
    }

    resolveProject();

    return () => {
      cancelled = true;
    };
  }, [
    activeProjectId,
    activeProject?.id,
    setActiveProject,
  ]);

  const project =
    activeProject ||
    recoveredProject ||
    {};

  const projectId =
    activeProjectId ||
    activeProject?.id ||
    recoveredProject?.id ||
    null;

  const projectName =
    project.name ||
    project.project_name ||
    "Solar Project";

  const location =
    project.location ||
    "—";

  const consumerType =
    project.consumer_type ||
    project.consumerType ||
    "Residential";

  async function handleExportReport() {
    let finalProjectId =
      projectId;

    /*
     * Final fallback: localStorage.
     */
    if (!finalProjectId) {
      try {
        finalProjectId =
          localStorage.getItem(
            STORAGE_KEY
          );
      } catch {
        finalProjectId = null;
      }
    }

    if (!finalProjectId) {
      toast.error(
        "No project available",
        {
          description:
            "Create a project before exporting the report.",
        }
      );
      return;
    }

    setIsExporting(true);

    try {
      const response =
        await api.get(
          `/projects/${finalProjectId}/report.pdf`,
          {
            responseType: "blob",
          }
        );

      const contentType =
        response.headers?.[
          "content-type"
        ] || "";

      if (
        !contentType.includes(
          "application/pdf"
        )
      ) {
        let message =
          "Unable to generate the PDF report.";

        try {
          const text =
            await response.data.text();

          const parsed =
            JSON.parse(text);

          message =
            parsed?.detail ||
            message;
        } catch {
          // Keep default.
        }

        throw new Error(message);
      }

      const blob =
        new Blob(
          [response.data],
          {
            type:
              "application/pdf",
          }
        );

      const url =
        window.URL.createObjectURL(
          blob
        );

      let filename =
        "SolarIQ+_Solar_Report.pdf";

      const disposition =
        response.headers?.[
          "content-disposition"
        ] || "";

      const filenameMatch =
        disposition.match(
          /filename="?([^"]+)"?/i
        );

      if (filenameMatch?.[1]) {
        filename =
          filenameMatch[1];
      }

      const link =
        document.createElement(
          "a"
        );

      link.href = url;
      link.download =
        filename;

      document.body.appendChild(
        link
      );

      link.click();

      link.remove();

      window.URL.revokeObjectURL(
        url
      );

      toast.success(
        "Report generated",
        {
          description:
            "Your 4-page SolarIQ+ PDF has been downloaded.",
        }
      );
    } catch (error) {
      console.error(
        "SolarIQ+ report export failed:",
        error
      );

      let message =
        "Could not generate the report.";

      if (
        error?.response?.data instanceof
        Blob
      ) {
        try {
          const text =
            await error.response.data.text();

          const parsed =
            JSON.parse(text);

          message =
            parsed?.detail ||
            message;
        } catch {
          // Keep default.
        }
      } else if (
        error?.message
      ) {
        message =
          error.message;
      }

      toast.error(
        "Report export failed",
        {
          description:
            message,
        }
      );
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader
          title="Installation Report"
          hint="Consolidated project planning output"
          right={
            <button
              data-testid="export-report"
              type="button"
              onClick={
                handleExportReport
              }
              disabled={
                loadingProject ||
                isExporting ||
                !projectId
              }
              className="inline-flex items-center gap-1.5 bg-navy-dark hover:bg-navy disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-medium px-3 py-1.5 rounded-md transition-colors"
            >
              {loadingProject ||
              isExporting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {loadingProject
                    ? "Loading project..."
                    : "Generating PDF..."}
                </>
              ) : (
                <>
                  <FileDown className="h-3.5 w-3.5" />
                  Export PDF
                </>
              )}
            </button>
          }
        />

        <div className="p-6">
          <div className="flex items-center gap-2 mb-6">
            <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700 font-medium">
              <CheckCircle2 className="h-4 w-4" />
              Planning workflow complete
            </span>

            <span className="text-xs text-slate-400">
              Generated from current project analysis
            </span>
          </div>

          <div className="grid md:grid-cols-2 gap-x-10 gap-y-6">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-dark border-b border-slate-200 pb-2 mb-2 font-mono">
                PROJECT
              </div>

              <dl className="divide-y divide-slate-100">
                <div className="flex items-center justify-between py-2">
                  <dt className="text-sm text-slate-500">
                    Name
                  </dt>

                  <dd className="text-sm font-medium text-navy-dark font-mono">
                    {projectName}
                  </dd>
                </div>

                <div className="flex items-center justify-between py-2">
                  <dt className="text-sm text-slate-500">
                    Location
                  </dt>

                  <dd className="text-sm font-medium text-navy-dark font-mono">
                    {location}
                  </dd>
                </div>

                <div className="flex items-center justify-between py-2">
                  <dt className="text-sm text-slate-500">
                    Consumer Type
                  </dt>

                  <dd className="text-sm font-medium text-navy-dark font-mono">
                    {consumerType}
                  </dd>
                </div>
              </dl>
            </div>

            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-dark border-b border-slate-200 pb-2 mb-2 font-mono">
                REPORT
              </div>

              <dl className="divide-y divide-slate-100">
                <div className="flex items-center justify-between py-2">
                  <dt className="text-sm text-slate-500">
                    Format
                  </dt>

                  <dd className="text-sm font-medium text-navy-dark font-mono">
                    4-page PDF
                  </dd>
                </div>

                <div className="flex items-center justify-between py-2">
                  <dt className="text-sm text-slate-500">
                    Template
                  </dt>

                  <dd className="text-sm font-medium text-navy-dark font-mono">
                    SolarIQ+ Master
                  </dd>
                </div>

                <div className="flex items-center justify-between py-2">
                  <dt className="text-sm text-slate-500">
                    Output
                  </dt>

                  <dd className="text-sm font-medium text-emerald-700 font-mono">
                    Selectable PDF
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-5">
            <div className="flex items-start gap-3">
              <FileDown className="h-5 w-5 text-amber-dark mt-0.5 shrink-0" />

              <div>
                <div className="text-sm font-semibold text-navy-dark">
                  Adobe Express report template
                </div>

                <p className="text-sm text-slate-500 mt-1 leading-6">
                  Export uses the original four-page
                  SolarIQ+ master templates and fills
                  them with the current project's bill
                  analysis, rooftop assessment, solar
                  recommendation, and financial planning
                  data.
                </p>

                <p className="text-xs text-slate-400 mt-2">
                  The original PDF design is preserved.
                  The report is generated directly by the
                  SolarIQ+ backend.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Panel>

      <StepFooter
        backTo="/planner/financials"
      />
    </div>
  );
}