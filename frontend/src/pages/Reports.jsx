import { SectionHeading, Panel, DataTag } from "@/components/common/Primitives";
import { REPORTS } from "@/lib/sample";
import { FileBarChart, Eye, FileDown, RefreshCw, Check } from "lucide-react";
import { toast } from "sonner";

export default function Reports() {
  return (
    <div className="space-y-6">
      <SectionHeading eyebrow="Documentation" title="Reports" description="Generate and export consolidated planning and performance reports for this installation." />

      <div className="grid md:grid-cols-2 gap-4">
        {REPORTS.map((r) => (
          <Panel key={r.id} className="flex flex-col">
            <div className="p-5 flex items-start gap-4 border-b border-slate-200">
              <div className="h-11 w-11 rounded-md bg-navy-dark flex items-center justify-center shrink-0"><FileBarChart className="h-5 w-5 text-amber" /></div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-navy-dark font-display">{r.title}</h3>
                  <span className="text-[10px] font-mono uppercase tracking-wide text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">{r.kind}</span>
                </div>
                <div className="text-xs text-slate-400 mt-1">Last updated · {r.updated}</div>
              </div>
              <DataTag variant="sample" />
            </div>
            <div className="p-5 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">Included sections</div>
              <ul className="space-y-1.5">
                {r.items.map((it) => (
                  <li key={it} className="flex items-center gap-2 text-sm text-slate-700">
                    <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" /> {it}
                  </li>
                ))}
              </ul>
            </div>
            <div className="p-4 border-t border-slate-200 flex gap-2">
              <button data-testid={`report-view-${r.id}`} onClick={() => toast("Opening report preview", { description: r.title })} className="flex-1 inline-flex items-center justify-center gap-1.5 text-sm border border-slate-200 rounded-md py-2 hover:bg-slate-50 transition-colors text-slate-700">
                <Eye className="h-4 w-4" /> View
              </button>
              <button data-testid={`report-generate-${r.id}`} onClick={() => toast.success("Report generated", { description: r.title })} className="flex-1 inline-flex items-center justify-center gap-1.5 text-sm border border-slate-200 rounded-md py-2 hover:bg-slate-50 transition-colors text-slate-700">
                <RefreshCw className="h-4 w-4" /> Generate
              </button>
              <button data-testid={`report-export-${r.id}`} onClick={() => toast.success("Export queued", { description: "PDF export connects to the reporting service." })} className="flex-1 inline-flex items-center justify-center gap-1.5 text-sm bg-navy-dark text-white rounded-md py-2 hover:bg-navy transition-colors">
                <FileDown className="h-4 w-4" /> Export PDF
              </button>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
