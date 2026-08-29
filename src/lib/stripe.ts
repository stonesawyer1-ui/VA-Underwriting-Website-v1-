import Stripe from "stripe";

let client: Stripe | null = null;

export function getStripeClient(): Stripe | null {
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) return null;
  if (!client) {
    client = new Stripe(apiKey);
  }
  return client;
}
