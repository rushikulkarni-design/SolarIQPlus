import {
  NavLink,
  useLocation,
} from "react-router-dom";

import { NAV } from "@/lib/nav";
import { cn } from "@/lib/utils";


function itemClass(active) {

  return cn(
    `
      group
      relative
      flex
      items-center
      gap-2.5
      px-3
      py-2.5
      rounded-xl
      text-sm
      transition-all
      duration-150
      outline-none
    `,

    "focus-visible:ring-2 focus-visible:ring-emerald-400/60",

    active
      ? `
        bg-emerald-500
        text-white
        font-bold
        shadow-md
        shadow-emerald-950/20
      `
      : `
        text-slate-300
        hover:text-white
        hover:bg-white/5
      `
  );
}


export function Sidebar() {

  const { pathname } = useLocation();


  return (
    <aside
      className="
        hidden
        lg:flex
        flex-col
        w-[250px]
        shrink-0
        bg-[#081126]
        border-r
        border-white/10
        h-screen
        sticky
        top-0
      "
    >

      
      
{/* BRAND */}
<div className="flex items-center gap-3 px-5 h-16 border-b border-white/10 shrink-0">
  <img
    src="/solariq-logo.png"
    alt="SolarIQ+"
    className="h-10 w-10 object-contain shrink-0"
  />

  <div className="leading-none">
    <div className="text-white font-extrabold text-lg tracking-tight">
      SOLARIQ<span className="text-emerald-400">+</span>
    </div>

    <div className="text-[10px] text-slate-400 uppercase tracking-[0.2em] mt-1">
      Solar Intelligence
    </div>
  </div>
</div>



      {/* =========================
          NAVIGATION
      ========================= */}

      <nav
        className="
          flex-1
          overflow-y-auto
          px-3
          py-4
          space-y-1
        "
      >

        {NAV.map((entry) => {

          /* =====================
             SINGLE ITEM
          ===================== */

          if (entry.type === "item") {

            const Icon = entry.icon;

            return (
              <NavLink
                key={entry.to}
                to={entry.to}
                end={entry.end}
                data-testid={
                  `nav-${entry.label
                    .toLowerCase()
                    .replace(/\s+/g, "-")}`
                }
                className={({ isActive }) =>
                  itemClass(isActive)
                }
              >

                <Icon
                  className="
                    h-4
                    w-4
                    shrink-0
                  "
                />

                <span>
                  {entry.label}
                </span>

              </NavLink>
            );
          }


          /* =====================
             GROUP
          ===================== */

          return (
            <div
              key={entry.label}
              className="pt-4"
            >

              <div
                className="
                  px-3
                  pb-1.5
                  text-[10px]
                  font-semibold
                  uppercase
                  tracking-[0.18em]
                  text-slate-500
                  flex
                  items-center
                  gap-2
                "
              >

                <entry.icon
                  className="
                    h-3
                    w-3
                  "
                />

                {entry.label}

              </div>


              <div className="space-y-0.5">

                {entry.children.map((child) => {

                  const Icon = child.icon;

                  return (
                    <NavLink
                      key={child.to}
                      to={child.to}
                      end={child.end}
                      className={({ isActive }) =>
                        cn(
                          itemClass(isActive),
                          "pl-4"
                        )
                      }
                    >

                      <Icon
                        className="
                          h-4
                          w-4
                          shrink-0
                        "
                      />

                      <span>
                        {child.label}
                      </span>

                    </NavLink>
                  );

                })}

              </div>

            </div>
          );

        })}

      </nav>


      {/* =========================
          SYSTEM STATUS
      ========================= */}

      <div
        className="
          px-5
          py-4
          border-t
          border-white/10
        "
      >

        <div
          className="
            text-[10px]
            font-semibold
            uppercase
            tracking-[0.18em]
            text-slate-500
            mb-1.5
          "
        >
          System Status
        </div>


        <div
          className="
            flex
            items-center
            gap-2
            text-sm
            text-slate-200
          "
        >

          <span className="relative flex h-2 w-2">

            <span
              className="
                animate-ping
                absolute
                inline-flex
                h-full
                w-full
                rounded-full
                bg-emerald-400
                opacity-60
              "
            />

            <span
              className="
                relative
                inline-flex
                rounded-full
                h-2
                w-2
                bg-emerald-500
              "
            />

          </span>

          All systems operational

        </div>

      </div>

    </aside>
  );
}