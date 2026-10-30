
import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  ArrowRight,
  Search,
  FileText,
  ChartNoAxesColumnIncreasing,
  Wrench,
  LayoutGrid,
  Menu,
  X,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase";

const HERO =
  "https://images.unsplash.com/photo-1767614640055-1f971ed007e9?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2OTF8MHwxfHNlYXJjaHwzfHxzb2xhciUyMHBhbmVscyUyMHN1bnNldCUyMGNsZWFuJTIwZW5lcmd5fGVufDB8fHx8MTc4ODA5MzQ4M3ww&ixlib=rb-4.1.0&q=85";

const features = [
  {
    icon: FileText,
    title: "Bill Analysis (OCR)",
    body: "Upload your electricity bill and extract key details automatically.",
    key: "ocr",
  },
  {
    icon: ChartNoAxesColumnIncreasing,
    title: "Solar Planning",
    body: "Get system size, panel type options and estimated savings.",
    key: "planning",
  },
  {
    icon: Wrench,
    title: "Maintenance Support",
    body: "AI-based troubleshooting and a practical maintenance planner.",
    key: "maintenance",
  },
  {
    icon: LayoutGrid,
    title: "Compare Options",
    body: "Compare monofacial and bifacial panels with clear insights.",
    key: "compare",
  },
];

