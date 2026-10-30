import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Gauge,
  PanelTop,
  RefreshCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Sun,
  Zap,
} from "lucide-react";
import { useProjectContext } from "@/context/ProjectContext";

const BACKEND_URL =
  process.env.REACT_APP_BACKEND_URL || "http://127.0.0.1:8000";

const ISSUES = [
  {
    id: "low-generation",
    title: "Low Power Generation",
    description: "My system is producing less energy than usual.",
    icon: Zap,
    questions: [
      {
        key: "timing",
        title: "When did you notice the drop?",
        options: ["Today", "For a few days", "For more than a week"],
      },
      {
        key: "weather",
        title: "What are the current weather conditions?",
        options: ["Sunny / mostly clear", "Cloudy / rainy", "Not sure"],
      },
      {
        key: "inverter",
        title: "What is the inverter showing?",
        options: ["Normal", "Warning / error", "Not checked"],
      },
    ],
  },
  {
    id: "inverter",
    title: "Inverter Problem",
    description: "My inverter shows a warning, error, or abnormal state.",
    icon: Gauge,
    questions: [
      {
        key: "power",
        title: "Is the inverter powered on?",
        options: ["Yes", "No", "Not sure"],
      },
      {
        key: "error",
        title: "Is there an error or warning message?",
        options: ["Yes", "No", "Not sure"],
      },
      {
        key: "grid",
        title: "Has there been a recent power outage?",
        options: ["Yes", "No", "Not sure"],
      },
    ],
  },
  {
    id: "panel",
    title: "Panel Issue",
    description: "My panels look dirty, shaded, damaged, or unusual.",
    icon: PanelTop,
    questions: [
      {
        key: "condition",
        title: "What do you see?",
        options: ["Dirt / leaves", "Shade", "Visible damage", "Nothing obvious"],
      },
      {
        key: "extent",
        title: "How many panels appear affected?",
        options: ["One / few", "Many", "Not sure"],
      },
      {
        key: "generation",
        title: "Has generation also dropped?",
        options: ["Yes", "No", "Not sure"],
      },
    ],
  },
  {
    id: "grid",
    title: "Grid / Power Issue",
    description: "My solar system is affected by a power or grid problem.",
    icon: Sun,
    questions: [
      {
        key: "outage",
        title: "Is grid power currently available?",
        options: ["Yes", "No", "Not sure"],
      },
      {
        key: "inverter",
        title: "Does the inverter report a grid-related warning?",
        options: ["Yes", "No", "Not sure"],
      },
      {
        key: "duration",
        title: "How long has the issue been happening?",
        options: ["Less than an hour", "Several hours", "More than a day"],
      },
    ],
  },
];

function getProjectContext(project) {
  if (!project || typeof project !== "object") return null;

  const allowed = [
    "id",
    "name",
    "project_name",
    "location",
    "city",
    "state",
    "system_status",
    "capacity_kw",
    "solar_capacity",
    "panel_brand",
    "panel_model",
    "panel_wattage",
    "panel_count",
    "inverter_brand",
    "inverter_model",
    "battery_capacity",
    "installation_date",
  ];

  return allowed.reduce((out, key) => {
    if (project[key] !== undefined && project[key] !== null && project[key] !== "") {
      out[key] = project[key];
    }
    return out;
  }, {});
}

function renderInlineMarkdown(text, keyPrefix = "inline") {
  const parts = String(text || "").split(
    /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g
  );

  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;

    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={key} className="font-bold text-slate-800">
          {part.slice(2, -2)}
        </strong>
      );
    }

    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={key}
          className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[12px] text-slate-700"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    if (part.startsWith("*") && part.endsWith("*")) {
      return (
        <em key={key} className="italic">
          {part.slice(1, -1)}
        </em>
      );
    }

    return <span key={key}>{part}</span>;
  });
}

