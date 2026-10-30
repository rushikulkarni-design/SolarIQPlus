import {
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";

import { Sidebar } from "./Sidebar";
import {
  MobileNav,
  MobileTopbar,
} from "./MobileNav";

import { Topbar } from "./Topbar";

import {
  Bot,
  Calculator,
  Sparkles,
} from "lucide-react";


function FloatingTools() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const onSimulator =
    pathname === "/simulator";

  const onAssistant =
    pathname === "/monitoring/ai";


  return (
    <div className="fixed right-6 bottom-7 z-50 flex flex-col items-center gap-4">

      {/* =========================
          AI ASSISTANT
      ========================= */}

      {!onAssistant && (
        <div className="group relative">

          <button
            type="button"
            aria-label="Open SolarIQ+ AI Assistant"
            onClick={() =>
              navigate("/monitoring/ai")
            }
            className="
              relative
              flex
              h-[72px]
              w-[72px]
              items-center
              justify-center
              rounded-full
              border-[5px]
              border-white
              bg-emerald-600
              text-white
              shadow-2xl
              shadow-emerald-900/25
              transition-all
              duration-200
              hover:-translate-y-1
              hover:scale-105
              hover:bg-emerald-700
              focus:outline-none
              focus:ring-4
              focus:ring-emerald-200
            "
          >

            <Bot className="h-9 w-9" />

            <span
              className="
                absolute
                -right-0.5
                -top-0.5
                h-4
                w-4
                rounded-full
                border-2
                border-white
                bg-emerald-300
              "
            />

          </button>


          <span
            className="
              pointer-events-none
              absolute
              right-[calc(100%+12px)]
              top-1/2
              -translate-y-1/2
              whitespace-nowrap
              rounded-xl
              bg-slate-950
              px-3
              py-2
              text-xs
              font-bold
              text-white
              opacity-0
              shadow-xl
              transition-opacity
              group-hover:opacity-100
            "
          >
            AI Assistant
          </span>

        </div>
      )}


      {/* =========================
          SOLAR SIMULATOR
      ========================= */}

      {!onSimulator && (
        <div className="group relative">

          <button
            type="button"
            aria-label="Open Solar Simulator"
            onClick={() =>
              navigate("/simulator")
            }
            className="
              flex
              h-[62px]
              w-[62px]
              items-center
              justify-center
              rounded-full
              border-[5px]
              border-white
              bg-emerald-50
              text-emerald-700
              shadow-xl
              shadow-emerald-900/15
              transition-all
              duration-200
              hover:-translate-y-1
              hover:scale-105
              hover:bg-emerald-100
              focus:outline-none
              focus:ring-4
              focus:ring-emerald-100
            "
          >

            <Calculator className="h-8 w-8" />

          </button>


          <span
            className="
              pointer-events-none
              absolute
              right-[calc(100%+12px)]
              top-1/2
              -translate-y-1/2
              whitespace-nowrap
              rounded-xl
              bg-slate-950
              px-3
              py-2
              text-xs
              font-bold
              text-white
              opacity-0
              shadow-xl
              transition-opacity
              group-hover:opacity-100
            "
          >
            Solar Simulator
          </span>

        </div>
      )}


      {pathname !== "/dashboard" &&
        pathname !== "/simulator" && (
          <span
            className="
              hidden
              sm:flex
              items-center
              gap-1
              text-[9px]
              font-semibold
              uppercase
              tracking-wider
              text-slate-400
            "
          >
            <Sparkles className="h-2.5 w-2.5" />
            SolarIQ+
          </span>
        )}

    </div>
  );
}


export function AppLayout() {

  return (
    <div className="flex min-h-screen bg-[#F8FAFC]">

      <Sidebar />

      <div className="flex-1 min-w-0 flex flex-col">

        <MobileTopbar />

        <Topbar />

        <main
          className="
            flex-1
            px-4
            sm:px-6
            lg:px-8
            py-6
            pb-28
            lg:pb-10
            max-w-[1500px]
            w-full
            mx-auto
          "
        >
          <Outlet />
        </main>

        <MobileNav />

      </div>


      <FloatingTools />

    </div>
  );
}