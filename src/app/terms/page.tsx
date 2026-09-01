import type { Metadata } from "next";
import { Container } from "@/components/Container";
import { SectionKicker } from "@/components/SectionKicker";
import { Reveal } from "@/components/Reveal";
import { siteConfig, pricingTiers } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: `The terms that govern your purchase and use of ${siteConfig.name}.`,
};

const lastUpdated = "August 29, 2026";

export default function TermsPage() {
  return (
    <>
      <section className="bg-navy-900 py-20 text-white">
        <Container>
          <SectionKicker light>Terms of Service</SectionKicker>
          <h1 className="mt-4 max-w-2xl text-balance font-display text-4xl font-bold tracking-tight sm:text-5xl">
            The plain-English terms of using Garrison.
          </h1>
          <p className="mt-4 text-sm text-white/50">Last updated: {lastUpdated}</p>
        </Container>
      </section>

      <section className="bg-white py-20">
        <Container>
          <Reveal className="mx-auto max-w-3xl">
            <div className="prose-none space-y-8 text-sm leading-relaxed text-navy-900/70 sm:text-base">
              <p>
                These terms govern your purchase and use of {siteConfig.name}
                (&quot;Garrison,&quot; &quot;we,&quot; &quot;us&quot;), a
                flat-fee underwriting risk review service for VA home loan
                buyers. By purchasing a report or using this website, you agree
                to these terms.
              </p>

              <div>
                <h2 className="font-display text-xl font-bold text-navy-900">
                  1. What we sell
                </h2>
                <p className="mt-3">
                  We sell a one-time, flat-fee independent risk review of a
                  property you&apos;re buying or already own with a VA loan.
                  You provide property, financing, and personal details through
                  our intake form; we research the applicable tax rules,
                  comparable rents, and local market data, and deliver a VA
                  Home Underwriting Report as a PDF, along with a supporting
                  Excel workbook, by email — typically within 30 minutes of a
                  complete submission. A small number of submissions need a
                  manual check on a specific number before we&apos;re
                  comfortable sending the report; when that happens, we email
                  you directly and deliver within one business day instead.
                </p>
                <p className="mt-3">
                  Current pricing:{" "}
                  {pricingTiers
                    .map((t) => `${t.name} (${t.priceLabel}, ${t.properties})`)
                    .join(" and ")}
                  . There are no subscriptions or recurring charges — each
                  purchase unlocks a fixed number of property submissions
                  under that plan.
                </p>
              </div>

              <div>
                <h2 className="font-display text-xl font-bold text-navy-900">
                  2. Not financial, legal, tax, or appraisal advice
                </h2>
                <p className="mt-3">
                  {siteConfig.shortName} is not affiliated with, endorsed by,
                  or acting on behalf of the Department of Veterans Affairs or
                  any government agency. Our reports are independent,
                  informational risk analysis only. They are{" "}
                  <span className="font-semibold text-navy-900">not</span> a
                  loan approval, an appraisal, a tax determination, or legal
                  advice, and should not be treated as a substitute for advice
                  from a licensed lender, tax professional, appraiser, or
                  attorney. You are responsible for independently verifying
                  any figure in your report — especially local tax rates and
                  loan terms — before making a purchase decision.
                </p>
              </div>

              <div>
                <h2 className="font-display text-xl font-bold text-navy-900">
                  3. Accuracy of information you provide
                </h2>
                <p className="mt-3">
                  Your report is only as accurate as the information you give
                  us and the publicly available data we&apos;re able to
                  research at the time of your order. Where you don&apos;t
                  provide a real figure (for example, an exact insurance quote
                  or local tax rate), we use a reasonable researched or
                  regional estimate and label it as such in your report. We
                  are not responsible for inaccuracies caused by incomplete or
                  incorrect information you submit, or by changes in tax
                  rates, insurance costs, or market conditions after your
                  report is delivered.
                </p>
              </div>

              <div>
                <h2 className="font-display text-xl font-bold text-navy-900">
                  4. Payment and refunds
                </h2>
                <p className="mt-3">
                  Payment is collected in full, in advance, through Stripe.
                  Because each report involves real research and labor
                  performed specifically for your submitted property, all
                  sales are final once you submit your intake form — we do not
                  offer refunds for change of mind after that point.
                </p>
                <p className="mt-3">We will issue a full refund if:</p>
                <ul className="mt-3 list-inside list-disc space-y-2">
                  <li>You were charged but never received access to the intake form, or</li>
                  <li>We are unable to deliver your report within a reasonable time (2 business days) of a complete submission, or</li>
                  <li>You were charged in error or more than once for the same order.</li>
                </ul>
                <p className="mt-3">
                  To request a refund under any of the above, email{" "}
                  <a
                    href={`mailto:${siteConfig.email}`}
                    className="font-semibold text-navy-900 underline decoration-red-600 underline-offset-4"
                  >
                    {siteConfig.email}
                  </a>{" "}
                  with your reference number.
                </p>
              </div>

              <div>
                <h2 className="font-display text-xl font-bold text-navy-900">
                  5. Acceptable use
                </h2>
                <p className="mt-3">
                  You agree to provide accurate information, to use the
                  service for your own property evaluations (not to resell or
                  redistribute reports commercially), and not to attempt to
                  disrupt, reverse-engineer, or misuse the website or our
                  underlying systems.
                </p>
              </div>

              <div>
                <h2 className="font-display text-xl font-bold text-navy-900">
                  6. Limitation of liability
                </h2>
                <p className="mt-3">
                  To the maximum extent permitted by law, {siteConfig.shortName}
                  &apos;s total liability for any claim arising from your
                  purchase or use of this service is limited to the amount you
                  paid for the report at issue. We are not liable for indirect,
                  incidental, or consequential damages, including decisions
                  made about a property purchase based on your report.
                </p>
              </div>

              <div>
                <h2 className="font-display text-xl font-bold text-navy-900">
                  7. Changes to these terms
                </h2>
                <p className="mt-3">
                  We may update these terms from time to time. If we make
                  material changes, we&apos;ll update the date at the top of
                  this page. Continued use of the site after changes means you
                  accept the updated terms.
                </p>
              </div>

              <div>
                <h2 className="font-display text-xl font-bold text-navy-900">
                  8. Contact us
                </h2>
                <p className="mt-3">
                  Questions about these terms? Email{" "}
                  <a
                    href={`mailto:${siteConfig.email}`}
                    className="font-semibold text-navy-900 underline decoration-red-600 underline-offset-4"
                  >
                    {siteConfig.email}
                  </a>
                  .
                </p>
              </div>
            </div>
          </Reveal>
        </Container>
      </section>
    </>
  );
}
