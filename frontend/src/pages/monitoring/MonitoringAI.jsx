import {
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Bot,
  CalendarDays,
  ChevronRight,
  CircleHelp,
  Droplets,
  Gauge,
  MessageCircle,
  PanelTop,
  RefreshCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Sun,
  ThermometerSun,
  Wrench,
  Zap,
} from "lucide-react";

import { useNavigate } from "react-router-dom";
import { useProjectContext } from "@/context/ProjectContext";


const QUICK_ACTIONS = [
  {
    id: "low-generation",
    icon: Zap,
    title: "Low solar generation",
    description: "My system is producing less power than usual.",
  },
  {
    id: "inverter",
    icon: Gauge,
    title: "Inverter problem",
    description: "My inverter shows a warning or error.",
  },
  {
    id: "panel",
    icon: PanelTop,
    title: "Panel problem",
    description: "Panels look dirty, shaded, or damaged.",
  },
  {
    id: "cleaning",
    icon: Droplets,
    title: "Panel cleaning",
    description: "When should I clean my solar panels?",
  },
  {
    id: "weather",
    icon: ThermometerSun,
    title: "Weather impact",
    description: "Could weather be affecting my generation?",
  },
  {
    id: "maintenance",
    icon: Wrench,
    title: "Maintenance advice",
    description: "Give me a general maintenance checklist.",
  },
];


const BACKEND_URL =
  process.env.REACT_APP_BACKEND_URL ||
  "http://127.0.0.1:8000";


function getProjectContext(project) {
  if (!project || typeof project !== "object") {
    return null;
  }

  // Send useful project information only.
  const allowedKeys = [
    "id",
    "name",
    "project_name",
    "location",
    "city",
    "state",
    "consumer_type",
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
    "annual_generation",
    "monthly_generation",
  ];

  return allowedKeys.reduce((result, key) => {
    if (
      project[key] !== undefined &&
      project[key] !== null &&
      project[key] !== ""
    ) {
      result[key] = project[key];
    }
    return result;
  }, {});
}


function renderInlineMarkdown(text, keyPrefix = "inline") {
  const parts = String(text || "").split(
    /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g
  );

  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;

    if (
      part.startsWith("**") &&
      part.endsWith("**")
    ) {
      return (
        <strong key={key} className="font-bold text-slate-800">
          {part.slice(2, -2)}
        </strong>
      );
    }

    if (
      part.startsWith("`") &&
      part.endsWith("`")
    ) {
      return (
        <code
          key={key}
          className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[12px] text-slate-700"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    if (
      part.startsWith("*") &&
      part.endsWith("*") &&
      !part.startsWith("**")
    ) {
      return (
        <em key={key}>
          {part.slice(1, -1)}
        </em>
      );
    }

    return <span key={key}>{part}</span>;
  });
}


function MarkdownMessage({ text }) {
  const lines = String(text || "").split(/\r?\n/);
  const elements = [];
  let bulletItems = [];
  let numberedItems = [];

  function flushLists() {
    if (bulletItems.length) {
      elements.push(
        <ul
          key={`ul-${elements.length}`}
          className="my-2 list-disc space-y-1 pl-5"
        >
          {bulletItems.map((item, index) => (
            <li key={`bullet-${index}`}>
              {renderInlineMarkdown(item, `bullet-${index}`)}
            </li>
          ))}
        </ul>
      );
      bulletItems = [];
    }

    if (numberedItems.length) {
      elements.push(
        <ol
          key={`ol-${elements.length}`}
          className="my-2 list-decimal space-y-1 pl-5"
        >
          {numberedItems.map((item, index) => (
            <li key={`number-${index}`}>
              {renderInlineMarkdown(item, `number-${index}`)}
            </li>
          ))}
        </ol>
      );
      numberedItems = [];
    }
  }

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();

    if (!line || /^---+$/.test(line)) {
      flushLists();

      if (line === "") {
        elements.push(
          <div
            key={`space-${index}`}
            className="h-2"
          />
        );
      } else {
        elements.push(
          <hr
            key={`hr-${index}`}
            className="my-3 border-slate-200"
          />
        );
      }

      return;
    }

    const bulletMatch = line.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      numberedItems.length && flushLists();
      bulletItems.push(bulletMatch[1]);
      return;
    }

    const numberedMatch = line.match(/^\d+[.)]\s+(.+)$/);
    if (numberedMatch) {
      bulletItems.length && flushLists();
      numberedItems.push(numberedMatch[1]);
      return;
    }

    flushLists();

    const headingMatch = line.match(/^#{1,4}\s+(.+)$/);

    if (headingMatch) {
      elements.push(
        <h3
          key={`heading-${index}`}
          className="mt-3 mb-1 text-sm font-extrabold text-slate-900"
        >
          {renderInlineMarkdown(
            headingMatch[1],
            `heading-${index}`
          )}
        </h3>
      );
      return;
    }

    elements.push(
      <p
        key={`paragraph-${index}`}
        className="leading-6"
      >
        {renderInlineMarkdown(line, `line-${index}`)}
      </p>
    );
  });

  flushLists();

  return (
    <div className="text-sm leading-6 text-slate-600">
      {elements}
    </div>
  );
}


