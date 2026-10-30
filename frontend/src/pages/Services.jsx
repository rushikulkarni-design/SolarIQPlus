import React, { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, ClipboardList, Wrench, MapPin, CalendarDays } from "lucide-react";
import { useNavigate } from "react-router-dom";

const API = (process.env.REACT_APP_BACKEND_URL || "http://localhost:8000") + "/api";
const ITEMS = [
  ["panel-cleaning", "Solar Panel Cleaning", "Dust, bird-dropping and stain removal", "Droplet"],
  ["system-inspection", "Solar System Inspection", "Panels, mounting structures and general health", "Search"],
  ["inverter-servicing", "Inverter Servicing and Repair", "Inverter error and servicing requests", "Zap"],
  ["electrical-maintenance", "Electrical and Wiring Maintenance", "Cable, connector and electrical safety checks", "Cable"],
  ["performance-check", "Solar Performance Health Check", "Investigate lower-than-expected generation", "Activity"],
  ["panel-repair", "Solar Panel Repair and Replacement", "Damaged panels and replacement enquiries", "Hammer"],
  ["installation-expansion", "Solar Installation and Expansion", "New systems and capacity upgrades", "Sun"],
  ["battery-services", "Solar Battery Services", "Battery health, faults and replacement enquiries", "Battery"],
  ["consultation", "Solar Consultation", "Capacity, rooftop suitability and system advice", "MessageCircle"],
  ["annual-maintenance", "Annual Maintenance Contract (AMC)", "Scheduled preventive maintenance", "CalendarCheck"],
];
const card = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md";

export default function Services() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ phone: "", location: "", description: "", preferred_date: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [ticket, setTicket] = useState("");
  const [mine, setMine] = useState([]);
  const [tab, setTab] = useState("services");
  const [error, setError] = useState("");

  const loadMine = async () => {
    try {
      const r = await fetch(`${API}/service-requests/mine`, { credentials: "include" });
      if (r.ok) setMine(await r.json());
    } catch { /* Display empty history when offline. */ }
  };
  useEffect(() => { loadMine(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!selected) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const r = await fetch(`${API}/service-requests`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service_key: selected[0], ...form }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Could not submit your request. Please sign in and try again.");
      setTicket(data.ticket_id); setMessage(data.message || "Request submitted successfully.");
      setForm({ phone: "", location: "", description: "", preferred_date: "" });
      await loadMine();
    } catch (e2) { setError(e2.message || "Request failed."); }
    finally { setBusy(false); }
  };

  return <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-8">
    <div className="mx-auto max-w-6xl">
      <button onClick={() => navigate(-1)} className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-emerald-700"><ArrowLeft size={16}/> Back</button>
      <div className="mb-7 rounded-3xl bg-gradient-to-r from-emerald-950 to-emerald-700 p-7 text-white sm:p-9">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-200">SOLARIQ+ SERVICES</p>
        <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Solar care, made simple.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-emerald-50">Choose a service and send us a request. Our team will review your requirements and email you a quotation before booking.</p>
        <div className="mt-5 flex flex-wrap gap-2"><button onClick={() => {setTab("services"); setSelected(null);}} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === "services" ? "bg-white text-emerald-900" : "bg-white/15 text-white"}`}>Explore services</button><button onClick={() => {setTab("requests"); setSelected(null); loadMine();}} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === "requests" ? "bg-white text-emerald-900" : "bg-white/15 text-white"}`}>My requests ({mine.length})</button></div>
      </div>
      {message && <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900"><div className="flex items-center gap-2 font-semibold"><CheckCircle2 size={18}/> {message}</div>{ticket && <p className="mt-1 text-sm">Your ticket ID: <strong>{ticket}</strong>. Keep this for reference.</p>}</div>}
      {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {tab === "services" && !selected && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{ITEMS.map((item, i) => <button key={item[0]} onClick={() => {setSelected(item); setMessage(""); setTicket("");}} className={`${card} text-left`}><div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Wrench size={21}/></div><p className="text-xs font-semibold text-emerald-700">SERVICE {String(i+1).padStart(2,"0")}</p><h2 className="mt-1 text-lg font-bold text-slate-900">{item[1]}</h2><p className="mt-2 min-h-10 text-sm leading-5 text-slate-500">{item[2]}</p><span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-emerald-700">Request service <ArrowRight size={16}/></span></button>)}</div>}
      {tab === "services" && selected && <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><button onClick={() => setSelected(null)} className="mb-5 inline-flex items-center gap-2 text-sm text-slate-600"><ArrowLeft size={16}/> All services</button><p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Service request</p><h2 className="mt-1 text-2xl font-bold text-slate-900">{selected[1]}</h2><p className="mt-2 text-sm text-slate-500">Enter your contact and service details. We'll review the request and confirm charges before booking.</p><form onSubmit={submit} className="mt-6 space-y-4"><label className="block text-sm font-medium text-slate-700">Contact number *<input required minLength={7} maxLength={25} value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 outline-none focus:border-emerald-500" placeholder="Your phone number"/></label><label className="block text-sm font-medium text-slate-700">Service location *<textarea required minLength={5} maxLength={500} rows={2} value={form.location} onChange={e=>setForm({...form,location:e.target.value})} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 outline-none focus:border-emerald-500" placeholder="Full address / area / city"/></label><label className="block text-sm font-medium text-slate-700">Describe your requirement *<textarea required minLength={5} maxLength={2000} rows={3} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 outline-none focus:border-emerald-500" placeholder="Tell us briefly what you need"/></label><label className="block text-sm font-medium text-slate-700">Preferred date (optional)<input type="date" value={form.preferred_date} onChange={e=>setForm({...form,preferred_date:e.target.value})} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 outline-none focus:border-emerald-500"/></label><button disabled={busy} className="w-full rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">{busy ? "Submitting…" : "Submit service request"}</button><p className="text-xs text-slate-500">Submitting a request does not confirm a booking. We'll contact you with the quotation.</p></form></div>}
      {tab === "requests" && <div className="space-y-3">{mine.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><ClipboardList className="mx-auto mb-3 text-slate-400" size={32}/><h2 className="font-bold text-slate-900">No service requests yet</h2><p className="mt-1 text-sm text-slate-500">Your submitted requests will appear here.</p><button onClick={()=>setTab("services")} className="mt-4 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">Browse services</button></div> : mine.map(req=><div key={req.ticket_id} className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold text-emerald-700">{req.ticket_id}</p><h3 className="mt-1 font-bold text-slate-900">{req.service_name}</h3><p className="mt-1 text-sm text-slate-500">Submitted {req.created_at ? new Date(req.created_at).toLocaleString() : ""}</p></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">{req.status}</span></div>{req.quotation_amount != null && <p className="mt-3 text-sm">Quotation: <strong>₹{Number(req.quotation_amount).toLocaleString("en-IN")}</strong></p>}{req.quotation_notes && <p className="mt-1 text-sm text-slate-600">{req.quotation_notes}</p>}{req.appointment_date && <p className="mt-1 text-sm text-slate-600">Appointment: {req.appointment_date}</p>}</div>)}</div>}
    </div>
  </main>;
}
