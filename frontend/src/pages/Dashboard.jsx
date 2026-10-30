import { Link } from "react-router-dom";

import {
  ArrowRight,
  CheckCircle2,
  FileText,
  Home,
  Calculator,
  Brain,
  Wrench,
  Map,
  WalletCards,
  Sparkles,
} from "lucide-react";

import { useProjectContext } from "@/context/ProjectContext";

import {
  Panel,
  PanelHeader,
} from "@/components/common/Primitives";


const WORKFLOW = [
  {
    label: "Project",
    path: "/planner/project",
    icon: Home,
  },

  {
    label: "Electricity Bill",
    path: "/planner/bill",
    icon: FileText,
  },

  {
    label: "Rooftop",
    path: "/planner/rooftop",
    icon: Map,
  },

  {
    label: "Analysis",
    path: "/planner/analysis",
    icon: Sparkles,
  },

  {
    label: "Recommendation",
    path: "/planner/recommendation",
    icon: CheckCircle2,
  },

  {
    label: "Financials",
    path: "/planner/financials",
    icon: WalletCards,
  },

  {
    label: "Report",
    path: "/planner/report",
    icon: FileText,
  },
];


function ActionCard({
  icon: Icon,
  title,
  description,
  to,
  primary,
}) {

  return (

    <Link
      to={to}
      className={`
        group
        rounded-2xl
        border
        p-5
        transition-all
        hover:-translate-y-0.5
        hover:shadow-lg

        ${
          primary
            ? `
              border-emerald-500
              bg-emerald-600
              text-white
            `
            : `
              border-slate-200
              bg-white
              hover:border-emerald-200
            `
        }
      `}
    >

      <div
        className={`
          flex
          h-11
          w-11
          items-center
          justify-center
          rounded-xl

          ${
            primary
              ? "bg-white/15"
              : "bg-emerald-50 text-emerald-600"
          }
        `}
      >
        <Icon className="h-5 w-5" />
      </div>


      <h3
        className={`
          mt-4
          font-extrabold

          ${
            primary
              ? "text-white"
              : "text-slate-950"
          }
        `}
      >
        {title}
      </h3>


      <p
        className={`
          mt-1.5
          text-sm
          leading-5

          ${
            primary
              ? "text-emerald-50"
              : "text-slate-500"
          }
        `}
      >
        {description}
      </p>


      <div
        className={`
          mt-4
          inline-flex
          items-center
          gap-1.5
          text-xs
          font-bold

          ${
            primary
              ? "text-white"
              : "text-emerald-700"
          }
        `}
      >
        Open

        <ArrowRight
          className="
            h-3.5
            w-3.5
            transition-transform
            group-hover:translate-x-1
          "
        />
      </div>

    </Link>
  );
}


