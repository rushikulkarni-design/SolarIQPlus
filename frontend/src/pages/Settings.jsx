import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SectionHeading, Panel, PanelHeader } from "@/components/common/Primitives";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { User, Sun, MapPin, Ruler, Bell, Palette, LogOut, LockKeyhole } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "profile", label: "Profile", icon: User },
  { key: "system", label: "Solar System", icon: Sun },
  { key: "location", label: "Location", icon: MapPin },
  { key: "units", label: "Units", icon: Ruler },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "appearance", label: "Appearance", icon: Palette },
];

export default function Settings() {
  const { user, logout, updateProfile } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(user?.name || "");
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => { setName(user?.name || ""); }, [user?.name]);

  const saveProfile = async () => {
    const cleanedName = name.trim();
    if (!cleanedName) { toast.error("Name cannot be empty"); return; }
    setSavingProfile(true);
    try { await updateProfile(cleanedName); toast.success("Profile updated"); }
    catch (error) { toast.error(error?.response?.data?.detail || "Could not save profile"); }
    finally { setSavingProfile(false); }
  };
  const [tab, setTab] = useState("profile");
  const [notif, setNotif] = useState({ anomaly: true, weather: false, maintenance: true, weekly: true });

  return (
    <div className="space-y-6">
      <SectionHeading eyebrow="Account" title="Settings" description="Manage your profile, solar system configuration and platform preferences." />

      <div className="grid lg:grid-cols-[220px_1fr] gap-4 items-start">
        {/* Tabs */}
        <Panel className="p-2">
          <nav className="space-y-0.5">
            {TABS.map((t) => (
              <button
                key={t.key}
                data-testid={`settings-tab-${t.key}`}
                onClick={() => setTab(t.key)}
                className={cn("w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors", tab === t.key ? "bg-navy-dark text-white font-medium" : "text-slate-600 hover:bg-slate-50")}
              >
                <t.icon className="h-4 w-4" /> {t.label}
              </button>
            ))}
          </nav>
        </Panel>

        <div>
          {tab === "profile" && (
            <Panel>
              <PanelHeader title="Profile" />
              <div className="p-5 grid sm:grid-cols-2 gap-4 max-w-lg">
                <div className="sm:col-span-2"><Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5" data-testid="settings-name" maxLength={100} /></div>
                <div className="sm:col-span-2"><Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Email</Label><Input value={user?.email || ""} disabled className="mt-1.5" /></div>
                <div className="sm:col-span-2 flex flex-wrap gap-2 pt-1">
                  <Button onClick={saveProfile} disabled={savingProfile} className="bg-navy-dark hover:bg-navy" data-testid="settings-save">{savingProfile ? "Saving…" : "Save changes"}</Button>
                  <Button type="button" variant="outline" onClick={() => navigate("/set-password")}><LockKeyhole className="mr-1.5 h-4 w-4" /> Set / Change password</Button>
                  <Button variant="outline" onClick={logout} className="text-red-600 border-red-200 hover:bg-red-50"><LogOut className="h-4 w-4 mr-1.5" /> Sign out</Button>
                </div>
              </div>
            </Panel>
          )}

          {tab === "system" && (
            <Panel>
              <PanelHeader title="Solar System" />
              <div className="p-5 grid sm:grid-cols-2 gap-4 max-w-lg">
                <p className="sm:col-span-2 text-sm text-slate-600">System details are shown from your saved solar project. Open the project planner to add or edit system specifications.</p>
              </div>
            </Panel>
          )}

          {tab === "location" && (
            <Panel>
              <PanelHeader title="Location" />
              <div className="p-5 grid sm:grid-cols-2 gap-4 max-w-lg">
                <p className="sm:col-span-2 text-sm text-slate-600">Location is taken from your saved solar project. Open the project planner to add or edit the project location.</p>
              </div>
            </Panel>
          )}

          {tab === "units" && (
            <Panel>
              <PanelHeader title="Units" />
              <div className="p-5 space-y-4 max-w-md">
                {[["Energy", "kWh"], ["Currency", "INR (₹)"], ["Temperature", "Celsius (°C)"], ["Irradiance", "W/m²"]].map(([l, v]) => (
                  <div key={l} className="flex items-center justify-between py-2 border-b border-slate-100">
                    <span className="text-sm text-slate-600">{l}</span>
                    <span className="text-sm font-mono font-medium text-navy-dark">{v}</span>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {tab === "notifications" && (
            <Panel>
              <PanelHeader title="Notifications" />
              <div className="p-5 space-y-1 max-w-lg">
                {[
                  ["anomaly", "Anomaly alerts", "Notify when performance deviates from the baseline."],
                  ["maintenance", "Maintenance reminders", "Panel cleaning and inspection schedules."],
                  ["weather", "Weather advisories", "Low-irradiance and severe-weather notices."],
                  ["weekly", "Weekly summary", "A digest of generation and performance."],
                ].map(([k, l, d]) => (
                  <div key={k} className="flex items-center justify-between py-3 border-b border-slate-100">
                    <div><div className="text-sm font-medium text-navy-dark">{l}</div><div className="text-xs text-slate-500">{d}</div></div>
                    <Switch checked={notif[k]} onCheckedChange={(v) => setNotif({ ...notif, [k]: v })} data-testid={`notif-${k}`} />
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {tab === "appearance" && (
            <Panel>
              <PanelHeader title="Appearance" />
              <div className="p-5 max-w-lg">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border-2 border-navy-dark p-4">
                    <div className="h-16 rounded bg-[#F8FAFC] border border-slate-200 mb-2 flex items-center justify-center"><div className="h-2 w-16 rounded bg-navy-dark" /></div>
                    <div className="text-sm font-medium text-navy-dark flex items-center justify-between">Light <span className="text-[10px] font-mono text-emerald-600">ACTIVE</span></div>
                  </div>
                  <div className="rounded-md border border-slate-200 p-4 opacity-60">
                    <div className="h-16 rounded bg-navy-dark border border-slate-700 mb-2 flex items-center justify-center"><div className="h-2 w-16 rounded bg-amber" /></div>
                    <div className="text-sm font-medium text-slate-500 flex items-center justify-between">Dark <span className="text-[10px] font-mono text-slate-400">SOON</span></div>
                  </div>
                </div>
                <p className="text-xs text-slate-400 mt-4">SolarIQ+ uses a light engineering theme optimised for data readability.</p>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
