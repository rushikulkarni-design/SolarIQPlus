import { NavLink } from "react-router-dom";
import { MOBILE_NAV } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { SolarMark } from "@/components/common/Primitives";
import { PROJECT } from "@/lib/sample";

export function MobileTopbar() {
  return (
    <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between h-14 px-4 bg-[#081126] border-b border-white/10">
      <div className="flex items-center gap-2">
        <SolarMark className="h-7 w-7" />
        <span className="text-white font-extrabold tracking-tight font-display">
          SOLARIQ<span className="text-emerald-400">+</span>
        </span>
      </div>

      <div className="text-right leading-tight">
        <div className="text-[11px] text-slate-300">
          {PROJECT.name}
        </div>
        <div className="text-[10px] text-emerald-400 flex items-center gap-1 justify-end">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Operational
        </div>
      </div>
    </header>
  );
}

export function MobileNav() {
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-slate-200 grid grid-cols-5">
      {MOBILE_NAV.map((item) => {
        const Icon = item.icon;

        return (
          <NavLink
            key={item.to}
            to={item.to}
            data-testid={`mobile-nav-${item.label.toLowerCase()}`}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center justify-center gap-0.5 py-2 transition-colors",
                isActive
                  ? "text-emerald-600"
                  : "text-slate-500 hover:text-slate-800"
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  className={cn(
                    "h-5 w-5",
                    isActive && "text-emerald-600"
                  )}
                />
                <span className="text-[10px] font-medium">
                  {item.label}
                </span>
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}
