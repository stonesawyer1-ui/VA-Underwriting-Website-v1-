import type { Metadata } from "next";
import { SectionKicker } from "@/components/SectionKicker";
import { CTAButton } from "@/components/CTAButton";
import { Container } from "@/components/Container";
import { UnderwritingForm } from "@/components/underwriting/UnderwritingForm";
import { getStripeClient } from "@/lib/stripe";
import { createEntitlementToken } from "@/lib/entitlementToken";
import { getPricingTier } from "@/lib/site";

export const metadata: Metadata = {
  title: "Get Started",
  description:
    "Submit your property, loan, and rent details to start your VA Home Underwriting Report — with a live first-pass cash-flow estimate as you go.",
};

function GateMessage({ title, body }: { title: string; body: string }) {
  return (
    <section className="bg-navy-50 py-24">
      <Container>
        <div className="mx-auto max-w-lg text-center">
          <SectionKicker>Get Started</SectionKicker>
          <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-navy-900 sm:text-4xl">
            {title}
          </h1>
          <p className="mt-5 text-navy-900/60">{body}</p>
          <div className="mt-8 flex justify-center">
            <CTAButton href="/pricing">Choose a Plan</CTAButton>
          </div>
        </div>
      </Container>
    </section>
  );
}

export default async function GetStartedPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const params = await searchParams;
  const sessionId = params.session_id;

  if (!sessionId) {
    return (
      <GateMessage
        title="Choose a plan to get started."
        body="The intake form unlocks after you pay for a Recon or Sentry review — that keeps this to one flat fee, no accounts, no subscriptions."
      />
    );
  }

  const stripe = getStripeClient();

  // Dev-only shortcut so the intake form is testable before a real Stripe key
  // is configured. Never active once STRIPE_SECRET_KEY is set, and never in
  // production regardless of the key.
  if (!stripe) {
    if (process.env.NODE_ENV !== "production" && sessionId === "demo") {
      const demoTier = getPricingTier("sentry");
      const token = createEntitlementToken("demo", "sentry", null);
      if (token && demoTier) {
        return <GetStartedForm token={token} tierId="sentry" allowance={demoTier.propertyAllowance} used={0} />;
      }
    }
    return (
      <GateMessage
        title="Payments aren't set up yet."
        body="This site's checkout isn't configured. If you're testing locally, add STRIPE_SECRET_KEY, or visit /get-started?session_id=demo in development."
      />
    );
  }

  let checkoutSession;
  try {
    checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);
  } catch {
    return (
      <GateMessage
        title="We couldn't find that order."
        body="That checkout link looks invalid or expired. Choose a plan again to continue."
      />
    );
  }

  if (checkoutSession.payment_status !== "paid") {
    return (
      <GateMessage
        title="Payment not completed."
        body="It looks like checkout didn't finish. Choose a plan again to try once more."
      />
    );
  }

  const tierId = checkoutSession.metadata?.tierId ?? "";
  const tier = getPricingTier(tierId);
  const token = createEntitlementToken(sessionId, tierId, checkoutSession.customer_details?.email ?? null);
  if (!token || !tier) {
    return (
      <GateMessage
        title="We couldn't match that order to a plan."
        body="Reach out to us with your order confirmation and we'll sort it out."
      />
    );
  }

  return <GetStartedForm token={token} tierId={tier.id} allowance={tier.propertyAllowance} used={0} />;
}

function GetStartedForm({
  token,
  tierId,
  allowance,
  used,
}: {
  token: string;
  tierId: "recon" | "sentry";
  allowance: number;
  used: number;
}) {
  return (
    <section className="bg-navy-50 py-20">
      <div className="mx-auto w-full max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <SectionKicker>Get Started</SectionKicker>
          <h1 className="mt-4 font-display text-4xl font-bold tracking-tight text-navy-900 sm:text-5xl">
            Let&apos;s underwrite your deal.
          </h1>
          <p className="mt-5 text-navy-900/60">
            Fill in what you know — the results panel updates as you go. Only
            your email, price, address/state, rate, and move-in date are
            required.
          </p>
        </div>

        <div className="mt-12">
          <UnderwritingForm initialTier={tierId} entitlementToken={token} allowance={allowance} used={used} />
        </div>
      </div>
    </section>
  );
}
