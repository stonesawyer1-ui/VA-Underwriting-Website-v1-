import type { Metadata } from "next";
import { Container } from "@/components/Container";
import { CTAButton } from "@/components/CTAButton";
import { SectionKicker } from "@/components/SectionKicker";
import { Reveal } from "@/components/Reveal";

export const metadata: Metadata = {
  title: "Sample Memo",
  description:
    "Preview a sample Risk Memorandum covering tax spike analysis, rent coverage, market trends, and risk factors for a VA loan purchase.",
};

const sections = [
  {
    label: "Section 1",
    title: "Post-PCS Tax Spike Analysis",
    body: "Projects your property tax liability after conversion from owner-occupied to non-owner-occupied status, based on the taxing jurisdiction's reassessment triggers and historical millage rates.",
    stat: { label: "Projected Monthly Increase", value: "+$412" },
  },
  {
    label: "Section 2",
    title: "Rent Coverage Assessment",
    body: "Compares realistic achievable rent — pulled from active and recently leased comparables, not list-price estimates — against your full post-PCS carrying cost, including the reassessed tax line.",
    stat: { label: "Rent-to-PITI Coverage", value: "94%" },
  },
  {
    label: "Section 3",
    title: "Local Market Trend Snapshot",
    body: "A short read on rent and inventory trends in the surrounding submarket over the trailing 12 months, flagged for anything that would materially change your rent assumption.",
    stat: { label: "12-Month Rent Trend", value: "+2.1%" },
  },
  {
    label: "Section 4",
    title: "Cash Flow Risk Factors",
    body: "Named risk factors specific to your deal — vacancy exposure, HOA/condo assessment risk, insurance line volatility, and financing terms — each rated and explained in plain language.",
    stat: { label: "Flagged Risk Factors", value: "3" },
  },
];

export default function SampleMemoPage() {
  return (
    <>
      <section className="bg-navy-900 py-20 text-white">
        <Container>
          <SectionKicker light>Sample Memo</SectionKicker>
          <h1 className="mt-4 max-w-2xl text-balance font-display text-4xl font-bold tracking-tight sm:text-5xl">
            See what lands in your inbox.
          </h1>
          <p className="mt-5 max-w-xl text-white/70">
            Below is a styled excerpt of the Risk Memorandum deliverable
            using placeholder, redacted figures — not a real client file.
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
                    Risk Memorandum &middot; Sample / Redacted
                  </p>
                  <h2 className="mt-2 font-display text-xl font-bold text-navy-900">
                    Subject Property Review
                  </h2>
                </div>
                <div className="h-6 w-40 rounded-sm bg-navy-900/10" aria-hidden="true" />
              </div>

              {/* Sections */}
              <div className="divide-y divide-navy-900/10">
                {sections.map((s) => (
                  <div key={s.label} className="grid grid-cols-1 gap-6 p-8 sm:grid-cols-3">
                    <div className="sm:col-span-2">
                      <p className="text-[10px] font-semibold tracking-[0.2em] text-red-600 uppercase">
                        {s.label}
                      </p>
                      <h3 className="mt-2 font-display text-lg font-bold text-navy-900">
                        {s.title}
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-navy-900/60">
                        {s.body}
                      </p>
                    </div>
                    <div className="flex flex-col justify-center rounded-sm bg-navy-50 p-5">
                      <p className="text-[10px] font-semibold tracking-[0.15em] text-navy-900/50 uppercase">
                        {s.stat.label}
                      </p>
                      <p className="mt-1 font-display text-2xl font-bold text-navy-900">
                        {s.stat.value}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="border-t border-navy-900/10 p-8">
                <p className="text-[10px] font-semibold tracking-[0.15em] text-navy-900/50 uppercase">
                  Go / No-Go Signal
                </p>
                <p className="mt-2 font-display text-xl font-bold text-navy-900">
                  Proceed with rate-lock contingency
                </p>
                <p className="mt-2 text-sm leading-relaxed text-navy-900/60">
                  Full memo includes underwriter notes, comparable rent data,
                  and a plain-language summary you can act on immediately.
                </p>
              </div>
            </div>
          </Reveal>

          <p className="mx-auto mt-6 max-w-3xl text-center text-xs text-navy-900/40">
            All figures shown are illustrative placeholders for formatting
            purposes only and do not reflect any real property or client.
          </p>
        </Container>
      </section>

      <section className="relative overflow-hidden bg-navy-900 py-20 text-white">
        <div className="blueprint-grid pointer-events-none absolute inset-0" />
        <Container className="relative text-center">
          <h2 className="mx-auto max-w-xl text-balance font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Ready to get your own Risk Memorandum?
          </h2>
          <div className="mt-8 flex justify-center">
            <CTAButton href="/get-started">Get Your Risk Memo</CTAButton>
          </div>
        </Container>
      </section>
    </>
  );
}