function MarkdownResult({ text }) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const elements = [];
  let listItems = [];
  let listType = null;

  function flushList() {
    if (!listItems.length) return;

    const items = listItems;
    const type = listType;
    const key = `list-${elements.length}`;

    elements.push(
      type === "ordered" ? (
        <ol key={key} className="list-decimal space-y-1 pl-5">
          {items.map((item, index) => (
            <li key={index}>{renderInlineMarkdown(item, `${key}-${index}`)}</li>
          ))}
        </ol>
      ) : (
        <ul key={key} className="list-disc space-y-1 pl-5">
          {items.map((item, index) => (
            <li key={index}>{renderInlineMarkdown(item, `${key}-${index}`)}</li>
          ))}
        </ul>
      )
    );

    listItems = [];
    listType = null;
  }

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      return;
    }

    if (/^---+$/.test(trimmed)) {
      flushList();
      elements.push(<hr key={`hr-${index}`} className="border-slate-200" />);
      return;
    }

    const heading = trimmed.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      flushList();
      const level = trimmed.match(/^#+/)[0].length;

      if (level === 1) {
        elements.push(
          <h2 key={`h-${index}`} className="pt-1 text-base font-extrabold text-slate-900">
            {renderInlineMarkdown(heading[1], `h-${index}`)}
          </h2>
        );
      } else if (level === 2) {
        elements.push(
          <h3 key={`h-${index}`} className="pt-1 text-sm font-extrabold text-slate-900">
            {renderInlineMarkdown(heading[1], `h-${index}`)}
          </h3>
        );
      } else {
        elements.push(
          <h4 key={`h-${index}`} className="pt-1 text-sm font-bold text-slate-800">
            {renderInlineMarkdown(heading[1], `h-${index}`)}
          </h4>
        );
      }
      return;
    }

    const ordered = trimmed.match(/^(\d+)\.\s+(.+)$/);
    const unordered = trimmed.match(/^[-*]\s+(.+)$/);

    if (ordered) {
      if (listType !== "ordered") flushList();
      listType = "ordered";
      listItems.push(ordered[2]);
      return;
    }

    if (unordered) {
      if (listType !== "unordered") flushList();
      listType = "unordered";
      listItems.push(unordered[1]);
      return;
    }

    flushList();
    elements.push(
      <p key={`p-${index}`} className="whitespace-pre-wrap">
        {renderInlineMarkdown(trimmed, `p-${index}`)}
      </p>
    );
  });

  flushList();

  return (
    <div className="space-y-3 text-sm leading-6 text-slate-600">
      {elements}
    </div>
  );
}

