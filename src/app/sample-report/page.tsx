import type { Metadata } from "next";
import { Container } from "@/components/Container";
import { CTAButton } from "@/components/CTAButton";
import { SectionKicker } from "@/components/SectionKicker";
import { Reveal } from "@/components/Reveal";
import { Disclosure } from "@/components/Disclosure";

export const metadata: Metadata = {
  title: "Sample Report",
  description:
    "Preview a sample VA Home Underwriting Report covering tax spike analysis, rent coverage, market trends, and risk factors for a VA loan purchase.",
};

const stats = [
  { label: "Monthly Cash Flow", value: "+$65", tone: "text-emerald-700" },
  { label: "Cash-on-Cash Return", value: "1.8%", tone: "text-navy-900" },
  { label: "Cap Rate", value: "5.8%", tone: "text-navy-900" },
  { label: "Total Monthly PITI", value: "$2,108", tone: "text-navy-900" },
];

// Titles, order, and copy below mirror the real report's actual sections
// (src/lib/pdf/UnderwritingReportDocument.tsx) as of the comps-radius-
// disclosure change (2026-09-03) — this page should be updated any time
// that document's section list or verdict language changes, so a buyer
// never sees a preview that undersells or misdescribes what they'll
// actually receive. "Purpose & Scope" and the conditional VA Condo
// Approval section are omitted here as boilerplate/not-always-present;
// everything else is the same order a real report ships in.
const sections = [
  {
    title: "Tax Spike Risk",
    teaser: "What your tax bill actually becomes after converting to a rental.",
    body: "Pulls the applicable county/state tax model — a flat rate, an assessment-ratio split, or a homestead-exemption gap, depending on the state — and shows the real owner-occupied-vs-rental difference, not just today's bill. Every figure carries its source.",
  },
  {
    title: "Rent Coverage vs. Adjusted Post-PCS Cost",
    teaser: "Real comps, not a Zillow guess — and the exact search radius used.",
    body: "Shows the actual comparable rental listings found near the property, with address, rent, and bed/bath — the same table shown here. If no comps are found, the report says so plainly and discloses the exact radius searched, rather than silently omitting the section.",
  },
  {
    title: "Local Market Trends",
    teaser: "A short read on rent and inventory trends in the surrounding submarket.",
    body: "Flags anything that would materially change the rent assumption above — rising or softening rents, inventory shifts, and any genuinely mixed signal between sources, called out explicitly rather than averaged away.",
  },
  {
    title: "Positive Factors",
    teaser: "What's actually working in this deal's favor, not just the risks.",
    body: "Balances the risk sections above with the deal's real strengths — property condition, entitlement position, and anything about the local tax or financing mechanics that works in the buyer's favor.",
  },
  {
    title: "Summary Risk Rating & Overall Recommendation",
    teaser: "One clear verdict, up front — Proceed, Do Not Proceed, or Marginal.",
    body: "The report opens with this call, not buries it: an overall PROCEED / DO NOT PROCEED AS MODELED / MARGINAL recommendation and a LOW–HIGH market risk rating, backed by every number above it.",
  },
];

export default function SampleReportPage() {
  return (
    <>
      <section className="bg-navy-900 py-20 text-white">
        <Container>
          <SectionKicker light>Sample Report</SectionKicker>
          <h1 className="mt-4 max-w-2xl text-balance font-display text-4xl font-bold tracking-tight sm:text-5xl">
            See what lands in your inbox.
          </h1>
          <p className="mt-5 max-w-xl text-white/70">
            A real, sample-data render from the same report generator every
            customer gets — not a mockup.
          </p>
        </Container>
      </section>

      <section className="bg-navy-50 py-20">
        <Container>
          <Reveal>
            <div className="mx-auto max-w-3xl rounded-sm border border-navy-900/10 bg-white shadow-xl shadow-navy-950/10">
              {/* Document header */}
              <div className="flex flex-col gap-4 border-b border-navy-900/10 p-8 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[10px] font-semibold tracking-[0.2em] text-navy-900/40 uppercase">
                    VA Home Underwriting Report &middot; Sample / Redacted
                  </p>
                  <h2 className="mt-2 font-display text-xl font-bold text-navy-900">
                    123 Sample Ct, Fayetteville, NC
                  </h2>
                </div>
                <a
                  href="/sample-underwriting-report.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 rounded-sm bg-navy-900 px-4 py-2 text-center text-xs font-semibold tracking-wide text-white uppercase hover:bg-navy-900/90"
                >
                  Download Full Sample PDF
                </a>
              </div>

              {/* Overall recommendation banner — matches the real report's verdict banner */}
              <div className="mx-8 mt-8 rounded-sm bg-emerald-700 p-4 text-center text-white">
                <p className="text-[10px] font-semibold tracking-[0.2em] text-white/80 uppercase">
                  Overall Recommendation
                </p>
                <p className="mt-1 font-display text-base font-bold">
                  PROCEED — this property cash-flows as modeled.
                </p>
              </div>

              {/* Headline stat row — matches the real report's stat cards */}
              <div className="mx-8 mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {stats.map((s) => (
                  <div key={s.label} className="rounded-sm bg-navy-50 p-3">
                    <p className="text-[9px] font-semibold tracking-[0.12em] text-navy-900/50 uppercase">
                      {s.label}
                    </p>
                    <p className={`mt-1 font-display text-lg font-bold ${s.tone}`}>{s.value}</p>
                  </div>
                ))}
              </div>

              {/* Sections */}
              <div className="mt-8 divide-y divide-navy-900/10">
                {sections.map((s, i) => (
                  <div key={s.title} className="p-8">
                    <p className="text-[10px] font-semibold tracking-[0.2em] text-red-600 uppercase">
                      Section {i + 1}
                    </p>
                    <div className="mt-2">
                      <Disclosure title={s.title} teaser={s.teaser}>
                        {s.body}
                      </Disclosure>
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="border-t border-navy-900/10 p-8">
                <a
                  href="/sample-underwriting-report.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold text-navy-900 underline decoration-red-600 underline-offset-4 hover:text-red-600"
                >
                  See the full 3-page sample PDF &rarr;
                </a>
              </div>
            </div>
          </Reveal>

          <p className="mx-auto mt-6 max-w-3xl text-center text-xs text-navy-900/40">
            The address, name, and dollar figures above are placeholders —
            not a real property or client — but every number was produced by
            the same report generator and PDF layout your report ships in.
          </p>
        </Container>
      </section>

      <section className="relative overflow-hidden bg-navy-900 py-20 text-white">
        <div className="blueprint-grid pointer-events-none absolute inset-0" />
        <Container className="relative text-center">
          <h2 className="mx-auto max-w-xl text-balance font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Ready to get your own VA Home Underwriting Report?
          </h2>
          <div className="mt-8 flex justify-center">
            <CTAButton href="/get-started">Get Your Underwriting Report</CTAButton>
          </div>
        </Container>
      </section>
    </>
  );
}
