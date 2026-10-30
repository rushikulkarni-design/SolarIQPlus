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

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy" updated="27 October 2026">
      <p>This Privacy Policy explains the categories of information that SolarIQ+ may handle when you use its features. The final policy should be checked against the platform’s actual data flows, service providers, retention settings, and security controls.</p>
      <Section title="1. Information you provide">
        <p>Depending on the feature you use, you may provide account details such as your name and email address, sign-in information handled by the authentication provider, electricity-bill files or extracted bill details, service contact numbers, service locations, descriptions of your requirements, preferred dates, and messages or support information.</p>
      </Section>
      <Section title="2. How information may be used">
        <p>Information may be used to authenticate users, provide solar-planning features, process bill information, show estimates, save service requests, communicate about quotations or appointments, provide support, protect the platform, and maintain or improve the service.</p>
      </Section>
      <Section title="3. Authentication and service providers">
        <p>SolarIQ+ may rely on third-party services for functions such as authentication, hosting, databases, or email delivery. Those providers may process relevant information to deliver their services under their own terms and privacy notices. The platform operator should identify the providers actually used before this policy is published.</p>
      </Section>
      <Section title="4. Sharing and disclosure">
        <p>Information may be shared with personnel who need it to handle your request and with service providers supporting the platform. It may also be disclosed when required by law or when reasonably necessary to protect the platform, users, or others. Do not upload sensitive information that is not needed for the feature you are using.</p>
      </Section>
      <Section title="5. Retention and security">
        <p>Information should be retained only for as long as needed for the stated purpose or applicable legal requirements and protected using appropriate safeguards. No online system can be guaranteed completely secure. The operator should insert its actual retention periods and security practices here; this page does not itself confirm that particular controls are implemented.</p>
      </Section>
      <Section title="6. Your choices and requests">
        <p>You may contact the platform operator to ask about personal information associated with your account or to request correction or deletion, subject to applicable law and records that must be retained. Some information may need to remain in backups, logs, or transaction records for a limited period. The operator should provide an official privacy contact before launch.</p>
      </Section>
      <Section title="7. Cookies, logs, and analytics">
        <p>The platform and its hosting or authentication services may use technical storage, cookies, or logs needed for sign-in, security, and operation. If analytics or advertising tools are added, this policy should be updated to identify them and explain relevant choices.</p>
      </Section>
      <Section title="8. Children and policy updates">
        <p>The platform is not intended to collect information from children without appropriate permission and safeguards. This policy may be updated as features, providers, or legal requirements change. The revision date is shown above.</p>
      </Section>
      <Section title="9. Contact">
        <p>For privacy questions or requests, contact the SolarIQ+ operator using the official privacy contact details supplied by the operator.</p>
      </Section>
      <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950"><strong>Before publishing:</strong> Replace general wording with the exact providers, data practices, retention periods, and contact details used by your deployed application. This starter page is not legal advice.</p>
    </LegalPage>
  );
}
