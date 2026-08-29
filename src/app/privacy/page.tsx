import type { Metadata } from "next";
import { Container } from "@/components/Container";
import { SectionKicker } from "@/components/SectionKicker";
import { Reveal } from "@/components/Reveal";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${siteConfig.name} collects, uses, and protects your information.`,
};

const lastUpdated = "August 29, 2026";

export default function PrivacyPage() {
  return (
    <>
      <section className="bg-navy-900 py-20 text-white">
        <Container>
          <SectionKicker light>Privacy Policy</SectionKicker>
          <h1 className="mt-4 max-w-2xl text-balance font-display text-4xl font-bold tracking-tight sm:text-5xl">
            What we collect, and what we do with it.
          </h1>
          <p className="mt-4 text-sm text-white/50">Last updated: {lastUpdated}</p>
        </Container>
      </section>

      <section className="bg-white py-20">
        <Container>
          <Reveal className="mx-auto max-w-3xl">
            <div className="prose-none space-y-8 text-sm leading-relaxed text-navy-900/70 sm:text-base">
              <p>
                {siteConfig.name} (&quot;Garrison,&quot; &quot;we,&quot;
                &quot;us&quot;) provides a flat-fee, independent underwriting
                risk review for VA home loan buyers. This policy explains what
                information we collect when you use our website and purchase a
                report, why we collect it, and how it&apos;s handled. We&apos;ve
                tried to write it in plain English rather than legal boilerplate.
              </p>

              <div>
                <h2 className="font-display text-xl font-bold text-navy-900">
                  Information you give us
                </h2>
                <p className="mt-3">
                  When you fill out our intake form after purchasing a report, we
                  collect the details needed to run your underwriting analysis:
                  your name, email, phone number, current duty station, PCS
                  timeline, VA disability rating status, prior VA loan history,
                  the property address and characteristics, financing terms,
                  local tax details, and expense and rent estimates you provide.
                </p>
                <p className="mt-3">
                  If you contact us by email or through the contact form, we
                  keep that correspondence so we can respond and maintain a
                  record of the conversation.
                </p>
              </div>

              <div>
                <h2 className="font-display text-xl font-bold text-navy-900">
                  Payment information
                </h2>
                <p className="mt-3">
                  All payments are processed by Stripe. We never see or store
                  your full card number, expiration date, or CVC — that
                  information goes directly to Stripe, which is PCI-compliant
                  and handles it under its own privacy policy. We receive
                  confirmation that a payment succeeded, the amount, and the
                  email address you provided at checkout.
                </p>
              </div>

              <div>
                <h2 className="font-display text-xl font-bold text-navy-900">
                  How we use your information
                </h2>
                <ul className="mt-3 list-inside list-disc space-y-2">
                  <li>To generate your VA Home Underwriting Report (PDF) and supporting workbook.</li>
                  <li>To research publicly available property, tax, and rental market data relevant to the address you submit.</li>
                  <li>To email you your report, respond to questions, and send necessary transactional updates about your order.</li>
                  <li>To detect and prevent fraud or misuse of the service.</li>
                </ul>
                <p className="mt-3">
                  We do not sell your personal information, and we do not use
                  it for advertising or marketing to third parties.
                </p>
              </div>

              <div>
                <h2 className="font-display text-xl font-bold text-navy-900">
                  Third-party services we rely on
                </h2>
                <p className="mt-3">
                  We use a small number of third-party services to operate the
                  business, each of which processes a limited slice of your
                  information solely to perform its function for us:
                </p>
                <ul className="mt-3 list-inside list-disc space-y-2">
                  <li><span className="font-semibold text-navy-900">Stripe</span> — payment processing.</li>
                  <li><span className="font-semibold text-navy-900">Resend</span> — delivering your report and account emails.</li>
                  <li><span className="font-semibold text-navy-900">Vercel</span> — hosting the website and application.</li>
                  <li>
                    <span className="font-semibold text-navy-900">Anthropic (Claude)</span> — researching publicly
                    available property, tax, and market information used to
                    complete your report. We do not send your name, email, or
                    payment details to this service — only the property-level
                    details needed to complete the research.
                  </li>
                </ul>
              </div>

              <div>
                <h2 className="font-display text-xl font-bold text-navy-900">
                  How long we keep your information
                </h2>
                <p className="mt-3">
                  We retain intake form submissions and generated reports for
                  as long as needed to deliver the service, respond to
                  follow-up questions about your report, and comply with our
                  own tax and accounting recordkeeping obligations. If you
                  want your information deleted sooner, email us at{" "}
                  <a
                    href={`mailto:${siteConfig.email}`}
                    className="font-semibold text-navy-900 underline decoration-red-600 underline-offset-4"
                  >
                    {siteConfig.email}
                  </a>{" "}
                  and we will honor reasonable deletion requests, except where
                  we&apos;re required to retain records (for example, payment
                  records for tax purposes).
                </p>
              </div>

              <div>
                <h2 className="font-display text-xl font-bold text-navy-900">
                  Your rights
                </h2>
                <p className="mt-3">
                  Depending on where you live, you may have the right to
                  request access to, correction of, or deletion of your
                  personal information, or to object to certain uses of it.
                  To exercise any of these rights, email{" "}
                  <a
                    href={`mailto:${siteConfig.email}`}
                    className="font-semibold text-navy-900 underline decoration-red-600 underline-offset-4"
                  >
                    {siteConfig.email}
                  </a>{" "}
                  and we&apos;ll respond promptly.
                </p>
              </div>

              <div>
                <h2 className="font-display text-xl font-bold text-navy-900">
                  Cookies and analytics
                </h2>
                <p className="mt-3">
                  Our website may use basic, privacy-respecting analytics to
                  understand traffic and improve the site. We do not use
                  cross-site advertising trackers, and we do not sell browsing
                  data.
                </p>
              </div>

              <div>
                <h2 className="font-display text-xl font-bold text-navy-900">
                  Security
                </h2>
                <p className="mt-3">
                  We use industry-standard safeguards (encrypted connections,
                  access controls, and reputable third-party infrastructure)
                  to protect your information. No method of transmission or
                  storage is 100% secure, but we take reasonable steps to
                  protect what you share with us.
                </p>
              </div>

              <div>
                <h2 className="font-display text-xl font-bold text-navy-900">
                  Changes to this policy
                </h2>
                <p className="mt-3">
                  If we make material changes to this policy, we&apos;ll update
                  the date at the top of this page. Continued use of the site
                  after changes means you accept the updated policy.
                </p>
              </div>

              <div>
                <h2 className="font-display text-xl font-bold text-navy-900">
                  Contact us
                </h2>
                <p className="mt-3">
                  Questions about this policy or your information? Email{" "}
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
