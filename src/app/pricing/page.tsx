import type { Metadata } from "next";
import { Container } from "@/components/Container";
import { CheckoutButton } from "@/components/CheckoutButton";
import { SectionKicker } from "@/components/SectionKicker";
import { Reveal } from "@/components/Reveal";
import { pricingTiers, comparisonRows } from "@/lib/site";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Flat-fee VA loan risk review pricing. Recon and Sentry tiers — no subscriptions, no percentage of loan amount.",
};

export default function PricingPage() {
  return (
    <>
      <section className="bg-navy-900 py-20 text-white">
        <Container>
          <SectionKicker light>Pricing</SectionKicker>
          <h1 className="mt-4 max-w-2xl text-balance font-display text-4xl font-bold tracking-tight sm:text-5xl">
            Flat fee. Delivered as a PDF. No surprises.
          </h1>
          <p className="mt-5 max-w-xl text-white/70">
            Every tier includes the core VA Home Underwriting Report. Sentry adds market
            depth and covers more properties. Pay once, then submit your
            properties — no account required.
          </p>
        </Container>
      </section>

      <section id="tiers" className="bg-navy-50 py-20">
        <Container>
          <div className="mx-auto grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-2">
            {pricingTiers.map((tier, i) => (
              <Reveal key={tier.id} delay={i * 0.1}>
                <div
                  className={`flex h-full flex-col rounded-sm border p-8 ${
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
                  <h2
                    className={`font-display text-xl font-bold ${tier.highlighted ? "text-white" : "text-navy-900"}`}
                  >
                    {tier.name}
                  </h2>
                  <p
                    className={`mt-2 text-4xl font-bold ${tier.highlighted ? "text-white" : "text-navy-900"}`}
                  >
                    {tier.priceLabel}
                  </p>
                  <p
                    className={`mt-1 text-xs tracking-wide uppercase ${tier.highlighted ? "text-white/50" : "text-navy-900/40"}`}
                  >
                    {tier.properties}
                  </p>
                  <p
                    className={`mt-4 text-sm leading-relaxed ${tier.highlighted ? "text-white/70" : "text-navy-900/60"}`}
                  >
                    {tier.bestFor}
                  </p>

                  <ul className="mt-6 flex-1 space-y-3">
                    {tier.features.map((f) => (
                      <li
                        key={f}
                        className={`flex items-start gap-2.5 text-sm ${tier.highlighted ? "text-white/80" : "text-navy-900/70"}`}
                      >
                        <svg
                          className={`mt-0.5 h-4 w-4 shrink-0 ${tier.highlighted ? "text-red-400" : "text-red-600"}`}
                          viewBox="0 0 16 16"
                          fill="none"
                          aria-hidden="true"
                        >
                          <path
                            d="M3 8.5L6.2 11.5L13 4.5"
                            stroke="currentColor"
                            strokeWidth="1.75"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        {f}
                      </li>
                    ))}
                  </ul>

                  <CheckoutButton
                    tierId={tier.id}
                    variant={tier.highlighted ? "primary" : "secondary"}
                    className="mt-8"
                  >
                    Choose {tier.name}
                  </CheckoutButton>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      <section className="bg-white py-20">
        <Container>
          <Reveal>
            <SectionKicker>Compare Tiers</SectionKicker>
            <h2 className="mt-4 font-display text-2xl font-bold tracking-tight text-navy-900 sm:text-3xl">
              Full feature comparison
            </h2>
          </Reveal>

          <Reveal delay={0.1} className="mt-10 overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-navy-900/10">
                  <th className="py-4 pr-4 font-semibold text-navy-900/50">
                    Feature
                  </th>
                  {pricingTiers.map((tier) => (
                    <th
                      key={tier.id}
                      className="px-4 py-4 font-display font-bold text-navy-900"
                    >
                      {tier.name}
                      <span className="block text-xs font-normal text-navy-900/40">
                        {tier.priceLabel}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row) => (
                  <tr key={row.label} className="border-b border-navy-900/5">
                    <td className="py-4 pr-4 text-navy-900/70">{row.label}</td>
                    <td className="px-4 py-4 text-navy-900/80">{row.recon}</td>
                    <td className="px-4 py-4 text-navy-900/80">{row.sentry}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Reveal>
        </Container>
      </section>

      <section className="relative overflow-hidden bg-navy-900 py-20 text-white">
        <div className="blueprint-grid pointer-events-none absolute inset-0" />
        <Container className="relative text-center">
          <h2 className="mx-auto max-w-xl text-balance font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Pick a tier and pay securely — then submit your properties.
          </h2>
          <div className="mt-8 flex justify-center">
            <a
              href="#tiers"
              className="inline-flex items-center justify-center rounded-sm bg-red-600 px-6 py-3.5 text-sm font-semibold tracking-wide text-white uppercase transition-colors hover:bg-red-700"
            >
              Choose a Plan
            </a>
          </div>
        </Container>
      </section>
    </>
  );
}
