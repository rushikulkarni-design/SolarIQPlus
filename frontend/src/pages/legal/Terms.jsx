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

export default function Terms() {
  return (
    <LegalPage title="Terms & Conditions" updated="27 October 2026">
      <p>These Terms &amp; Conditions describe the basic rules for accessing and using SolarIQ+ (“the platform”). By using the platform, you agree to use it lawfully and responsibly. If you do not agree, do not use the platform.</p>
      <Section title="1. What SolarIQ+ provides">
        <p>SolarIQ+ provides tools intended to support preliminary solar planning, electricity-bill text extraction (OCR), comparison of solar options, indicative generation and savings estimates, maintenance information, and service-request submissions. Available features may change as the platform is developed.</p>
      </Section>
      <Section title="2. Accounts and security">
        <p>You are responsible for providing accurate information, keeping your sign-in credentials secure, and activity performed through your account. Notify the platform administrator if you believe your account has been accessed without permission. Do not attempt to access another user’s account or restricted administration features.</p>
      </Section>
      <Section title="3. Accurate information">
        <p>Review information you enter and values extracted from uploaded bills. OCR can misread documents. Incorrect, incomplete, or outdated inputs may affect the results and recommendations shown by the platform.</p>
      </Section>
      <Section title="4. Estimates and professional assessment">
        <p>Solar capacity, generation, savings, costs, and payback figures are indicative estimates, not guarantees or binding offers. Before purchasing or installing equipment, obtain a site assessment and a written quotation from a qualified solar professional.</p>
      </Section>
      <Section title="5. Service requests and quotations">
        <p>Submitting a service request is an enquiry only and does not by itself confirm an appointment, price, or service contract. Any quotation, scope, timing, taxes, availability, and booking must be confirmed with the service provider. Do not treat a request status as a confirmed booking unless the platform or provider explicitly confirms it.</p>
      </Section>
      <Section title="6. Safe and acceptable use">
        <p>Do not misuse the platform, upload content you are not permitted to share, interfere with its operation, attempt unauthorized access, or use its guidance to perform unsafe electrical work. Stop and contact a qualified technician if equipment appears damaged or unsafe.</p>
      </Section>
      <Section title="7. Intellectual property and availability">
        <p>Unless otherwise stated, the platform’s branding, interface, and original materials are owned by or used with permission by the platform operator. The platform is provided on an “as available” basis; uninterrupted operation, error-free results, and permanent availability of any feature are not guaranteed.</p>
      </Section>
      <Section title="8. Limitation and changes">
        <p>To the extent permitted by applicable law, the platform operator is not responsible for decisions made solely from estimates or automated guidance. Nothing in these terms excludes a right or liability that cannot legally be excluded. These terms may be updated as the platform changes; the updated date above indicates the latest revision.</p>
      </Section>
      <Section title="9. Contact">
        <p>For questions about these terms, contact the SolarIQ+ administrator using the official contact details provided by the platform operator.</p>
      </Section>
      <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950"><strong>Publication note:</strong> This is a general starter policy, not legal advice. Add the operator’s legal name and official contact details and have the terms reviewed for applicable laws before publishing.</p>
    </LegalPage>
  );
}
