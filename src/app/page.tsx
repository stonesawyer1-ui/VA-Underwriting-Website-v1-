import { Container } from "@/components/Container";
import { CTAButton } from "@/components/CTAButton";
import { SectionKicker } from "@/components/SectionKicker";
import { Reveal } from "@/components/Reveal";
import { MemoCardPreview } from "@/components/MemoCardPreview";
import { pricingTiers } from "@/lib/site";
import Link from "next/link";

const problems = [
  {
    title: "PCS orders reset your tax bill",
    body: "Convert an owner-occupied VA purchase to a rental after PCS and most counties reassess. The escrow line you budgeted for is rarely the one you actually pay.",
  },
  {
    title: "Rent coverage is a guess, not a number",
    body: "Zillow rent estimates don't account for your actual post-PCS PITI, vacancy, or the tax spike above. Buyers find out the math doesn't work after the ink is dry.",
  },
  {
    title: "You're underwriting blind",
    body: "Lenders qualify the loan. Nobody is independently checking whether the property still cash flows once you're stationed 1,200 miles away.",
  },
];

const steps = [
  {
    step: "01",
    title: "Submit property + loan info",
    body: "Tell us the address, your VA loan terms, and your PCS timeline through a short intake form. Takes about five minutes.",
  },
  {
    step: "02",
    title: "We underwrite independently",
    body: "We pull local tax reassessment rules, comparable rents, and market data — then model your post-PCS numbers, not the pre-approval numbers.",
  },
  {
    step: "03",
    title: "Receive your Underwriting Report PDF",
    body: "A clear, professional VA Home Underwriting Report covering tax spike exposure, rent coverage, market trends, and the risk factors that matter for your specific deal.",
  },
  {
    step: "04",
    title: "Decide with confidence",
    body: "Go, no-go, or renegotiate — armed with an independent number instead of a lender's best-case projection.",
  },
];

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-navy-900 text-white">
        <div className="blueprint-grid pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute -top-24 -right-24 h-96 w-96 rounded-full bg-red-600/10 blur-3xl" />
        <Container className="relative py-24 lg:py-32">
          <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-2">
            <div>
              <SectionKicker light>VA Loan Risk Review</SectionKicker>
              <h1 className="mt-5 text-balance font-display text-4xl leading-[1.05] font-bold tracking-tight sm:text-5xl lg:text-6xl">
                Don&apos;t find out your VA loan PCS&apos;d you into negative cash
                flow — <span className="text-red-500">after closing.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/70">
                A flat-fee, done-for-you risk review for VA loan buyers and
                2-4 unit house-hackers. We check the post-PCS tax spike, rent
                coverage, and cash flow math before you sign — not after.
              </p>
              <div className="mt-9 flex flex-col gap-4 sm:flex-row">
                <CTAButton href="/get-started">Get Your Underwriting Report</CTAButton>
                <CTAButton href="/sample-report" variant="ghost" className="border-white/25 text-white hover:border-white/50">
                  See a Sample Report
                </CTAButton>
              </div>
              <p className="mt-6 text-xs tracking-wide text-white/40 uppercase">
                Flat fee &middot; No subscriptions &middot; PDF delivered directly to you
              </p>
            </div>

            <Reveal delay={0.15} className="flex justify-center lg:justify-end">
              <div className="rotate-2">
                <MemoCardPreview />
              </div>
            </Reveal>
          </div>
        </Container>
      </section>

      {/* Problem / agitation */}
      <section className="bg-white py-24">
        <Container>
          <Reveal>
            <SectionKicker>The Problem</SectionKicker>
            <h2 className="mt-4 max-w-2xl text-balance font-display text-3xl font-bold tracking-tight text-navy-900 sm:text-4xl">
              The VA loan gets you approved. It doesn&apos;t tell you if the
              deal still works after you leave.
            </h2>
          </Reveal>

          <div className="mt-14 grid grid-cols-1 gap-8 md:grid-cols-3">
            {problems.map((p, i) => (
              <Reveal key={p.title} delay={i * 0.1}>
                <div className="h-full border-t-2 border-navy-900/10 pt-6">
                  <h3 className="font-display text-lg font-bold text-navy-900">
                    {p.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-navy-900/60">
                    {p.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* How it works */}
      <section className="bg-navy-50 py-24">
        <Container>
          <Reveal>
            <SectionKicker>How It Works</SectionKicker>
            <h2 className="mt-4 max-w-2xl text-balance font-display text-3xl font-bold tracking-tight text-navy-900 sm:text-4xl">
              Four steps between you and a clear go / no-go decision.
            </h2>
          </Reveal>

          <div className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-sm bg-navy-900/10 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <Reveal key={s.step} delay={i * 0.08} className="bg-navy-50 p-8">
                <span className="font-display text-3xl font-bold text-red-600/30">
                  {s.step}
                </span>
                <h3 className="mt-4 font-display text-base font-bold text-navy-900">
                  {s.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-navy-900/60">
                  {s.body}
                </p>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* Trust / credibility */}
      <section className="bg-white py-24">
        <Container>
          <Reveal>
            <SectionKicker>Why Trust This</SectionKicker>
            <h2 className="mt-4 max-w-2xl text-balance font-display text-3xl font-bold tracking-tight text-navy-900 sm:text-4xl">
              Built by a service member who ran these numbers on his own
              house-hack first.
            </h2>
            <p className="mt-5 max-w-2xl text-sm leading-relaxed text-navy-900/60">
              {"Garrison Risk Review is veteran-owned and built specifically around VA loan mechanics and post-PCS house-hacking — not a generic real estate calculator with a flag on it."}
            </p>
          </Reveal>
        </Container>
      </section>

      {/* Pricing preview */}
      <section className="bg-navy-50 py-24">
        <Container>
          <Reveal>
            <SectionKicker>Pricing</SectionKicker>
            <h2 className="mt-4 max-w-2xl text-balance font-display text-3xl font-bold tracking-tight text-navy-900 sm:text-4xl">
              One flat fee. No subscriptions, no percentage of loan amount.
            </h2>
          </Reveal>

          <div className="mx-auto mt-14 grid max-w-2xl grid-cols-1 gap-6 sm:grid-cols-2">
            {pricingTiers.map((tier, i) => (
              <Reveal key={tier.id} delay={i * 0.1}>
                <div
                  className={`flex h-full flex-col rounded-sm border p-7 ${
                    tier.highlighted
                      ? "border-navy-900 bg-navy-900 text-white"
                      : "border-navy-900/10 bg-white"
                  }`}
                >
                  {tier.highlighted && (
                    <span className="mb-4 inline-block w-fit rounded-sm bg-red-600 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-white uppercase">
                      Most Chosen
                    </span>
                  )}
                  <h3
                    className={`font-display text-lg font-bold ${tier.highlighted ? "text-white" : "text-navy-900"}`}
                  >
                    {tier.name}
                  </h3>
                  <p
                    className={`mt-1 text-3xl font-bold ${tier.highlighted ? "text-white" : "text-navy-900"}`}
                  >
                    {tier.priceLabel}
                  </p>
                  <p
                    className={`mt-1 text-xs tracking-wide uppercase ${tier.highlighted ? "text-white/50" : "text-navy-900/40"}`}
                  >
                    {tier.properties}
                  </p>
                  <p
                    className={`mt-3 text-sm leading-relaxed ${tier.highlighted ? "text-white/70" : "text-navy-900/60"}`}
                  >
                    {tier.bestFor}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>

          <div className="mt-10 text-center">
            <Link
              href="/pricing"
              className="text-sm font-semibold text-navy-900 underline decoration-red-600 underline-offset-4 hover:text-red-600"
            >
              Compare full tier details &rarr;
            </Link>
          </div>
        </Container>
      </section>

      {/* Final CTA band */}
      <section className="relative overflow-hidden bg-navy-900 py-20 text-white">
        <div className="blueprint-grid pointer-events-none absolute inset-0" />
        <Container className="relative text-center">
          <h2 className="mx-auto max-w-2xl text-balance font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Know the number before you write the offer.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-white/70">
            Submit your property details today and get an independent Risk
            Memorandum in as little as two business days.
          </p>
          <div className="mt-8 flex justify-center">
            <CTAButton href="/get-started">Get Your Underwriting Report</CTAButton>
          </div>
        </Container>
      </section>
    </>
  );
}
