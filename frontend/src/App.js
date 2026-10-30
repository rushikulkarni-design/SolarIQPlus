
import "@/App.css";

import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from "react-router-dom";

import {
  AuthProvider,
  useAuth,
} from "@/context/AuthContext";

import {
  ProjectProvider,
  useProjectContext,
} from "@/context/ProjectContext";

import { Toaster } from "@/components/ui/sonner";
import { Loader2, LockKeyhole, X } from "lucide-react";

import { AppLayout } from "@/components/layout/AppLayout";

import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import ShadowAnalysis from "@/pages/ShadowAnalysis";

import PlannerProject from "@/pages/planner/PlannerProject";
import PlannerBill from "@/pages/planner/PlannerBill";
import PlannerRooftop from "@/pages/planner/PlannerRooftop";
import PlannerAnalysis from "@/pages/planner/PlannerAnalysis";
import PlannerRecommendation from "@/pages/planner/PlannerRecommendation";
import PlannerFinancials from "@/pages/planner/PlannerFinancials";
import PlannerReport from "@/pages/planner/PlannerReport";

import { PlannerLayout } from "@/pages/planner/PlannerLayout";

import Maintenance from "@/pages/Maintenance";
import Reports from "@/pages/Reports";
import Settings from "@/pages/Settings";

import MonitoringAI from "@/pages/monitoring/MonitoringAI";
import IssueDiagnosis from "@/pages/monitoring/IssueDiagnosis";

import SolarSimulator from "@/pages/simulator/SolarSimulator";

import SetPassword from "@/pages/SetPassword";
import Services from "@/pages/Services";
import DeveloperLogin from "@/pages/DeveloperLogin";
import DeveloperPortal from "@/pages/DeveloperPortal";

// Public legal pages
import Terms from "@/pages/legal/Terms";
import Privacy from "@/pages/legal/Privacy";
import Disclaimer from "@/pages/legal/Disclaimer";


function PasswordReminder() {
  const {
    user,
    showPasswordReminder,
    dismissPasswordReminder,
  } = useAuth();

  const navigate = useNavigate();

  if (!user || !showPasswordReminder || user.has_password) {
    return null;
  }

  return (
    <aside
      role="dialog"
      aria-label="Set a password for your SolarIQ+ account"
      className="fixed right-4 top-4 z-[100] w-[calc(100%-2rem)] max-w-sm rounded-xl border border-emerald-200 bg-white p-4 shadow-2xl sm:right-6 sm:top-6"
    >
      <button
        type="button"
        onClick={dismissPasswordReminder}
        aria-label="Dismiss password reminder"
        className="absolute right-3 top-3 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3 pr-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
          <LockKeyhole className="h-5 w-5" />
        </div>

        <div>
          <h2 className="text-sm font-bold text-slate-900">
            Set a password for easier sign-in
          </h2>

          <p className="mt-1 text-sm leading-5 text-slate-600">
            You can keep using Google. Add a password so you can also sign in
            with your Gmail address and password.
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={dismissPasswordReminder}
          className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          Maybe later
        </button>

        <button
          type="button"
          onClick={() => {
            dismissPasswordReminder();
            navigate("/set-password");
          }}
          className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
        >
          Set password
        </button>
      </div>
    </aside>
  );
}


function FullscreenLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
      <Loader2 className="h-6 w-6 text-emerald-600 animate-spin" />
    </div>
  );
}