export default function Login() {
  const { login, register, googleLogin } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [activeFeature, setActiveFeature] = useState(null);

  useEffect(() => {
    document.title = "SolarIQ+ | Smarter solar planning";
  }, []);

  useEffect(() => {
    let cancelled = false;
    const clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;

    console.log("Client ID prefix:", clientId?.slice(0, 15));
    console.log("Google Client ID loaded:", Boolean(clientId));
    console.log("Frontend environment:", process.env.NODE_ENV);

    if (!clientId) return;

    const mountGoogleButton = () => {
      if (cancelled || !window.google?.accounts?.id) return;

      const target = document.getElementById("google-signin-button");
      if (!target) return;

      target.innerHTML = "";

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async ({ credential }) => {
          setError("");
          setLoading(true);

          try {
            await googleLogin(credential);
            navigate("/dashboard", { replace: true });
          } catch (err) {
            setError(
              formatApiError(err.response?.data?.detail) ||
                "Google sign-in failed. Please try again."
            );
          } finally {
            setLoading(false);
          }
        },
      });

      window.google.accounts.id.renderButton(target, {
        type: "standard",
        theme: "outline",
        size: "large",
        shape: "rectangular",
        text: mode === "login" ? "continue_with" : "signup_with",
        width: 360,
        logo_alignment: "left",
      });
    };

    if (window.google?.accounts?.id) {
      mountGoogleButton();
    } else {
      let script = document.querySelector(
        'script[data-google-identity="true"]'
      );

      if (!script) {
        script = document.createElement("script");
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.defer = true;
        script.dataset.googleIdentity = "true";
        document.head.appendChild(script);
      }

      script.addEventListener("load", mountGoogleButton);
    }

    return () => {
      cancelled = true;
    };
  }, [mode, googleLogin, navigate]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "login") {
        await login(form.email, form.password);
      } else {
        await register(form.name, form.email, form.password);
      }

      navigate("/dashboard");
    } catch (err) {
      setError(
        formatApiError(err.response?.data?.detail) ||
          err.message ||
          "Unable to sign in. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const go = (target) => {
    setMobileMenu(false);

    if (target.startsWith("/")) {
      navigate(target);
    } else {
      document
        .querySelector(target)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <main className="min-h-screen bg-white text-[#101d39]">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-[76px] max-w-[1600px] items-center justify-between gap-5 px-5 sm:px-8 lg:px-12">
        
        <button
          onClick={() =>
            window.scrollTo({ top: 0, behavior: "smooth" })
          }
          className="flex shrink-0 items-center gap-3"
          aria-label="SolarIQ+ home"
        >
          <img
            src="/solariq-logo.png"
            alt="SolarIQ+ logo"
            className="h-10 w-10 object-contain"
          />

          <span className="text-[25px] font-extrabold tracking-[-0.06em] text-[#101d39]">
            SOLARIQ<span className="text-emerald-600">+</span>
          </span>
        </button>



          <nav
            className="hidden items-center gap-8 lg:flex"
            aria-label="Main navigation"
          >
            <button
              onClick={() => go("#top")}
              className="border-b-2 border-emerald-700 py-2 text-sm font-semibold text-emerald-800"
            >
              Home
            </button>
            <button
              onClick={() => go("#how-it-works")}
              className="py-2 text-sm font-semibold text-slate-800 hover:text-emerald-700"
            >
              How It Works
            </button>
            <button
              onClick={() => go("#features")}
              className="py-2 text-sm font-semibold text-slate-800 hover:text-emerald-700"
            >
              Features
            </button>
            <button
              onClick={() => go("#pricing")}
              className="py-2 text-sm font-semibold text-slate-800 hover:text-emerald-700"
            >
              Pricing
            </button>
            <button
              onClick={() => go("#learn")}
              className="py-2 text-sm font-semibold text-slate-800 hover:text-emerald-700"
            >
              Learn
            </button>
            <button
              onClick={() => go("#about")}
              className="py-2 text-sm font-semibold text-slate-800 hover:text-emerald-700"
            >
              About
            </button>
          </nav>

          <div className="hidden items-center gap-3 sm:flex">
            <button
              onClick={() => go("#features")}
              aria-label="Search features"
              className="mr-2 border-r border-slate-200 pr-4 text-[#101d39] hover:text-emerald-700"
            >
              <Search className="h-5 w-5" />
            </button>

            <Button
              onClick={() => navigate("/simulator")}
              className="h-11 rounded-lg bg-emerald-700 px-5 font-semibold text-white shadow-sm hover:bg-emerald-800"
            >
              Try Simulator
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/developer-login")}
              className="h-11 rounded-lg border-emerald-700 px-4 font-semibold text-emerald-800 hover:bg-emerald-50"
            >
              Developer Portal
            </Button>
          </div>

          <button
            className="rounded-md p-2 lg:hidden"
            onClick={() => setMobileMenu(!mobileMenu)}
            aria-label="Toggle menu"
          >
            {mobileMenu ? <X /> : <Menu />}
          </button>
        </div>

        {mobileMenu && (
          <div className="grid gap-1 border-t bg-white px-5 py-3 lg:hidden">
            {[
              ["Home", "#top"],
              ["How It Works", "#how-it-works"],
              ["Features", "#features"],
              ["Pricing", "#pricing"],
              ["Learn", "#learn"],
              ["About", "#about"],
            ].map(([label, target]) => (
              <button
                key={label}
                onClick={() => go(target)}
                className="rounded-md px-3 py-2 text-left text-sm font-medium hover:bg-emerald-50"
              >
                {label}
              </button>
            ))}

            <button
              onClick={() => go("/developer-login")}
              className="mt-2 rounded-md border border-emerald-700 px-3 py-2 text-left text-sm font-semibold text-emerald-800 hover:bg-emerald-50"
            >
              Developer Portal
            </button>
          </div>
        )}
      </header>

      <section
        id="top"
        className="relative isolate min-h-[560px] overflow-hidden bg-[#eaf3f9] lg:min-h-[560px]"
      >
        <img
          src={HERO}
          alt="Solar panels on a rooftop in daylight"
          className="absolute inset-0 -z-20 h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0 -z-10 bg-white/65" />

        <div className="mx-auto grid max-w-[1600px] items-center gap-9 px-5 py-10 sm:px-8 md:py-12 lg:grid-cols-[minmax(0,1fr)_455px] lg:gap-12 lg:px-12 lg:py-12">
          <div className="max-w-[760px] py-2 lg:py-6">
            <p className="mb-5 text-xs font-bold uppercase tracking-[0.18em] text-slate-600 sm:text-sm">
              PLAN <span className="px-1 text-emerald-700">•</span> ANALYZE{" "}
              <span className="px-1 text-emerald-700">•</span> DESIGN{" "}
              <span className="px-1 text-emerald-700">•</span> MAINTAIN
            </p>

            <h1 className="max-w-[760px] text-4xl font-extrabold leading-[1.08] tracking-[-0.045em] text-[#101d39] sm:text-5xl lg:text-[clamp(3.2rem,4vw,4.35rem)]">
              Smarter solar planning
              <br className="hidden xl:block" /> for{" "}
              <span className="text-emerald-700">
                a cleaner tomorrow.
              </span>
            </h1>

            <p
              id="how-it-works"
              className="mt-6 max-w-[570px] text-base font-medium leading-7 text-slate-600 sm:text-lg"
            >
              Upload your electricity bill, analyze your energy usage, get
              personalized solar recommendations, and manage your system
              lifecycle — all in one platform.
            </p>

            <Button
              onClick={() => navigate("/simulator")}
              className="mt-6 h-[58px] min-w-[255px] rounded-xl bg-emerald-700 px-8 text-base font-bold text-white shadow-sm hover:bg-emerald-800"
            >
              Try Solar Simulator
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>

            <p className="mt-4 text-sm font-medium text-slate-600">
              No account needed to try the simulator
            </p>
          </div>

          <div className="w-full rounded-[22px] border border-white/80 bg-white/95 p-6 shadow-[0_12px_40px_rgba(15,35,60,0.16)] sm:p-7 lg:p-7">
            <h2 className="text-[30px] font-extrabold tracking-[-0.04em] text-[#101d39]">
              {mode === "login" ? "Sign in" : "Create your account"}
            </h2>

            <p className="mt-1 text-sm font-medium text-slate-500">
              {mode === "login"
                ? "Access your solar planning workspace."
                : "Start planning a new solar installation."}
            </p>

            <div
              id="google-signin-button"
              className="mt-5 flex min-h-10 justify-center"
              aria-label="Continue with Google"
            />

            <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
              <span className="h-px flex-1 bg-slate-200" />
              <span>or use email</span>
              <span className="h-px flex-1 bg-slate-200" />
            </div>

            <form onSubmit={submit} className="space-y-4">
              {mode === "register" && (
                <div>
                  <Label
                    htmlFor="name"
                    className="text-xs font-bold text-slate-800"
                  >
                    Full name
                  </Label>
                  <Input
                    id="name"
                    required
                    value={form.name}
                    onChange={(e) =>
                      setForm({ ...form, name: e.target.value })
                    }
                    placeholder="Your name"
                    className="mt-1.5 h-11 rounded-lg border-slate-200"
                  />
                </div>
              )}

              <div>
                <Label
                  htmlFor="email"
                  className="text-xs font-bold text-slate-800"
                >
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) =>
                    setForm({ ...form, email: e.target.value })
                  }
                  placeholder="you@example.com"
                  className="mt-1.5 h-11 rounded-lg border-slate-200"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="password"
                    className="text-xs font-bold text-slate-800"
                  >
                    Password
                  </Label>

                  <button
                    type="button"
                    onClick={async () => {
                      setError("");

                      if (!form.email.trim()) {
                        setError(
                          "Enter your email address first, then click Forgot password."
                        );
                        return;
                      }

                      setLoading(true);

                      try {
                        await sendPasswordResetEmail(
                          auth,
                          form.email.trim()
                        );
                        setError(
                          "Password-reset email sent. Check your inbox and spam folder."
                        );
                      } catch (err) {
                        const messages = {
                          "auth/user-not-found":
                            "No Firebase account was found for this email.",
                          "auth/invalid-email":
                            "Enter a valid email address.",
                          "auth/too-many-requests":
                            "Too many attempts. Please wait and try again.",
                        };

                        setError(
                          messages[err.code] ||
                            err.message ||
                            "Could not send the reset email."
                        );
                      } finally {
                        setLoading(false);
                      }
                    }}
                    className="text-xs font-semibold text-emerald-700 hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>

                <Input
                  id="password"
                  type="password"
                  required
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                  placeholder="Enter your password"
                  className="mt-1.5 h-11 rounded-lg border-slate-200"
                />
              </div>

              {error && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                >
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="h-11 w-full rounded-lg bg-emerald-700 font-bold text-white hover:bg-emerald-800"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    {mode === "login" ? "Sign in" : "Create account"}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </form>

            <p className="mt-5 text-center text-sm text-slate-500">
              {mode === "login"
                ? "New to SolarIQ+? "
                : "Already have an account? "}
              <button
                onClick={() => {
                  setMode(mode === "login" ? "register" : "login");
                  setError("");
                }}
                className="font-bold text-emerald-700 hover:underline"
              >
                {mode === "login" ? "Create an account" : "Sign in"}
              </button>
            </p>
          </div>
        </div>
      </section>

      <section
        id="features"
        className="mx-auto grid max-w-[1600px] scroll-mt-24 gap-4 px-5 py-6 sm:grid-cols-2 sm:px-8 lg:grid-cols-4 lg:px-12 lg:py-7"
      >
        {features.map(({ icon: Icon, title, body, key }) => (
          <article
            key={title}
            className="group min-h-[168px] rounded-[20px] border border-slate-200/90 bg-white p-5 transition-colors hover:border-emerald-200 hover:shadow-sm sm:p-5"
          >
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <Icon className="h-7 w-7" strokeWidth={2.2} />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-bold tracking-tight text-[#101d39]">
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-5 text-slate-500">
                  {body}
                </p>
                <button
                  onClick={() => setActiveFeature(key)}
                  className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-emerald-700 hover:text-emerald-900"
                >
                  Learn more
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </button>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section
        id="pricing"
        className="scroll-mt-24 border-y border-slate-100 bg-slate-50/80 px-5 py-14 sm:px-8 lg:px-12"
      >
        <div className="mx-auto max-w-5xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
            Simple to get started
          </p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-[#101d39] sm:text-4xl">
            Explore your solar potential for free
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-600">
            Start with an estimate before deciding on a rooftop solar
            installation. You can explore the simulator without creating an
            account.
          </p>

          <div className="mx-auto mt-7 grid max-w-3xl gap-4 text-left sm:grid-cols-2">
            <article className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold text-[#101d39]">
                Free solar simulation
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Explore system sizing, estimated generation and indicative
                savings.
              </p>
              <p className="mt-4 text-sm font-semibold text-emerald-700">
                No account required
              </p>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold text-[#101d39]">
                SolarIQ+ workspace
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Sign in to access the available planning and maintenance
                workflow.
              </p>
              <p className="mt-4 text-sm font-semibold text-emerald-700">
                Account required
              </p>
            </article>
          </div>
        </div>
      </section>

      <section
        id="learn"
        className="scroll-mt-24 px-5 py-14 sm:px-8 lg:px-12"
      >
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
            Learn
          </p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-[#101d39]">
            Understand the steps before you install
          </h2>

          <div className="mt-7 grid gap-4 sm:grid-cols-3">
            {[
              [
                "01",
                "Estimate",
                "Use your electricity usage to begin exploring a suitable solar system.",
              ],
              [
                "02",
                "Compare",
                "Review system and panel options with indicative generation and savings.",
              ],
              [
                "03",
                "Plan maintenance",
                "Explore practical checks and troubleshooting guidance for solar systems.",
              ],
            ].map(([number, title, body]) => (
              <article
                key={number}
                className="rounded-2xl border border-slate-200 p-5"
              >
                <span className="text-sm font-extrabold text-emerald-700">
                  {number}
                </span>
                <h3 className="mt-2 font-bold text-[#101d39]">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        id="about"
        className="scroll-mt-24 bg-[#102039] px-5 py-14 text-white sm:px-8 lg:px-12"
      >
        <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-[1.2fr_1fr] md:items-start">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
              About SolarIQ+
            </p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight">
              Practical solar planning, in one place.
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-7 text-slate-300">
              SolarIQ+ brings together solar planning estimates, system
              comparison and maintenance support to help users explore their
              options with greater clarity.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/15 bg-white/5 p-4">
              <h3 className="font-bold">Plan</h3>
              <p className="mt-1 text-sm leading-6 text-slate-300">
                Explore system sizing and rooftop planning.
              </p>
            </div>
            <div className="rounded-xl border border-white/15 bg-white/5 p-4">
              <h3 className="font-bold">Maintain</h3>
              <p className="mt-1 text-sm leading-6 text-slate-300">
                Access maintenance and troubleshooting guidance.
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-[1600px] flex-col gap-4 px-5 py-6 text-xs text-slate-500 sm:px-8 lg:px-12">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span>
            © {new Date().getFullYear()} SolarIQ+ · Solar planning and maintenance
            intelligence
          </span>
          <span>
            Explore responsibly. Estimates are indicative and should be verified
            before installation.
          </span>
        </div>
        <nav aria-label="Legal policies" className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-200 pt-4">
          <span className="font-bold uppercase tracking-wider text-slate-600">Legal &amp; Policies</span>
          <Link to="/terms" className="font-medium hover:text-emerald-700 hover:underline">Terms &amp; Conditions</Link>
          <Link to="/privacy" className="font-medium hover:text-emerald-700 hover:underline">Privacy Policy</Link>
          <Link to="/disclaimer" className="font-medium hover:text-emerald-700 hover:underline">Disclaimer</Link>
        </nav>
      </footer>

      {activeFeature &&
        (() => {
          const content = {
            ocr: {
              title: "Bill Analysis (OCR)",
              intro:
                "Turn an electricity bill into structured usage information for solar planning.",
              steps: [
                "Upload a clear photo or PDF of your electricity bill.",
                "The system prepares the document for text recognition, improving readability where possible.",
                "OCR extracts visible text such as billing period, units consumed and bill details.",
                "The app identifies relevant fields and checks whether the values can be used for the next planning step.",
                "Review the extracted values and correct anything that looks wrong before continuing.",
              ],
              note:
                "OCR can occasionally miss or misread text when a bill is blurry, tilted, low-resolution or uses an unfamiliar layout. Always review the extracted values before relying on the estimate.",
            },
            planning: {
              title: "Solar Planning",
              intro:
                "Explore a preliminary rooftop solar setup using your usage and planning inputs.",
              steps: [
                "Enter or confirm your electricity usage and location.",
                "Review the suggested system capacity and panel configuration.",
                "Explore estimated generation and potential bill savings.",
                "Adjust assumptions to compare how a different system size affects the estimate.",
                "Use the results as a starting point for a site assessment and installer quote.",
              ],
              note:
                "Generation, savings and payback are estimates. Actual results depend on roof conditions, shading, tariffs, equipment and installation quality.",
            },
            maintenance: {
              title: "Maintenance Support",
              intro:
                "Get structured guidance for common solar-system questions and routine upkeep.",
              steps: [
                "Choose the symptom or maintenance task you want help with.",
                "Review the relevant checks and likely causes suggested by the assistant.",
                "Follow safe visual checks and record any observations.",
                "Use the maintenance planner to organize routine inspections and cleaning reminders.",
                "Contact a qualified technician for electrical faults, damaged equipment or unsafe conditions.",
              ],
              note:
                "Guidance is informational and does not replace a qualified technician. Do not open electrical equipment or work on live solar components.",
            },
            compare: {
              title: "Compare Solar Options",
              intro:
                "Compare panel configurations using consistent assumptions rather than choosing from a label alone.",
              steps: [
                "Choose the system capacity and basic site assumptions.",
                "Review the monofacial and bifacial options available in the planner.",
                "Compare estimated generation, space needs and indicative cost or savings where available.",
                "Check whether the roof surface and installation setup are suitable for the selected panel type.",
                "Use the comparison to shortlist options for a professional quote.",
              ],
              note:
                "Bifacial panels do not automatically produce more energy in every installation. Rear-side gain depends on mounting height, roof reflectivity, spacing and site conditions.",
            },
          }[activeFeature];

          return (
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-md"
              role="presentation"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) {
                  setActiveFeature(null);
                }
              }}
            >
              <style>{`
                @keyframes solarFlowIn {
                  from {
                    opacity: 0;
                    transform: translateY(14px) scale(.985);
                  }
                  to {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                  }
                }

                @keyframes solarLineGrow {
                  from { transform: scaleY(0); }
                  to { transform: scaleY(1); }
                }

                @media (prefers-reduced-motion: reduce) {
                  [style*="solarFlowIn"],
                  [style*="solarLineGrow"] {
                    animation: none !important;
                  }
                }
              `}</style>

              <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="feature-dialog-title"
                className="relative max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[28px] border border-white/80 bg-white p-5 shadow-[0_30px_100px_rgba(2,8,23,0.35)] sm:p-8"
              >
                <button
                  onClick={() => setActiveFeature(null)}
                  aria-label="Close feature details"
                  className="absolute right-4 top-4 rounded-full border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>

                <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
                  How it works
                </p>

                <h2
                  id="feature-dialog-title"
                  className="mt-2 pr-10 text-2xl font-extrabold tracking-tight text-[#101d39] sm:text-3xl"
                >
                  {content.title}
                </h2>

                <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
                  {content.intro}
                </p>

                <div className="relative mt-7 rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/80 via-white to-sky-50/70 p-4 sm:p-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-emerald-700">
                        The workflow
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Follow each step from start to finish
                      </p>
                    </div>
                    <span className="rounded-full border border-emerald-100 bg-white px-3 py-1 text-[10px] font-bold text-emerald-800">
                      {content.steps.length} STEPS
                    </span>
                  </div>

                  <ol className="relative space-y-0">
                    {content.steps.map((step, index) => (
                      <li
                        key={step}
                        className="relative flex gap-4 pb-4 last:pb-0"
                        style={{
                          animation:
                            "solarFlowIn 520ms cubic-bezier(.2,.8,.2,1) both",
                          animationDelay: `${index * 130}ms`,
                        }}
                      >
                        {index < content.steps.length - 1 && (
                          <span
                            aria-hidden="true"
                            className="absolute bottom-0 left-[19px] top-10 w-[2px] overflow-hidden rounded-full bg-emerald-100"
                          >
                            <span
                              className="block h-full w-full origin-top rounded-full bg-gradient-to-b from-emerald-500 to-teal-300"
                              style={{
                                animation: "solarLineGrow 650ms ease-out both",
                                animationDelay: `${index * 130 + 180}ms`,
                              }}
                            />
                          </span>
                        )}

                        <span className="relative z-[1] flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-emerald-100 bg-white text-emerald-800 shadow-[0_4px_12px_rgba(16,185,129,0.12)]">
                          <span className="text-sm font-extrabold">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                        </span>

                        <div className="min-w-0 flex-1 rounded-2xl border border-white bg-white/95 p-3.5 shadow-[0_5px_18px_rgba(15,35,60,0.06)] transition duration-200 hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-[0_10px_24px_rgba(15,35,60,0.09)] sm:p-4">
                          <div className="mb-1 flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            <span className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-emerald-700">
                              Step {index + 1}
                            </span>
                          </div>
                          <p className="text-sm leading-6 text-slate-700">
                            {step}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>

                  <div
                    className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-600 px-4 py-3 text-white shadow-[0_8px_20px_rgba(5,150,105,0.18)]"
                    style={{
                      animation: "solarFlowIn 520ms ease-out both",
                      animationDelay: `${
                        content.steps.length * 130 + 120
                      }ms`,
                    }}
                  >
                    <CheckCircle2 className="h-5 w-5 shrink-0" />
                    <div>
                      <p className="text-sm font-bold">
                        Ready for the next step
                      </p>
                      <p className="text-xs text-emerald-50">
                        Review the outcome before making a decision.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                  <p className="text-sm leading-6 text-amber-950">
                    {content.note}
                  </p>
                </div>

                <div className="mt-6 flex justify-end">
                  <Button
                    onClick={() => setActiveFeature(null)}
                    className="rounded-lg bg-emerald-700 px-5 text-white hover:bg-emerald-800"
                  >
                    Got it
                  </Button>
                </div>
              </section>
            </div>
          );
        })()}
    </main>
  );
}
