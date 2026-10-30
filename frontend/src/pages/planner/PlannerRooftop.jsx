import { useState, useRef, useEffect, useCallback } from "react";
import { Panel, PanelHeader } from "@/components/common/Primitives";
import { StepFooter, NoActiveProject } from "./PlannerLayout";
import { api, formatApiError } from "@/lib/api";
import { useProjectContext } from "@/context/ProjectContext";
import {
  UploadCloud,
  Loader2,
  Info,
  ScanEye,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

const DEFAULT_IMG =
  "https://images.unsplash.com/photo-1771479755055-6a305f50845e?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMzJ8MHwxfHNlYXJjaHwzfHxzb2xhciUyMHBhbmVscyUyMHJvb2Z0b3AlMjBob3VzZXxlbnwwfHx8fDE3ODgwOTM0ODN8MA&ixlib=rb-4.1.0&q=85";

const STAGES = [
  "Uploading",
  "Preparing AI",
  "Detecting objects",
  "Calculating suitability",
  "Complete",
];

function clamp(value, min = 0, max = 100) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  return Math.max(min, Math.min(max, number));
}

function formatConfidence(value) {
  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    return null;
  }

  return `${(number * 100).toFixed(1)}%`;
}

function formatLocation(box) {
  if (!box) return "—";

  const x = Number(box.x);
  const y = Number(box.y);

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return "—";
  }

  return `${x.toFixed(0)},${y.toFixed(0)}`;
}

function suitabilityClasses(value) {
  const normalized = String(value || "").toLowerCase();

  if (normalized === "excellent") {
    return "border-emerald-300 bg-emerald-50 text-emerald-700";
  }

  if (normalized === "good") {
    return "border-green-300 bg-green-50 text-green-700";
  }

  if (normalized === "moderate") {
    return "border-amber-300 bg-amber-50 text-amber-700";
  }

  return "border-slate-300 bg-slate-50 text-slate-600";
}

