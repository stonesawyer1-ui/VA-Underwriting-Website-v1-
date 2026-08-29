import { NextRequest, NextResponse } from "next/server";
import { getStripeClient } from "@/lib/stripe";
import { getPricingTier, siteConfig } from "@/lib/site";

export async function POST(request: NextRequest) {
  const stripe = getStripeClient();
  if (!stripe) {
    return NextResponse.json(
      { error: "Payments aren't configured yet. Add STRIPE_SECRET_KEY to enable checkout." },
      { status: 503 },
    );
  }

  let body: { tierId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const tier = getPricingTier(body.tierId ?? "");
  if (!tier) {
    return NextResponse.json({ error: "Unknown pricing tier." }, { status: 400 });
  }

  const origin = request.headers.get("origin") ?? siteConfig.url;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: tier.price * 100,
          product_data: {
            name: `${siteConfig.name} — ${tier.name}`,
            description: `${tier.properties} — VA Home Underwriting Report`,
          },
        },
        quantity: 1,
      },
    ],
    metadata: { tierId: tier.id },
    allow_promotion_codes: true,
    success_url: `${origin}/get-started?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/pricing`,
  });

  if (!session.url) {
    return NextResponse.json({ error: "Could not start checkout." }, { status: 500 });
  }

  return NextResponse.json({ url: session.url });
}
