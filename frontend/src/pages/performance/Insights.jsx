import { useState } from "react";
import { SectionHeading, Panel, StatusBadge, DataTag } from "@/components/common/Primitives";
import { INSIGHTS } from "@/lib/sample";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Insights() {
  const [open, setOpen] = useState(0);
  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow="Performance"
        title="AI Insights"
        description="Plain-language interpretations of system behaviour. Each insight includes the reason it was raised and a recommended action."
        right={<DataTag variant="sample" />}
      />

      <div className="space-y-3" data-testid="insights-list">
        {INSIGHTS.map((ins, i) => {
          const isOpen = open === i;
          return (
            <Panel key={i} className={cn("transition-colors", isOpen && "border-slate-300")}>
              <button
                data-testid={`insight-${i}`}
                onClick={() => setOpen(isOpen ? -1 : i)}
                className="w-full flex items-center gap-4 px-5 py-4 text-left"
              >
                <StatusBadge status={ins.status} />
                <span className="flex-1 text-sm font-semibold text-navy-dark">{ins.title}</span>
                <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform shrink-0", isOpen && "rotate-180")} />
              </button>
              {isOpen && (
                <div className="px-5 pb-5 pt-0 animate-fade-up">
                  <p className="text-slate-700 leading-relaxed border-l-2 border-slate-200 pl-4">{ins.text}</p>
                  <div className="mt-4 grid sm:grid-cols-2 gap-3">
                    <div className="rounded-md bg-slate-50 border border-slate-100 p-3">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Reason</div>
                      <div className="text-sm text-slate-700">{ins.reason}</div>
                    </div>
                    <div className="rounded-md bg-amber/5 border border-amber/20 p-3">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-dark mb-1">Recommended Action</div>
                      <div className="text-sm text-slate-700">{ins.action}</div>
                    </div>
                  </div>
                </div>
              )}
            </Panel>
          );
        })}
      </div>

      <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
        Insights combine rule-based logic with the anomaly-detection layer. Machine-learning-backed insights will appear
        here once sufficient generation history and the ML models are integrated.
      </p>
    </div>
  );
}