function ProtectedRoute({ children }) {
  const { user, checking } = useAuth();

  if (checking) {
    return <FullscreenLoader />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}


function PublicRoute({ children }) {
  const { user, checking } = useAuth();

  if (checking) {
    return <FullscreenLoader />;
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}


/*
 * Dashboard is the single post-login landing page.
 * Older monitoring-mode redirects are intentionally removed.
 */
function DashboardEntry() {
  const { isLoading } = useProjectContext();

  if (isLoading) {
    return <FullscreenLoader />;
  }

  try {
    localStorage.removeItem("siq_user_mode");
  } catch {
    // Ignore localStorage errors.
  }

  return <Dashboard />;
}


export default function App() {
  return (
    <AuthProvider>
      <ProjectProvider>
        <BrowserRouter>
          <PasswordReminder />

          <Routes>
            {/* PUBLIC LANDING PAGE / AUTH */}

            <Route
              path="/login"
              element={
                <PublicRoute>
                  <Login />
                </PublicRoute>
              }
            />

            {/* PUBLIC LEGAL PAGES */}

            <Route
              path="/terms"
              element={<Terms />}
            />

            <Route
              path="/privacy"
              element={<Privacy />}
            />

            <Route
              path="/disclaimer"
              element={<Disclaimer />}
            />

            {/* DEVELOPER PORTAL */}

            <Route
              path="/developer-login"
              element={<DeveloperLogin />}
            />

            <Route
              path="/developer-portal"
              element={<DeveloperPortal />}
            />

            {/* PUBLIC SIMULATOR */}

            <Route
              path="/simulator"
              element={<SolarSimulator />}
            />

            {/* MAIN APPLICATION: AUTHENTICATION REQUIRED */}

            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route
                path="/"
                element={<Navigate to="/dashboard" replace />}
              />

              {/* DASHBOARD */}

              <Route
                path="/dashboard"
                element={<DashboardEntry />}
              />

              {/* SOLAR PLANNER */}

              <Route
                path="/planner"
                element={<PlannerLayout />}
              >
                <Route
                  index
                  element={
                    <Navigate
                      to="/planner/project"
                      replace
                    />
                  }
                />

                <Route
                  path="project"
                  element={<PlannerProject />}
                />

                <Route
                  path="bill"
                  element={<PlannerBill />}
                />

                <Route
                  path="rooftop"
                  element={<PlannerRooftop />}
                />

                <Route
                  path="shadow"
                  element={<ShadowAnalysis />}
                />

                <Route
                  path="analysis"
                  element={<PlannerAnalysis />}
                />

                <Route
                  path="recommendation"
                  element={<PlannerRecommendation />}
                />

                <Route
                  path="financials"
                  element={<PlannerFinancials />}
                />

                <Route
                  path="report"
                  element={<PlannerReport />}
                />
              </Route>

              {/* AI & OPERATIONS */}

              <Route
                path="/monitoring/ai"
                element={<MonitoringAI />}
              />

              <Route
                path="/monitoring/issue-diagnosis"
                element={<IssueDiagnosis />}
              />

              <Route
                path="/maintenance"
                element={<Maintenance />}
              />

              {/* SERVICES */}

              <Route
                path="/services"
                element={<Services />}
              />

              {/* REPORTS / SETTINGS */}

              <Route
                path="/reports"
                element={<Reports />}
              />

              <Route
                path="/settings"
                element={<Settings />}
              />

              <Route
                path="/set-password"
                element={<SetPassword />}
              />

              {/* COMPATIBILITY ROUTES */}

              <Route
                path="/monitoring"
                element={
                  <Navigate
                    to="/dashboard"
                    replace
                  />
                }
              />

              <Route
                path="/performance/*"
                element={
                  <Navigate
                    to="/dashboard"
                    replace
                  />
                }
              />

              <Route
                path="/monitoring/generation"
                element={
                  <Navigate
                    to="/dashboard"
                    replace
                  />
                }
              />

              <Route
                path="/monitoring/weather"
                element={
                  <Navigate
                    to="/dashboard"
                    replace
                  />
                }
              />

              <Route
                path="/monitoring/maintenance"
                element={
                  <Navigate
                    to="/maintenance"
                    replace
                  />
                }
              />

              <Route
                path="/monitoring/inverter-connector"
                element={
                  <Navigate
                    to="/dashboard"
                    replace
                  />
                }
              />

              {/* DIRECT SHADOW ANALYSIS COMPATIBILITY */}

              <Route
                path="/shadow-analysis"
                element={<ShadowAnalysis />}
              />
            </Route>

            {/* UNKNOWN URL */}

            <Route
              path="*"
              element={
                <Navigate
                  to="/dashboard"
                  replace
                />
              }
            />
          </Routes>

          <Toaster
            position="top-right"
            richColors
          />
        </BrowserRouter>
      </ProjectProvider>
    </AuthProvider>
  );
}