export default function PlannerRooftop() {
  const {
    activeProject,
    activeProjectId,
    planner,
    setRooftopFile,
  } = useProjectContext();

  const [img, setImg] = useState(DEFAULT_IMG);
  const [stage, setStage] = useState(STAGES.length - 1);
  const [showBoxes, setShowBoxes] = useState(true);
  const [analysis, setAnalysis] = useState(null);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  // Shadow feasibility is an explicit user decision after rooftop analysis.
  // It is stored per project so moving between planner steps preserves the choice.
  const shadowChoiceKey = activeProjectId
    ? `solariq_shadow_choice_${activeProjectId}`
    : null;

  const [shadowChoice, setShadowChoice] = useState(() => {
    if (!activeProjectId) return null;

    try {
      return localStorage.getItem(
        `solariq_shadow_choice_${activeProjectId}`
      );
    } catch {
      return null;
    }
  });

  const inputRef = useRef(null);
  const blobRef = useRef(null);

  const complete =
    !analyzing &&
    analysis !== null &&
    analysis.status === "completed";

  useEffect(() => {
    return () => {
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current);
      }
    };
  }, []);

  const loadImage = useCallback(async (fileId) => {
    if (!fileId) return;

    const response = await api.get(
      `/uploads/${fileId}/download`,
      {
        responseType: "blob",
      }
    );

    if (blobRef.current) {
      URL.revokeObjectURL(blobRef.current);
    }

    blobRef.current = URL.createObjectURL(response.data);
    setImg(blobRef.current);
  }, []);

  const loadExistingAnalysis = useCallback(async () => {
    if (!activeProjectId) return;

    setLoadingExisting(true);

    try {
      const response = await api.get(
        `/projects/${activeProjectId}/rooftop`
      );

      const data = response.data;

      if (data) {
        setAnalysis(data);
        setStage(STAGES.length - 1);

        if (data.source_file_id) {
          try {
            await loadImage(data.source_file_id);
          } catch {
            // Analysis can still be displayed if image restoration fails.
          }

          setRooftopFile({
            id: data.source_file_id,
            filename: data.source_filename,
            content_type: data.source_content_type,
          });
        }
      }
    } catch (error) {
      const status = error?.response?.status;

      // 404/no previous analysis is a normal first-use state.
      if (status !== 404) {
        console.error("Unable to restore rooftop analysis:", error);
      }
    } finally {
      setLoadingExisting(false);
    }
  }, [
    activeProjectId,
    loadImage,
    setRooftopFile,
  ]);

  useEffect(() => {
    loadExistingAnalysis();
  }, [loadExistingAnalysis]);

  useEffect(() => {
    if (!shadowChoiceKey) {
      setShadowChoice(null);
      return;
    }

    try {
      setShadowChoice(
        localStorage.getItem(shadowChoiceKey)
      );
    } catch {
      setShadowChoice(null);
    }
  }, [shadowChoiceKey]);

  const analyseFile = async (fileId) => {
    setAnalyzing(true);
    setAnalysis(null);
    setStage(1);

    try {
      setStage(2);

      const response = await api.post(
        `/rooftop/${fileId}/analyze`
      );

      setStage(3);

      const result = response.data;

      setAnalysis(result);
      setStage(STAGES.length - 1);

      toast.success("Rooftop AI analysis completed", {
        description:
          "The uploaded rooftop image was analyzed using the YOLO-World detection model.",
      });

      return result;
    } catch (error) {
      console.error("Rooftop analysis failed:", error);

      setAnalysis(null);
      setStage(STAGES.length - 1);

      toast.error("Rooftop AI analysis failed", {
        description: formatApiError(
          error?.response?.data?.detail ||
            error?.message
        ),
      });

      throw error;
    } finally {
      setAnalyzing(false);
    }
  };

  const handleFile = async (file) => {
    if (!file || !activeProject) return;

    const extension = file.name
      .split(".")
      .pop()
      .toLowerCase();

    if (
      !["jpg", "jpeg", "png", "webp"].includes(extension)
    ) {
      toast.error("Unsupported rooftop image", {
        description:
          "Please upload a JPG, JPEG, PNG, or WEBP rooftop image.",
      });
      return;
    }

    setStage(0);
    setAnalysis(null);
    setAnalyzing(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const uploadResponse = await api.post(
        `/uploads?kind=rooftop&project_id=${activeProject.id}`,
        formData
      );

      const uploaded = uploadResponse.data;

      setRooftopFile({
        id: uploaded.id,
        filename: uploaded.filename,
        content_type: uploaded.content_type,
      });

      await loadImage(uploaded.id);

      setStage(1);

      await analyseFile(uploaded.id);
    } catch (error) {
      console.error("Rooftop upload failed:", error);

      setAnalyzing(false);
      setStage(STAGES.length - 1);

      toast.error("Rooftop upload failed", {
        description: formatApiError(
          error?.response?.data?.detail ||
            error?.message
        ),
      });
    }
  };

  const chooseShadowPath = (choice) => {
    if (!complete) {
      toast.error("Complete rooftop analysis first", {
        description:
          "The shadow feasibility decision is available after the rooftop AI analysis is completed.",
      });
      return;
    }

    try {
      if (shadowChoiceKey) {
        localStorage.setItem(
          shadowChoiceKey,
          choice
        );
      }
    } catch {
      // Navigation still works if browser storage is unavailable.
    }

    setShadowChoice(choice);
  };

  if (!activeProject) {
    return <NoActiveProject />;
  }

  const objects = Array.isArray(analysis?.objects)
    ? analysis.objects
    : [];

  const usableArea = clamp(
    analysis?.usable_area_percentage
  );

  const classificationConfidence = formatConfidence(
    analysis?.classification_confidence
  );

  const roofType =
    analysis?.roof_type || "Rooftop surface";

  const suitability =
    analysis?.suitability || "Not available";

  const classificationModel =
    analysis?.classification_model ||
    "Not used";

  const detectionModel =
    analysis?.detection_model ||
    "YOLO-World";

  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-[1.3fr_1fr] gap-4 items-start">
        {/* IMAGE + REAL DETECTIONS */}
        <Panel>
          <PanelHeader
            title="Rooftop Image"
            hint="Object detection via YOLO-World"
            right={
              <label className="flex items-center gap-1.5 text-xs text-navy-dark cursor-pointer hover:text-amber-dark transition-colors">
                <input
                  type="checkbox"
                  checked={showBoxes}
                  onChange={(event) =>
                    setShowBoxes(event.target.checked)
                  }
                  className="accent-amber-600"
                  data-testid="toggle-boxes"
                />
                Detections
              </label>
            }
          />

          <div className="p-5">
            <div className="relative rounded-md overflow-hidden border border-slate-200 bg-slate-900 aspect-[4/3]">
              <img
                src={img}
                alt="Uploaded rooftop"
                className="w-full h-full object-cover"
              />

              {analyzing && (
                <div className="absolute inset-0 bg-navy-dark/45 flex items-center justify-center">
                  <div className="text-white text-sm flex items-center gap-2 font-mono">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {STAGES[stage]}…
                  </div>
                </div>
              )}

              {!analyzing &&
                complete &&
                showBoxes &&
                objects.map((object, index) => {
                  const box = object?.box;

                  if (!box) return null;

                  const left = clamp(box.x);
                  const top = clamp(box.y);
                  const width = clamp(box.w);
                  const height = clamp(box.h);

                  if (
                    left === null ||
                    top === null ||
                    width === null ||
                    height === null
                  ) {
                    return null;
                  }

                  return (
                    <div
                      key={`${object.label || object.cls}-${index}`}
                      className="absolute border-2 border-amber"
                      style={{
                        left: `${left}%`,
                        top: `${top}%`,
                        width: `${width}%`,
                        height: `${height}%`,
                      }}
                    >
                      <span className="absolute -top-5 left-0 bg-amber text-navy-dark text-[10px] font-bold font-mono px-1.5 py-0.5 whitespace-nowrap rounded-sm">
                        {object.label ||
                          object.cls ||
                          "object"}{" "}
                        {formatConfidence(
                          object.confidence
                        ) || ""}
                      </span>
                    </div>
                  );
                })}
            </div>

            <button
              data-testid="rooftop-upload"
              onClick={() =>
                inputRef.current?.click()
              }
              disabled={analyzing}
              className="mt-3 w-full border border-dashed border-slate-300 rounded-md py-2.5 text-sm text-slate-500 hover:border-slate-400 hover:text-navy-dark transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <UploadCloud className="h-4 w-4" />
              Upload your own rooftop image
            </button>

            <input
              ref={inputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];

                if (file) {
                  handleFile(file);
                }

                event.target.value = "";
              }}
              data-testid="rooftop-file-input"
            />
          </div>
        </Panel>

        {/* REAL ANALYSIS */}
        <div className="space-y-4">
          <Panel>
            <PanelHeader
              title="AI Analysis"
              right={
                complete ? (
                  <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded border border-emerald-300 bg-emerald-50 text-emerald-700">
                    Real analysis
                  </span>
                ) : loadingExisting ? (
                  <span className="text-[10px] text-slate-400">
                    Loading…
                  </span>
                ) : null
              }
            />

            <div className="p-5 space-y-4">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Roof Type
                  </span>

                  <span className="text-sm font-semibold text-navy-dark font-mono text-right">
                    {roofType}
                  </span>
                </div>

                <p className="mt-1 text-[11px] text-slate-400">
                  {classificationModel ===
                  "Not used"
                    ? "Roof-type classification is not run in the lightweight mode."
                    : classificationModel}
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Classification Confidence
                  </span>

                  <span className="text-sm font-semibold text-navy-dark font-mono">
                    {classificationConfidence ||
                      "Not available"}
                  </span>
                </div>

                {classificationConfidence && (
                  <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-navy-light rounded-full"
                      style={{
                        width: `${
                          Number(
                            analysis.classification_confidence
                          ) * 100
                        }%`,
                      }}
                    />
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Usable Area
                  </span>

                  <span className="text-sm font-semibold text-navy-dark font-mono">
                    {usableArea !== null
                      ? `${usableArea}%`
                      : "Not available"}
                  </span>
                </div>

                {usableArea !== null && (
                  <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-navy-light rounded-full"
                      style={{
                        width: `${usableArea}%`,
                      }}
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Solar Suitability
                </span>

                <span
                  className={`px-2 py-0.5 text-xs font-bold font-mono rounded border ${suitabilityClasses(
                    suitability
                  )}`}
                >
                  {suitability}
                </span>
              </div>
            </div>
          </Panel>

          {/* DETECTED OBJECTS */}
          <Panel>
            <PanelHeader
              title="Detected Objects"
              right={
                complete ? (
                  <span className="text-[10px] font-mono text-slate-400">
                    {objects.length} detected
                  </span>
                ) : null
              }
            />

            {objects.length > 0 ? (
              <div className="overflow-x-auto">
                <table
                  className="w-full text-sm"
                  data-testid="detected-objects"
                >
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wide text-slate-400 border-b border-slate-200">
                      <th className="text-left font-semibold px-5 py-2">
                        Class
                      </th>

                      <th className="text-right font-semibold px-3 py-2">
                        Confidence
                      </th>

                      <th className="text-right font-semibold px-5 py-2">
                        Location
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {objects.map(
                      (object, index) => (
                        <tr
                          key={`${object.label || object.cls}-${index}`}
                        >
                          <td className="px-5 py-2.5 font-medium text-navy-dark">
                            {object.label ||
                              object.cls ||
                              "Unknown"}
                          </td>

                          <td className="px-3 py-2.5 text-right font-mono text-slate-600">
                            {formatConfidence(
                              object.confidence
                            ) || "—"}
                          </td>

                          <td className="px-5 py-2.5 text-right font-mono text-slate-400 text-xs">
                            {formatLocation(
                              object.box
                            )}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-5 text-sm text-slate-500">
                {analyzing
                  ? "Detecting objects in the uploaded rooftop image…"
                  : complete
                  ? "No objects were detected above the model confidence threshold."
                  : "Upload a rooftop image to begin AI analysis."}
              </div>
            )}
          </Panel>
        </div>
      </div>

      {/* HONEST TECHNICAL NOTE */}
      <div className="rounded-md border border-blue-200 bg-blue-50 p-4 flex gap-3">
        <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />

        <div className="text-sm text-blue-900 leading-relaxed">
          <p>
            <span className="font-semibold">
              AI Analysis Summary.
            </span>{" "}
            This rooftop analysis uses a pretrained
            <span className="font-mono">
              {" "}YOLO-World{" "}
            </span>
            object-detection model running locally on the
            backend. Detected objects and their bounding
            boxes come from the uploaded rooftop image.
          </p>

          <p className="mt-2">
            Exact roof-type classification is currently
            unavailable in lightweight mode because the
            additional CLIP model requires substantially
            more memory than is available on this computer.
            Therefore, the system does not display a
            fabricated roof-type confidence.
          </p>

          <p className="mt-2 text-xs text-blue-800">
            Usable-area percentage is a visual engineering
            estimate derived from the image and detected
            objects; it is not an architectural measurement.
            Verify obstacles on site before finalising panel
            placement.
          </p>
        </div>
      </div>

      {complete && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 flex gap-3">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />

          <div>
            <p className="text-sm font-semibold text-emerald-800">
              Rooftop analysis saved
            </p>

            <p className="text-xs text-emerald-700 mt-1">
              This analysis is stored against the current
              project and can be used by the next planner
              stages.
            </p>

            <p className="text-[11px] text-emerald-600 mt-2 font-mono">
              Model: {detectionModel}
            </p>
          </div>
        </div>
      )}

      {!analyzing &&
        analysis &&
        analysis.status !== "completed" && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4 flex gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />

            <p className="text-sm text-amber-800">
              The rooftop analysis did not return a completed
              result. Please upload the image again and retry.
            </p>
          </div>
        )}

      {/* SHADOW FEASIBILITY CHECKPOINT */}
      {complete && (
        <section className="relative overflow-hidden rounded-xl border border-navy-dark bg-navy-dark p-5 sm:p-6 shadow-lg">
          {/* Strong visual accent matching the main navigation/sidebar */}
          <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-amber" />

          <div className="flex items-start gap-3 pl-2">
            <div className="h-10 w-10 rounded-lg bg-amber text-navy-dark flex items-center justify-center shrink-0 shadow-sm">
              <ScanEye className="h-5 w-5" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-bold text-white">
                  Shadow Feasibility Check
                </h2>

                <span className="rounded-full border border-amber/40 bg-amber/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber">
                  Recommended Checkpoint
                </span>
              </div>

              <p className="mt-1 text-sm leading-6 text-slate-200 max-w-3xl">
                Do you want SolarIQ+ to perform the additional shadow-impact
                assessment for nearby buildings, trees, tanks, poles, or other
                surrounding structures?
              </p>

              <p className="mt-2 text-xs leading-5 text-slate-400 max-w-3xl">
                Choose <span className="font-semibold text-amber">Yes</span>
                {" "}to capture directional views and run the engineering
                shadow analysis. Choose <span className="font-semibold text-white">No</span>
                {" "}to continue directly to system analysis. This choice does
                not claim that the rooftop has zero shading.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 pl-2">
            <button
              type="button"
              data-testid="shadow-choice-yes"
              onClick={() => chooseShadowPath("yes")}
              aria-pressed={shadowChoice === "yes"}
              className={`relative rounded-lg border-2 px-4 py-4 text-left transition-all duration-200 ${
                shadowChoice === "yes"
                  ? "border-amber bg-amber text-navy-dark shadow-md ring-2 ring-amber/30"
                  : "border-slate-600 bg-navy text-white hover:border-amber hover:bg-navy-light"
              }`}
            >
              {shadowChoice === "yes" && (
                <span className="absolute -top-2.5 left-3 rounded-full bg-amber px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-navy-dark">
                  Selected
                </span>
              )}

              <div className="flex items-center justify-between gap-3">
                <span
                  className={`text-sm font-semibold ${
                    shadowChoice === "yes"
                      ? "text-navy-dark"
                      : "text-white"
                  }`}
                >
                  Yes, check shadow impact
                </span>

                <span
                  className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    shadowChoice === "yes"
                      ? "border-navy-dark bg-navy-dark"
                      : "border-slate-500 bg-transparent"
                  }`}
                >
                  {shadowChoice === "yes" && (
                    <CheckCircle2 className="h-4 w-4 text-white" />
                  )}
                </span>
              </div>

              <div
                className={`mt-1 text-xs leading-5 ${
                  shadowChoice === "yes"
                    ? "text-navy-dark/75"
                    : "text-slate-400"
                }`}
              >
                Continue with directional surroundings and shadow analysis.
              </div>
            </button>

            <button
              type="button"
              data-testid="shadow-choice-no"
              onClick={() => chooseShadowPath("no")}
              aria-pressed={shadowChoice === "no"}
              className={`relative rounded-lg border-2 px-4 py-4 text-left transition-all duration-200 ${
                shadowChoice === "no"
                  ? "border-slate-300 bg-slate-100 text-slate-950 shadow-md ring-2 ring-white/20"
                  : "border-slate-600 bg-navy text-white hover:border-slate-400 hover:bg-navy-light"
              }`}
            >
              {shadowChoice === "no" && (
                <span className="absolute -top-2.5 left-3 rounded-full bg-slate-200 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-navy-dark">
                  Selected
                </span>
              )}

              <div className="flex items-center justify-between gap-3">
                <span
                  className={`text-sm font-semibold ${
                    shadowChoice === "no"
                      ? "text-slate-900"
                      : "text-white"
                  }`}
                >
                  No, continue without shadow analysis
                </span>

                <span
                  className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    shadowChoice === "no"
                      ? "border-slate-700 bg-slate-700"
                      : "border-slate-500 bg-transparent"
                  }`}
                >
                  {shadowChoice === "no" && (
                    <CheckCircle2 className="h-4 w-4 text-white" />
                  )}
                </span>
              </div>

              <div
                className={`mt-1 text-xs leading-5 ${
                  shadowChoice === "no"
                    ? "text-slate-600"
                    : "text-slate-400"
                }`}
              >
                Skip the optional shadow stage and continue to system analysis.
              </div>
            </button>
          </div>
        </section>
      )}

      <StepFooter
        backTo="/planner/bill"
        nextTo={
          shadowChoice === "yes"
            ? "/planner/shadow"
            : shadowChoice === "no"
            ? "/planner/analysis"
            : undefined
        }
        nextLabel={
          shadowChoice === "yes"
            ? "Continue to Shadow"
            : shadowChoice === "no"
            ? "Continue to Analysis"
            : "Select a Shadow Path"
        }
      />
    </div>
  );
}