function AssistantMessage({ message }) {
  return (
    <div className="flex gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
        <Bot className="h-5 w-5" />
      </div>

      <div className="max-w-2xl rounded-2xl rounded-tl-md border border-slate-200 bg-white px-4 py-4 shadow-sm">
        {message.title && (
          <div className="mb-2 text-sm font-extrabold text-slate-900">
            {message.title}
          </div>
        )}

        <MarkdownMessage text={message.text} />
      </div>
    </div>
  );
}


function UserMessage({ text }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-xl whitespace-pre-wrap rounded-2xl rounded-tr-md bg-emerald-600 px-4 py-3 text-sm leading-6 text-white shadow-sm">
        {text}
      </div>
    </div>
  );
}


export default function MonitoringAI() {
  const navigate = useNavigate();
  const { activeProject } = useProjectContext();

  const projectName =
    activeProject?.name ||
    activeProject?.project_name ||
    "your solar system";

  const [messages, setMessages] = useState([
    {
      id: "welcome",
      type: "assistant",
      title: "Hi! I'm SolarIQ+",
      text:
        "I'm your intelligent solar assistant. Ask me about solar systems, troubleshooting, maintenance, generation, inverters, batteries, ROI, or even general questions.",
    },
  ]);

  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const inputRef = useRef(null);

  const recentQuestions = useMemo(
    () =>
      messages.filter(
        (message) => message.type === "user"
      ).length,
    [messages]
  );


  async function askQuestion(question) {
    const text = String(question || "").trim();

    if (!text || isTyping) {
      return;
    }

    const userMessage = {
      id: `user-${Date.now()}`,
      type: "user",
      text,
    };

    // Capture history before adding the current message.
    const history = messages
      .slice(-12)
      .map((message) => ({
        role:
          message.type === "user"
            ? "user"
            : "assistant",
        content: message.text,
      }));

    setMessages((current) => [
      ...current,
      userMessage,
    ]);

    setInput("");
    setIsTyping(true);

    try {
      const response = await fetch(
        `${BACKEND_URL}/api/ai-chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            message: text,
            history,
            project_context:
              getProjectContext(activeProject),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.detail ||
          data?.message ||
          "AI service is unavailable."
        );
      }

      const reply =
        data?.reply ||
        "I couldn't generate a response right now.";

      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          type: "assistant",
          text: reply,
        },
      ]);
    } catch (error) {
      console.error(
        "SolarIQ+ AI request failed:",
        error
      );

      setMessages((current) => [
        ...current,
        {
          id: `assistant-error-${Date.now()}`,
          type: "assistant",
          title: "AI service unavailable",
          text:
            error?.message ||
            "I couldn't reach the AI service. Please check that the SolarIQ+ backend is running and try again.",
        },
      ]);
    } finally {
      setIsTyping(false);

      window.setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }


  function handleSubmit(event) {
    event.preventDefault();

    const question = input.trim();

    if (!question || isTyping) {
      return;
    }

    askQuestion(question);
  }


  function resetChat() {
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        type: "assistant",
        title: "Ready to help",
        text:
          "What would you like to know? You can ask about your solar system, maintenance, troubleshooting, ROI, batteries, or any general question.",
      },
    ]);

    setInput("");
    setIsTyping(false);

    window.setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  }


  return (
    <div className="min-h-full bg-slate-50 pb-10">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">

        {/* HEADER */}
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
              <Sparkles className="h-4 w-4" />
              AI Maintenance
            </div>

            <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-950">
              SolarIQ+ Maintenance Assistant
            </h1>

            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
              Intelligent solar guidance for{" "}
              <span className="font-semibold text-slate-700">
                {projectName}
              </span>
              .
            </p>
          </div>

          <button
            type="button"
            onClick={resetChat}
            className="inline-flex items-center justify-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
          >
            <RefreshCcw className="h-4 w-4" />
            New conversation
          </button>
        </div>


        {/* STATUS CARDS */}
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              <span className="text-sm font-extrabold text-emerald-900">
                Safe guidance
              </span>
            </div>
            <p className="mt-1.5 text-xs leading-5 text-emerald-800">
              Practical maintenance and troubleshooting guidance.
            </p>
          </div>

          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-blue-600" />
              <span className="text-sm font-extrabold text-blue-900">
                {recentQuestions} questions
              </span>
            </div>
            <p className="mt-1.5 text-xs leading-5 text-blue-800">
              Ask follow-up questions naturally.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <Sun className="h-5 w-5 text-amber-500" />
              <span className="text-sm font-extrabold text-slate-900">
                Gemini AI
              </span>
            </div>
            <p className="mt-1.5 text-xs leading-5 text-slate-500">
              Intelligent conversational assistance.
            </p>
          </div>
        </div>


        <div className="grid gap-5 xl:grid-cols-[330px_minmax(0,1fr)]">

          {/* QUICK ACTIONS */}
          <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4">
              <div className="flex items-center gap-2">
                <CircleHelp className="h-5 w-5 text-emerald-600" />
                <h2 className="font-extrabold text-slate-900">
                  What do you need help with?
                </h2>
              </div>

              <p className="mt-1 text-xs leading-5 text-slate-500">
                Select a common issue to ask the AI assistant.
              </p>
            </div>

            <div className="space-y-2">
              {QUICK_ACTIONS.map((item) => {
                const Icon = item.icon;

                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={isTyping}
                    onClick={() => askQuestion(item.title)}
                    className="group flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition group-hover:bg-emerald-100 group-hover:text-emerald-700">
                      <Icon className="h-5 w-5" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-extrabold text-slate-800">
                        {item.title}
                      </div>
                      <div className="mt-0.5 text-[11px] leading-4 text-slate-400">
                        {item.description}
                      </div>
                    </div>

                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-emerald-600" />
                  </button>
                );
              })}
            </div>


            {/* SOLARIQ+ TOOLS */}
            <div className="mt-4 border-t border-slate-100 pt-4">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                SolarIQ+ Tools
              </div>

              <button
                type="button"
                onClick={() =>
                  navigate("/monitoring/maintenance")
                }
                className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-emerald-200 hover:bg-emerald-50"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-emerald-600">
                  <Wrench className="h-4 w-4" />
                </div>

                <div className="flex-1">
                  <div className="text-xs font-bold text-slate-800">
                    System Maintenance
                  </div>
                  <div className="text-[10px] text-slate-400">
                    View maintenance signals
                  </div>
                </div>

                <ChevronRight className="h-4 w-4 text-slate-300" />
              </button>


              <button
                type="button"
                onClick={() => navigate("/maintenance")}
                className="mt-2 flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-emerald-200 hover:bg-emerald-50"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-blue-600">
                  <CalendarDays className="h-4 w-4" />
                </div>

                <div className="flex-1">
                  <div className="text-xs font-bold text-slate-800">
                    Maintenance Planner
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Schedule preventive maintenance
                  </div>
                </div>

                <ChevronRight className="h-4 w-4 text-slate-300" />
              </button>
            </div>
          </aside>


          {/* CHAT */}
          <main className="flex min-h-[680px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

            <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
              <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                <Bot className="h-6 w-6" />
                <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
              </div>

              <div>
                <div className="font-extrabold text-slate-900">
                  SolarIQ+ AI Assistant
                </div>
                <div className="text-xs text-emerald-600">
                  Powered by Gemini
                </div>
              </div>
            </div>


            <div className="flex-1 space-y-5 overflow-y-auto bg-slate-50/60 p-5">
              {messages.map((message) =>
                message.type === "user" ? (
                  <UserMessage
                    key={message.id}
                    text={message.text}
                  />
                ) : (
                  <AssistantMessage
                    key={message.id}
                    message={message}
                  />
                )
              )}

              {isTyping && (
                <div className="flex gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                    <Bot className="h-5 w-5" />
                  </div>

                  <div className="rounded-2xl rounded-tl-md border border-slate-200 bg-white px-4 py-3">
                    <div className="flex gap-1">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-slate-300" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-slate-300 [animation-delay:120ms]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-slate-300 [animation-delay:240ms]" />
                    </div>
                  </div>
                </div>
              )}
            </div>


            <div className="border-t border-slate-200 bg-white p-4">
              <form
                onSubmit={handleSubmit}
                className="flex items-end gap-2"
              >
                <div className="relative flex-1">
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={(event) =>
                      setInput(event.target.value)
                    }
                    disabled={isTyping}
                    placeholder="Ask anything about solar or SolarIQ+..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100 disabled:opacity-60"
                  />
                </div>

                <button
                  type="submit"
                  disabled={!input.trim() || isTyping}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Send message"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>

              <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-400">
                <ShieldCheck className="h-3 w-3" />
                SolarIQ+ provides guidance and does not replace a qualified technician.
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
