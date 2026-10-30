import { useState, useRef, useEffect } from "react";
import { Panel, PanelHeader, DataTag } from "@/components/common/Primitives";
import { StepFooter, NoActiveProject } from "./PlannerLayout";
import { api, formatApiError } from "@/lib/api";
import { useProjectContext } from "@/context/ProjectContext";
import { Input } from "@/components/ui/input";
import { UploadCloud, FileText, CheckCircle2, AlertTriangle, Loader2, X, Pencil, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const STEPS = ["Uploading", "Reading document", "Extracting fields", "Complete"];

const FIELD_DEFS = [
  { key: "consumer_number", label: "Consumer Number" },
  { key: "bill_number", label: "Bill Number" },
  { key: "customer_name", label: "Customer Name" },
  { key: "bill_date", label: "Bill Date" },
  { key: "due_date", label: "Due Date" },
  { key: "monthly_consumption_kwh", label: "Monthly Consumption", unit: "kWh" },
  { key: "bill_amount", label: "Bill Amount" },
  { key: "sanctioned_load_kw", label: "Sanctioned Load", unit: "kW" },
  { key: "meter_status", label: "Meter Status" },
  { key: "consumer_type", label: "Consumer Type" },
];

function confBucket(c) {
  if (c >= 0.85) return { label: "High confidence", cls: "text-emerald-600", icon: CheckCircle2 };
  if (c >= 0.6) return { label: "Medium confidence", cls: "text-amber-600", icon: CheckCircle2 };
  if (c > 0) return { label: "Needs verification", cls: "text-orange-600", icon: AlertTriangle };
  return { label: "Not detected", cls: "text-slate-400", icon: AlertTriangle };
}

const STATUS_NOTE = {
  needs_review: { cls: "border-orange-200 bg-orange-50 text-orange-800", text: "We couldn't confidently read the key fields. Please review and correct them below." },
  completed_with_warnings: { cls: "border-amber-200 bg-amber-50 text-amber-800", text: "Some fields have low confidence. Please verify the highlighted values." },
  failed: { cls: "border-red-200 bg-red-50 text-red-800", text: "No readable text was extracted from this document." },
};

function displayValue(key, v) {
  if (v === null || v === undefined || v === "") return "—";
  if (key === "bill_amount") return "₹" + Number(v).toLocaleString("en-IN");
  return String(v);
}

export default function PlannerBill() {
  const { activeProject, setBillFile } = useProjectContext();
  const [phase, setPhase] = useState("loading"); // loading | idle | uploading | extracting | done | error
  const [bill, setBill] = useState(null);
  const [preview, setPreview] = useState(null);
  const [isPdf, setIsPdf] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editValues, setEditValues] = useState({});
  const [saving, setSaving] = useState(false);
  const inputRef = useRef();
  const blobRef = useRef(null);

  const setPreviewBlob = (blob, pdf) => {
    if (blobRef.current) URL.revokeObjectURL(blobRef.current);
    blobRef.current = URL.createObjectURL(blob);
    setIsPdf(pdf);
    setPreview(blobRef.current);
  };

  // Load an existing persisted bill for this project on entry.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPhase("loading");
      try {
        const { data } = await api.get(`/projects/${activeProject.id}/bill`);
        if (cancelled) return;
        if (data && data.source_file_id) {
          setBill(data);
          setBillFile({ id: data.source_file_id, filename: data.source_filename, content_type: data.source_content_type });
          try {
            const res = await api.get(`/uploads/${data.source_file_id}/download`, { responseType: "blob" });
            if (!cancelled) setPreviewBlob(res.data, (data.source_content_type || "") === "application/pdf");
          } catch { /* preview optional */ }
          if (!cancelled) setPhase("done");
        } else {
          setPhase("idle");
        }
      } catch {
        if (!cancelled) setPhase("idle");
      }
    })();
    return () => {
      cancelled = true;
      if (blobRef.current) { URL.revokeObjectURL(blobRef.current); blobRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject?.id]);

  const handleFile = async (f) => {
    if (!f) return;
    setError("");
    const ext = f.name.split(".").pop().toLowerCase();
    if (!["pdf", "jpg", "jpeg", "png"].includes(ext)) {
      setError("Unsupported file. Upload a PDF, JPG or PNG of your electricity bill.");
      setPhase("error");
      return;
    }
    setBill(null);
    setPhase("uploading");
    try {
      const fd = new FormData();
      fd.append("file", f);
      const { data: up } = await api.post(`/uploads?kind=bill&project_id=${activeProject.id}`, fd);
      setBillFile({ id: up.id, filename: up.filename, content_type: up.content_type });
      try {
        const res = await api.get(`/uploads/${up.id}/download`, { responseType: "blob" });
        setPreviewBlob(res.data, ext === "pdf");
      } catch { /* preview optional */ }

      setPhase("extracting");
      const { data: result } = await api.post(`/bills/${up.id}/extract`);
      setBill(result);
      setPhase("done");
      if (["needs_review", "failed"].includes(result.status)) {
        toast.warning("Bill uploaded — review needed", { description: "Some fields could not be read confidently." });
      } else {
        toast.success("Bill processed", { description: "Fields extracted via Tesseract OCR." });
      }
    } catch (err) {
      setPhase("error");
      setError(formatApiError(err.response?.data?.detail) || "We couldn't extract readable text from this bill. Try uploading a clearer image or PDF.");
    }
  };

  const reset = () => {
    setBill(null); setPreview(null); setError(""); setEditMode(false); setBillFile(null);
    if (blobRef.current) { URL.revokeObjectURL(blobRef.current); blobRef.current = null; }
    setPhase("idle");
  };

  const startEdit = () => {
    const vals = {};
    FIELD_DEFS.forEach(({ key }) => { vals[key] = bill?.fields?.[key] ?? ""; });
    setEditValues(vals);
    setEditMode(true);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      const { data } = await api.patch(`/bills/${bill.id}`, { fields: editValues });
      setBill(data);
      setEditMode(false);
      toast.success("Bill details saved", { description: "Corrected values marked as verified." });
    } catch (err) {
      toast.error("Could not save changes", { description: formatApiError(err.response?.data?.detail) });
    } finally {
      setSaving(false);
    }
  };

  if (!activeProject) return <NoActiveProject />;

  const processing = phase === "uploading" || phase === "extracting";
  const showDropzone = phase === "idle" || phase === "error";

  const stepState = (i) => {
    if (phase === "done") return "done";
    if (phase === "uploading") return i === 0 ? "active" : "todo";
    if (phase === "extracting") return i === 0 ? "done" : i === 3 ? "todo" : "active";
    return "todo";
  };

  if (phase === "loading") {
    return (
      <Panel className="p-14 flex flex-col items-center text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="text-sm mt-3">Loading saved bill…</span>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      {showDropzone ? (
        <Panel>
          <PanelHeader title="Upload Electricity Bill" hint="Text is extracted on the server using Tesseract OCR" />
          <div className="p-5">
            <div
              data-testid="bill-dropzone"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
              className={cn(
                "border-2 border-dashed rounded-md py-14 flex flex-col items-center justify-center cursor-pointer transition-colors",
                dragging ? "border-amber bg-amber/5" : "border-slate-300 bg-slate-50 hover:border-slate-400"
              )}
            >
              <div className="h-14 w-14 rounded-md bg-white border border-slate-200 flex items-center justify-center">
                <UploadCloud className="h-7 w-7 text-navy-light" />
              </div>
              <div className="mt-4 text-sm font-medium text-navy-dark">Drag & drop your bill, or click to browse</div>
              <div className="text-xs text-slate-400 mt-1 font-mono">PDF · JPG · PNG · up to 10 MB</div>
              <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => handleFile(e.target.files[0])} data-testid="bill-file-input" />
            </div>
            {error && (
              <div data-testid="bill-error" className="mt-4 flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2.5">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> {error}
              </div>
            )}
          </div>
        </Panel>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4 items-start">
          {/* Preview */}
          <Panel>
            <PanelHeader
              title="Document"
              hint={bill?.source_filename}
              right={<button onClick={reset} data-testid="bill-remove" className="text-slate-400 hover:text-red-600 transition-colors"><X className="h-4 w-4" /></button>}
            />
            <div className="p-5">
              <div className="rounded-md border border-slate-200 bg-slate-100 overflow-hidden aspect-[3/4] flex items-center justify-center">
                {!preview ? (
                  <Loader2 className="h-6 w-6 text-slate-400 animate-spin" />
                ) : isPdf ? (
                  <object data={preview} type="application/pdf" className="w-full h-full">
                    <div className="flex flex-col items-center text-slate-400"><FileText className="h-10 w-10" /><span className="text-xs mt-2">PDF uploaded</span></div>
                  </object>
                ) : (
                  <img src={preview} alt="Uploaded bill" className="w-full h-full object-contain" />
                )}
              </div>
            </div>
          </Panel>

          {/* Extraction */}
          <Panel>
            <PanelHeader
              title="Extracted Information"
              right={
                phase === "done" ? (
                  <div className="flex items-center gap-2">
                    <DataTag variant="model">TESSERACT OCR</DataTag>
                    {!editMode && (
                      <button data-testid="bill-edit" onClick={startEdit} className="inline-flex items-center gap-1 text-xs text-navy-dark hover:text-amber-dark transition-colors">
                        <Pencil className="h-3.5 w-3.5" /> Verify / edit
                      </button>
                    )}
                  </div>
                ) : null
              }
            />
            <div className="p-5">
              {/* Processing pipeline (real phases, no fake percentages) */}
              <div className="flex items-center gap-2 mb-5">
                {STEPS.map((st, i) => {
                  const s = stepState(i);
                  return (
                    <div key={st} className="flex items-center gap-2 flex-1">
                      <div className="flex flex-col items-center flex-1">
                        <div className={cn(
                          "h-7 w-7 rounded-full flex items-center justify-center text-xs shrink-0 border-2",
                          s === "done" ? "bg-emerald-500 border-emerald-500 text-white" :
                          s === "active" ? "border-amber text-amber-dark" : "border-slate-200 text-slate-300"
                        )}>
                          {s === "done" ? <CheckCircle2 className="h-4 w-4" /> : s === "active" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : i + 1}
                        </div>
                        <span className={cn("text-[10px] mt-1 font-medium text-center leading-tight", s !== "todo" ? "text-navy-dark" : "text-slate-300")}>{st}</span>
                      </div>
                      {i < STEPS.length - 1 && <div className={cn("h-px flex-1 -mt-4", s === "done" ? "bg-emerald-400" : "bg-slate-200")} />}
                    </div>
                  );
                })}
              </div>

              {processing && (
                <div className="py-8 text-center text-sm text-slate-500 flex flex-col items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  {phase === "uploading" ? "Uploading bill…" : "Reading the document and identifying fields…"}
                </div>
              )}

              {phase === "done" && bill && (
                <>
                  {STATUS_NOTE[bill.status] && (
                    <div className={cn("mb-4 flex items-start gap-2 text-sm rounded-md px-3 py-2.5 border", STATUS_NOTE[bill.status].cls)}>
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> {STATUS_NOTE[bill.status].text}
                    </div>
                  )}

                  <div className="divide-y divide-slate-100 border-t border-slate-100" data-testid="bill-fields">
                    {FIELD_DEFS.map(({ key, label, unit }) => {
                      const conf = bill.confidence?.[key] ?? 0;
                      const c = confBucket(conf);
                      const verified = (bill.verified_fields || []).includes(key);
                      return (
                        <div key={key} className="flex items-center justify-between gap-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
                            {editMode ? (
                              <Input
                                data-testid={`bill-input-${key}`}
                                value={editValues[key] ?? ""}
                                onChange={(e) => setEditValues((v) => ({ ...v, [key]: e.target.value }))}
                                className="mt-1 h-8 text-sm font-mono"
                                placeholder="Not detected"
                              />
                            ) : (
                              <div className="text-sm font-medium text-navy-dark font-mono mt-0.5">
                                {displayValue(key, bill.fields?.[key])}
                                {unit && bill.fields?.[key] != null && <span className="text-slate-400 ml-1">{unit}</span>}
                              </div>
                            )}
                          </div>
                          {!editMode && (
                            <div className={cn("flex items-center gap-1 text-[11px] shrink-0", verified ? "text-emerald-600" : c.cls)}>
                              {verified ? <ShieldCheck className="h-3.5 w-3.5" /> : <c.icon className="h-3.5 w-3.5" />}
                              {verified ? "Verified" : c.label}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {editMode && (
                    <div className="flex justify-end gap-2 mt-4">
                      <button data-testid="bill-edit-cancel" onClick={() => setEditMode(false)} className="text-sm text-slate-500 hover:text-navy-dark px-4 py-2 rounded-md transition-colors">Cancel</button>
                      <button data-testid="bill-edit-save" onClick={saveEdit} disabled={saving} className="inline-flex items-center gap-1.5 bg-navy-dark hover:bg-navy text-white text-sm font-medium px-4 py-2 rounded-md transition-colors disabled:opacity-60">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Save verified values
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </Panel>
        </div>
      )}

      {phase === "done" && <StepFooter backTo="/planner/project" nextTo="/planner/rooftop" />}
    </div>
  );
}
