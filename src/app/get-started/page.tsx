import type { Metadata } from "next";
import { SectionKicker } from "@/components/SectionKicker";
import { CTAButton } from "@/components/CTAButton";
import { Container } from "@/components/Container";
import { UnderwritingForm } from "@/components/underwriting/UnderwritingForm";
import { getStripeClient } from "@/lib/stripe";
import { createEntitlementToken, signEntitlement } from "@/lib/entitlementToken";
import { getPricingTier, siteConfig } from "@/lib/site";
import { sendCheckoutConfirmationEmail } from "@/lib/email";
import { getFriendCodeUsedCount } from "@/lib/friendCodes";

/** How many free reports each FRIEND_TEST_CODES code grants — see the check below. */
const FRIEND_CODE_ALLOWANCE = 1;

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

  // Owner-only free testing shortcut: visiting /get-started?session_id=<this
  // code> unlocks the intake form without touching Stripe at all, so the
  // owner can run real end-to-end test submissions (real research, real
  // confidence gate, real emails) whenever they want without paying for a
  // plan each time. Only matches if OWNER_TEST_CODE is actually configured
  // (never accidentally matches an empty/unset value against a real Stripe
  // session_id, which never equals ""). stripeSessionId "demo" is the same
  // sentinel chargeAllowanceForJob already recognizes to skip the real
  // Stripe metadata update — the rest of the pipeline runs completely
  // normally. Allowance is set generously high (999) rather than tied to a
  // real plan's limit, since the point is unlimited repeat testing without
  // needing to revisit this URL for a fresh allowance.
  const ownerTestCode = process.env.OWNER_TEST_CODE;
  if (ownerTestCode && sessionId === ownerTestCode) {
    const token = signEntitlement({
      stripeSessionId: "demo",
      tierId: "sentry",
      allowance: 999,
      used: 0,
      customerEmail: null,
    });
    return <GetStartedForm token={token} tierId="sentry" allowance={999} used={0} />;
  }

  // Friend/referral free-trial codes: same real-pipeline bypass as the
  // owner's own code above, but each code is limited to FRIEND_CODE_ALLOWANCE
  // reports (tracked in Redis — see friendCodes.ts — since there's no Stripe
  // Checkout Session here to store a "used" count in the way a real paid
  // order does). stripeSessionId is tagged "friend:<code>" rather than the
  // bare "demo" sentinel so chargeAllowanceForJob (processSubmission.ts)
  // knows to increment this specific code's Redis counter instead of either
  // updating Stripe metadata or silently skipping usage tracking entirely.
  const friendCodes = (process.env.FRIEND_TEST_CODES ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  if (friendCodes.includes(sessionId)) {
    const used = await getFriendCodeUsedCount(sessionId);
    if (used >= FRIEND_CODE_ALLOWANCE) {
      return (
        <GateMessage
          title="This free trial link has already been used."
          body="Each referral link is good for one free property review. Choose a plan to run another."
        />
      );
    }
    const token = signEntitlement({
      stripeSessionId: `friend:${sessionId}`,
      tierId: "sentry",
      allowance: FRIEND_CODE_ALLOWANCE,
      used,
      customerEmail: null,
    });
    return <GetStartedForm token={token} tierId="sentry" allowance={FRIEND_CODE_ALLOWANCE} used={used} />;
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

  // The number of reports already submitted on this paid session lives in
  // the Stripe session's own metadata (updated by the intake API after each
  // submission) rather than in server memory, so it survives page reloads
  // and can't be reset just by revisiting this URL with the same session_id.
  const usedRaw = Number.parseInt(checkoutSession.metadata?.used ?? "0", 10);
  const used = Number.isFinite(usedRaw) && usedRaw > 0 ? usedRaw : 0;

  const token = createEntitlementToken(sessionId, tierId, checkoutSession.customer_details?.email ?? null, used);
  if (!token || !tier) {
    return (
      <GateMessage
        title="We couldn't match that order to a plan."
        body="Reach out to us with your order confirmation and we'll sort it out."
      />
    );
  }

  if (used >= tier.propertyAllowance) {
    return (
      <GateMessage
        title="You've used all your property reviews on this plan."
        body={`This order already used all ${tier.propertyAllowance} property review${tier.propertyAllowance === 1 ? "" : "s"} on the ${tier.name} plan. Choose a new plan to submit another property.`}
      />
    );
  }

  // Send the customer their personal return link exactly once per checkout
  // — this is the only durable copy of it that ever leaves the server (see
  // sendCheckoutConfirmationEmail's comment). Without it, closing this tab
  // before finishing every property on a multi-property plan left a
  // customer with no way back at all (caught 2026-09-02). Guarded by the
  // session's own metadata, the same webhook-free durable pattern already
  // used for the `used` counter, so an ordinary page refresh mid-form-fill
  // never re-sends it.
  if (!checkoutSession.metadata?.confirmationEmailSent) {
    const customerEmail = checkoutSession.customer_details?.email;
    if (customerEmail) {
      try {
        await sendCheckoutConfirmationEmail({
          customerEmail,
          customerName: checkoutSession.customer_details?.name ?? null,
          tierName: tier.name,
          allowance: tier.propertyAllowance,
          returnUrl: `${siteConfig.url}/get-started?session_id=${sessionId}`,
        });
      } catch (err) {
        console.error("[get-started] Failed to send checkout confirmation email", err);
      }
    }
    try {
      await stripe.checkout.sessions.update(sessionId, {
        metadata: { ...checkoutSession.metadata, confirmationEmailSent: "true" },
      });
    } catch (err) {
      console.error("[get-started] Failed to mark confirmationEmailSent on Stripe session", err);
    }
  }

  return <GetStartedForm token={token} tierId={tier.id} allowance={tier.propertyAllowance} used={used} />;
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