export default function Dashboard() {

  const {
    activeProject,
  } = useProjectContext();


  const project =
    activeProject || {};


  const hasProject =
    Boolean(project.name);


  return (

    <div className="space-y-6">


      {/* ===================================================
          HERO
      =================================================== */}

      <section
        className="
          overflow-hidden
          rounded-3xl
          bg-[#081126]
          text-white
          shadow-xl
        "
      >

        <div
          className="
            relative
            px-6
            py-8
            sm:px-8
            sm:py-10
          "
        >

          <div
            className="
              absolute
              right-0
              top-0
              h-64
              w-64
              rounded-full
              bg-emerald-500/10
              blur-3xl
            "
          />


          <div
            className="
              relative
              max-w-3xl
            "
          >

            <div
              className="
                inline-flex
                items-center
                gap-2
                rounded-full
                border
                border-emerald-400/20
                bg-emerald-400/10
                px-3
                py-1.5
                text-[10px]
                font-bold
                uppercase
                tracking-[0.18em]
                text-emerald-300
              "
            >

              <Sparkles className="h-3.5 w-3.5" />

              AI-powered solar planning

            </div>


            <h1
              className="
                mt-4
                text-3xl
                font-black
                tracking-tight
                sm:text-4xl
              "
            >
              Plan the right solar system
              with SolarIQ+.
            </h1>


            <p
              className="
                mt-3
                max-w-2xl
                text-sm
                leading-6
                text-slate-300
              "
            >
              From electricity-bill analysis and
              rooftop assessment to shadow analysis,
              system sizing, savings and financial
              recommendations — everything is handled
              in one guided workflow.
            </p>


            <div
              className="
                mt-6
                flex
                flex-wrap
                gap-3
              "
            >

              <Link
                to="/planner/project"
                className="
                  inline-flex
                  items-center
                  gap-2
                  rounded-xl
                  bg-slate-300
                  px-5
                  py-3
                  text-sm
                  font-extrabold
                  text-white
                  hover:bg-emerald-400
                "
              >

                {hasProject
                  ? "Continue Planning"
                  : "Start Solar Plan"}

                <ArrowRight className="h-4 w-4" />

              </Link>


              <Link
                to="/simulator"
                className="
                  inline-flex
                  items-center
                  gap-2
                  rounded-xl
                  border
                  border-white/15
                  bg-white/5
                  px-5
                  py-3
                  text-sm
                  font-bold
                  text-white
                  hover:bg-white/10
                "
              >

                <Calculator className="h-4 w-4" />

                Try Simulator

              </Link>

            </div>

          </div>

        </div>

      </section>


      {/* ===================================================
          PROJECT STATUS
      =================================================== */}

      {hasProject ? (

        <section
          className="
            grid
            gap-4
            md:grid-cols-3
          "
        >

          {/* ACTIVE PROJECT */}

          <div
            className="
              rounded-2xl
              border
              border-emerald-100
              bg-emerald-50
              p-5
            "
          >

            <div
              className="
                text-[10px]
                font-bold
                uppercase
                tracking-wider
                text-emerald-700
              "
            >
              Active Project
            </div>


            <div
              className="
                mt-2
                text-xl
                font-extrabold
                text-slate-950
              "
            >
              {project.name}
            </div>


            <div
              className="
                mt-1
                text-sm
                text-slate-500
              "
            >
              {project.location ||
                "Location not set"}

              {" · "}

              {project.consumer_type ||
                "Solar project"}
            </div>

          </div>


          {/* CURRENT STAGE */}

          <div
            className="
              rounded-2xl
              border
              border-slate-200
              bg-white
              p-5
            "
          >

            <div
              className="
                text-[10px]
                font-bold
                uppercase
                tracking-wider
                text-slate-400
              "
            >
              Current Stage
            </div>


            <div
              className="
                mt-2
                text-xl
                font-extrabold
                text-slate-950
              "
            >
              {project.system_status || "Not recorded"}
            </div>


            <div
              className="
                mt-1
                text-sm
                text-slate-500
              "
            >
              Current status from your saved project.
            </div>

          </div>


          {/* STATUS */}

          <div
            className="
              rounded-2xl
              border
              border-slate-200
              bg-white
              p-5
            "
          >

            <div
              className="
                text-[10px]
                font-bold
                uppercase
                tracking-wider
                text-slate-400
              "
            >
              System Status
            </div>


            <div
              className="
                mt-2
                flex
                items-center
                gap-2
                text-xl
                font-extrabold
                text-emerald-700
              "
            >

              <span
                className="
                  h-2.5
                  w-2.5
                  rounded-full
                  bg-slate-300
                "
              />

              {project.system_status || "Not recorded"}

            </div>


            <div
              className="
                mt-1
                text-sm
                text-slate-500
              "
            >
              Open the project planner to continue your workflow.
            </div>

          </div>

        </section>

      ) : (

        /* NO PROJECT */

        <section
          className="
            rounded-2xl
            border
            border-emerald-200
            bg-emerald-50
            p-6
          "
        >

          <div
            className="
              flex
              flex-col
              gap-4
              sm:flex-row
              sm:items-center
              sm:justify-between
            "
          >

            <div>

              <div
                className="
                  text-sm
                  font-extrabold
                  text-slate-950
                "
              >
                No solar project has been
                started yet.
              </div>


              <p
                className="
                  mt-1
                  text-sm
                  text-slate-600
                "
              >
                Create the project first.
                SolarIQ+ will then guide you
                through bill, rooftop, analysis,
                recommendation and financial stages.
              </p>

            </div>


            <Link
              to="/planner/project"
              className="
                inline-flex
                shrink-0
                items-center
                justify-center
                gap-2
                rounded-xl
                bg-emerald-600
                px-5
                py-3
                text-sm
                font-extrabold
                text-white
                hover:bg-emerald-700
              "
            >
              Create Project
              <ArrowRight className="h-4 w-4" />
            </Link>

          </div>

        </section>

      )}


      {/* ===================================================
          WORKFLOW
      =================================================== */}

      <Panel>

        <PanelHeader
          title="Solar planning workflow"
          hint="One guided process — no separate planning modules in the sidebar."
        />


        <div
          className="
            grid
            gap-2
            p-5
            sm:grid-cols-2
            lg:grid-cols-4
          "
        >

          {WORKFLOW.map(
            (step, index) => {

              const Icon =
                step.icon;

              const isFirst =
                index === 0;


              return (

                <Link
                  key={step.path}
                  to={step.path}
                  className="
                    group
                    rounded-xl
                    border
                    border-slate-200
                    bg-white
                    p-4
                    hover:border-emerald-300
                    hover:bg-emerald-50/40
                  "
                >

                  <div
                    className="
                      flex
                      items-center
                      gap-3
                    "
                  >

                    <div
                      className={`
                        flex
                        h-9
                        w-9
                        items-center
                        justify-center
                        rounded-lg

                        ${
                          isFirst &&
                          hasProject
                            ? `
                              bg-emerald-600
                              text-white
                            `
                            : `
                              bg-emerald-50
                              text-emerald-600
                            `
                        }
                      `}
                    >
                      <Icon className="h-4 w-4" />
                    </div>


                    <div>

                      <div
                        className="
                          text-[9px]
                          font-bold
                          uppercase
                          tracking-wider
                          text-slate-400
                        "
                      >
                        0{index + 1}
                      </div>


                      <div
                        className="
                          text-sm
                          font-bold
                          text-slate-800
                        "
                      >
                        {step.label}
                      </div>

                    </div>

                  </div>

                </Link>

              );

            }
          )}

        </div>

      </Panel>


      {/* ===================================================
          QUICK ACTIONS
      =================================================== */}

      <section
        className="
          grid
          gap-4
          md:grid-cols-3
        "
      >

        <ActionCard
          icon={Brain}
          title="AI Assistant"
          description="Ask solar, maintenance and project questions in natural language."
          to="/monitoring/ai"
          primary
        />


        <ActionCard
          icon={Wrench}
          title="Issue Diagnosis"
          description="Diagnose common solar issues and turn recommendations into maintenance tasks."
          to="/monitoring/issue-diagnosis"
        />


        <ActionCard
          icon={Calculator}
          title="Solar Simulator"
          description="Explore system scenarios and understand how planning choices affect the result."
          to="/simulator"
        />

      </section>


      {/* ===================================================
          PRODUCT POSITIONING
      =================================================== */}

      <div
        className="
          rounded-2xl
          border
          border-slate-200
          bg-white
          px-5
          py-4
          text-sm
          text-slate-500
        "
      >

        <span
          className="
            font-bold
            text-slate-800
          "
        >
          SolarIQ+ focus:
        </span>{" "}

        AI-powered solar planning and decision
        support from project setup through
        recommendation and financial analysis.

      </div>

    </div>
  );
}