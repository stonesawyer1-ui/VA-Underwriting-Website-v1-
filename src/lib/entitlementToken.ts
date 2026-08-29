import crypto from "crypto";
import { getPricingTier, type PricingTier } from "@/lib/site";

/**
 * Entitlement state travels with the client as a signed token instead of
 * living in server memory. Next.js route handlers and page Server
 * Components can run in separate worker processes (confirmed by testing —
 * an in-memory Map written in one did not appear in the other) and
 * definitely don't share memory across serverless invocations in
 * production. A signed token needs no shared storage at all: whoever holds
 * a validly-signed token can prove their payment and their remaining
 * allowance without the server remembering anything.
 */
const SECRET = process.env.ENTITLEMENT_SECRET || "dev-only-insecure-default-change-me";

export type EntitlementPayload = {
  stripeSessionId: string;
  tierId: PricingTier["id"];
  allowance: number;
  used: number;
  customerEmail: string | null;
};

export function signEntitlement(payload: EntitlementPayload): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifyEntitlement(token: string): EntitlementPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [data, sig] = parts;

  const expectedSig = crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString()) as EntitlementPayload;
    if (!getPricingTier(payload.tierId)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function createEntitlementToken(
  stripeSessionId: string,
  tierId: string,
  customerEmail: string | null,
  used = 0,
): string | null {
  const tier = getPricingTier(tierId);
  if (!tier) return null;
  return signEntitlement({
    stripeSessionId,
    tierId: tier.id,
    allowance: tier.propertyAllowance,
    used: Math.min(Math.max(0, used), tier.propertyAllowance),
    customerEmail,
  });
}
