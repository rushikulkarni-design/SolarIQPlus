import { Link } from "react-router-dom";
import { SolarMark } from "@/components/common/Primitives";

function LegalPage({ title, updated, children }) {
  return (
    <main className="min-h-screen bg-slate-50 text-[#101d39]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link to="/login" className="flex items-center gap-3" aria-label="SolarIQ+ home">
            <SolarMark className="h-9 w-9" />
            <span className="text-xl font-extrabold tracking-tight">SOLARIQ<span className="text-emerald-600">+</span></span>
          </Link>
          <Link to="/login" className="text-sm font-semibold text-emerald-800 hover:underline">Back to SolarIQ+</Link>
        </div>
      </header>
      <article className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">SolarIQ+ · Legal &amp; Policies</p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-3 text-sm text-slate-500">Last updated: {updated}</p>
        <div className="mt-8 space-y-7 text-sm leading-7 text-slate-700">{children}</div>
        <nav aria-label="Other legal pages" className="mt-12 flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-200 pt-5 text-sm font-semibold text-emerald-800">
          <Link to="/terms" className="hover:underline">Terms &amp; Conditions</Link>
          <Link to="/privacy" className="hover:underline">Privacy Policy</Link>
          <Link to="/disclaimer" className="hover:underline">Disclaimer</Link>
        </nav>
      </article>
      <footer className="border-t border-slate-200 bg-white px-5 py-5 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} SolarIQ+. Solar planning and maintenance intelligence.
      </footer>
    </main>
  );
}

function Section({ title, children }) {
  return (
    <section>
      <h2 className="mb-2 text-lg font-bold text-[#101d39]">{title}</h2>
      {children}
    </section>
  );
}

export default function Disclaimer() {
  return (
    <LegalPage title="Disclaimer" updated="27 October 2026">
      <p>SolarIQ+ is designed to help users explore solar planning and maintenance information. Its outputs are informational and should not be treated as a guarantee, a professional site survey, or a substitute for qualified technical advice.</p>
      <Section title="1. Solar generation and savings">
        <p>Generation, system-size, savings, financial, and payback results are estimates based on available inputs, assumptions, and models. Actual results can differ because of location, weather, shading, roof orientation and condition, equipment, system design, tariffs, usage patterns, installation quality, maintenance, and other factors.</p>
      </Section>
      <Section title="2. Electricity-bill OCR">
        <p>Text recognition may omit, misread, or incorrectly interpret bill details, especially when files are blurry, tilted, incomplete, low-resolution, or use an unsupported layout. Check all extracted units, dates, and amounts against the original bill before using them.</p>
      </Section>
      <Section title="3. AI and maintenance guidance">
        <p>Automated responses may be incomplete or incorrect and may not account for the conditions of your particular system. Do not open electrical equipment, touch exposed conductors, work on live components, climb onto an unsafe roof, or attempt repairs beyond your training. For faults, damage, unusual heating, burning smells, or other unsafe conditions, stop and contact a qualified technician.</p>
      </Section>
      <Section title="4. Service requests and prices">
        <p>A submitted service request is not a confirmed appointment or final price. Charges, scope, parts, taxes, timing, and availability must be confirmed by the service provider. Check the written quotation and service terms before approving work.</p>
      </Section>
      <Section title="5. Third-party information and availability">
        <p>Any third-party services, links, equipment details, or external information are provided for convenience. SolarIQ+ does not guarantee their accuracy, availability, or suitability. Features and outputs may change as the platform is updated.</p>
      </Section>
      <Section title="6. Verify before acting">
        <p>Use SolarIQ+ as a planning aid. Verify important technical, financial, electrical, structural, regulatory, and installation decisions with the relevant qualified professional and current local requirements.</p>
      </Section>
    </LegalPage>
  );
}