export default function IssueDiagnosis() {
  const navigate = useNavigate();
  const { activeProject } = useProjectContext();
  const [selectedId, setSelectedId] = useState(null);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [details, setDetails] = useState("");
  const [result, setResult] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [mlContext, setMlContext] = useState(null);
  const [mlLoading, setMlLoading] = useState(false);

  const selectedIssue = useMemo(
    () => ISSUES.find((item) => item.id === selectedId) || null,
    [selectedId]
  );

  const currentQuestion = selectedIssue?.questions?.[step] || null;
  const answerCount = selectedIssue
    ? Object.keys(answers).filter((key) => selectedIssue.questions.some((q) => q.key === key)).length
    : 0;

  async function loadMLContext() {
    setMlLoading(true);
    try {
      const [evaluation, shap] = await Promise.allSettled([
        fetch(`${BACKEND_URL}/api/ml/evaluation`).then((r) => r.ok ? r.json() : Promise.reject(new Error("evaluation unavailable"))),
        fetch(`${BACKEND_URL}/api/ml/shap`).then((r) => r.ok ? r.json() : Promise.reject(new Error("SHAP unavailable"))),
      ]);
      const evaluationData = evaluation.status === "fulfilled" ? evaluation.value : null;
      const shapData = shap.status === "fulfilled" ? shap.value : null;
      setMlContext({
        evaluation: evaluationData,
        shap: shapData,
        available: Boolean(evaluationData || shapData),
      });
    } catch {
      setMlContext(null);
    } finally {
      setMlLoading(false);
    }
  }

  useEffect(() => {
    loadMLContext();
  }, []);

  function chooseIssue(issueId) {
    setSelectedId(issueId);
    setStep(0);
    setAnswers({});
    setDetails("");
    setResult("");
    setError("");
  }

  function chooseAnswer(value) {
    if (!currentQuestion) return;

    const next = { ...answers, [currentQuestion.key]: value };
    setAnswers(next);

    if (step < selectedIssue.questions.length - 1) {
      setStep((value) => value + 1);
    }
  }

  async function analyze() {
    if (!selectedIssue) return;

    setIsAnalyzing(true);
    setError("");
    setResult("");

    const prompt = `
You are SolarIQ+ AI Issue Diagnosis.

Diagnose the user's solar-system issue using ONLY the information supplied below.
Do not claim a confirmed hardware fault. Give a practical diagnosis with uncertainty.

Issue: ${selectedIssue.title}

User answers:
${selectedIssue.questions
  .map((question) => `- ${question.title}: ${answers[question.key] || "Not answered"}`)
  .join("\n")}

Additional user details:
${details.trim() || "None provided"}

Reference ML intelligence (not live customer telemetry):
${JSON.stringify({
  model: mlContext?.evaluation?.model || "XGBRegressor",
  data_source: mlContext?.evaluation?.data_source || "Reference/training dataset",
  project_linked: mlContext?.evaluation?.project_linked ?? false,
  metrics: mlContext?.evaluation?.metrics || null,
  top_shap_features: (mlContext?.shap?.features || []).slice(0, 5),
})}

Use this only as supporting reference evidence. Do not present reference ML values as this customer's sensor readings or confirmed fault.

Return exactly this structure:

### Diagnosis
One concise explanation of the most likely situation.

### Severity
Choose one: LOW, MEDIUM, HIGH.

### Possible causes
- Cause 1
- Cause 2
- Cause 3

### What to check now
1. Step 1
2. Step 2
3. Step 3

### Recommended action
Give the safest practical next action.

### Technician required?
Say YES or NO and explain briefly.

Important:
- Never invent sensor readings, generation values, error codes, or telemetry.
- Never tell the user to open electrical equipment or perform unsafe rooftop work.
- If there is electrical danger, fire, burning smell, exposed wiring, or persistent inverter fault, recommend a qualified solar technician.
`;

    try {
      const response = await fetch(`${BACKEND_URL}/api/ai-chat`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: prompt,
          history: [],
          project_context: getProjectContext(activeProject),
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.detail || data?.error || `AI service returned ${response.status}`);
      }

      setResult(data.reply || "No diagnosis was returned.");
    } catch (err) {
      setError(err.message || "Unable to reach the AI diagnosis service.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  function getMaintenanceRecommendation() {
    const base = {
      source: "SolarIQ+ AI diagnosis",
    };

    if (selectedId === "low-generation") {
      return {
        ...base,
        title: "Generation Performance Review",
        category: "Performance",
        priority: "Medium",
        frequency: "Monthly",
        description:
          "Review recent solar generation and investigate the low-generation condition identified by the AI diagnosis.",
      };
    }

    if (selectedId === "inverter") {
      return {
        ...base,
        title: "Inverter Inspection",
        category: "Inverter",
        priority: "High",
        frequency: "Quarterly",
        description:
          "Inspect inverter operating status, warning indicators and ventilation area following the AI diagnosis.",
      };
    }

    if (selectedId === "panel") {
      const condition = answers.condition || "panel condition";
      return {
        ...base,
        title: "Panel Inspection",
        category: "Panels",
        priority: condition === "Visible damage" ? "High" : "Medium",
        frequency: "Monthly",
        description:
          `Inspect the solar panels based on the reported condition: ${condition}. Follow safe visual inspection practices.`,
      };
    }

    if (selectedId === "grid") {
      return {
        ...base,
        title: "Electrical / Grid Inspection",
        category: "Electrical",
        priority: "High",
        frequency: "One-time",
        description:
          "Review the solar system's grid/power condition and arrange qualified technical inspection if the issue persists.",
      };
    }

    return null;
  }

  function scheduleMaintenance() {
    const recommendation = getMaintenanceRecommendation();

    if (!recommendation) return;

    navigate("/maintenance", {
      state: {
        maintenanceTask: recommendation,
      },
    });
  }

  function reset() {
    setSelectedId(null);
    setStep(0);
    setAnswers({});
    setDetails("");
    setResult("");
    setError("");
  }

  return (
    <div className="min-h-full bg-slate-50 pb-10">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
            <Sparkles className="h-4 w-4" />
            AI Monitoring
          </div>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-950">
            Solar Issue Diagnosis
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
            Answer a few simple questions and SolarIQ+ will analyze the issue and recommend the safest next step.
          </p>
        </div>

        {!selectedIssue && !result && (
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Bot className="h-5 w-5 text-emerald-600" />
              <h2 className="font-extrabold text-slate-900">What is happening?</h2>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {ISSUES.map((issue) => {
                const Icon = issue.icon;
                return (
                  <button
                    key={issue.id}
                    type="button"
                    onClick={() => chooseIssue(issue.id)}
                    className="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                        <Icon className="h-6 w-6" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-extrabold text-slate-900">{issue.title}</div>
                        <div className="mt-1 text-xs leading-5 text-slate-500">{issue.description}</div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-emerald-600" />
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {selectedIssue && !result && (
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <button
                type="button"
                onClick={reset}
                className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-900"
              >
                <ArrowLeft className="h-4 w-4" />
                Change issue
              </button>

              <div className="text-xs font-bold text-slate-400">
                Step {Math.min(step + 1, selectedIssue.questions.length)} of {selectedIssue.questions.length}
              </div>
            </div>

            <div className="p-5 sm:p-7">
              <div className="mb-6 flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                  <selectedIssue.icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-lg font-extrabold text-slate-900">{selectedIssue.title}</div>
                  <div className="text-xs text-slate-500">Let's narrow down the possible cause.</div>
                </div>
              </div>

              {currentQuestion && (
                <>
                  <h2 className="text-xl font-extrabold text-slate-900">{currentQuestion.title}</h2>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {currentQuestion.options.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => chooseAnswer(option)}
                        className={`rounded-xl border px-4 py-3 text-left text-sm font-bold transition ${
                          answers[currentQuestion.key] === option
                            ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                            : "border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50"
                        }`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </>
              )}

              <div className="mt-6 border-t border-slate-100 pt-5">
                <label className="text-xs font-bold text-slate-700">
                  Anything else you noticed? <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <textarea
                  value={details}
                  onChange={(event) => setDetails(event.target.value)}
                  rows={3}
                  placeholder="Example: generation dropped after a new building started blocking sunlight..."
                  className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />

                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={reset}
                    className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50"
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    disabled={answerCount < selectedIssue.questions.length || isAnalyzing}
                    onClick={analyze}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isAnalyzing ? (
                      <>
                        <RefreshCcw className="h-4 w-4 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Analyze Issue
                      </>
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <div className="font-bold">AI diagnosis unavailable</div>
                  <div className="mt-1">{error}</div>
                </div>
              )}
            </div>
          </section>
        )}

        {result && (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-emerald-50 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-emerald-700 shadow-sm">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-extrabold text-slate-900">SolarIQ+ Diagnosis</div>
                  <div className="text-xs text-emerald-700">AI-assisted guidance based on your answers</div>
                </div>
              </div>
            </div>

            <div className="p-5 sm:p-7">
              <MarkdownResult text={result} />

              {mlContext?.available && (
                <div className="mb-6 rounded-2xl border border-violet-200 bg-violet-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-extrabold text-violet-950">ML Intelligence</div>
                      <div className="mt-1 text-xs text-violet-800">XGBoost reference model + SHAP feature importance</div>
                    </div>
                    <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-violet-700">Reference dataset</span>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <div className="rounded-xl bg-white p-3"><div className="text-[10px] font-bold uppercase text-slate-400">Model</div><div className="mt-1 text-sm font-extrabold text-slate-900">{mlContext.evaluation?.model || "XGBRegressor"}</div></div>
                    <div className="rounded-xl bg-white p-3"><div className="text-[10px] font-bold uppercase text-slate-400">SHAP</div><div className="mt-1 text-sm font-extrabold text-slate-900">{(mlContext.shap?.features || []).slice(0, 3).map((f) => f.feature || f.name).filter(Boolean).join(", ") || "Available"}</div></div>
                    <div className="rounded-xl bg-white p-3"><div className="text-[10px] font-bold uppercase text-slate-400">Scope</div><div className="mt-1 text-sm font-extrabold text-slate-900">Supporting evidence</div></div>
                  </div>
                  <p className="mt-3 text-[11px] leading-5 text-violet-800">This ML layer supports the Gemini diagnosis; it is not a live project telemetry prediction.</p>
                </div>
              )}

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  <div className="mt-2 text-xs font-extrabold text-slate-800">Safety first</div>
                  <div className="mt-1 text-[11px] leading-5 text-slate-500">
                    Do not open electrical equipment or perform unsafe rooftop work.
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  <div className="mt-2 text-xs font-extrabold text-slate-800">AI-assisted</div>
                  <div className="mt-1 text-[11px] leading-5 text-slate-500">
                    This is guidance, not a confirmed physical fault diagnosis.
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <CheckCircle2 className="h-5 w-5 text-blue-600" />
                  <div className="mt-2 text-xs font-extrabold text-slate-800">Next action</div>
                  <div className="mt-1 text-[11px] leading-5 text-slate-500">
                    Follow the recommended checks or contact a qualified technician when required.
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={scheduleMaintenance}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-extrabold text-white shadow-sm hover:bg-emerald-700"
                >
                  <CalendarDays className="h-4 w-4" />
                  Schedule Maintenance
                </button>

                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-extrabold text-white hover:bg-slate-800"
                >
                  <RefreshCcw className="h-4 w-4" />
                  Diagnose Another Issue
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
