import { Redis } from "@upstash/redis";

/**
 * Usage tracking for the friend/referral free-trial codes (FRIEND_TEST_CODES
 * env var, checked in get-started/page.tsx) — separate from the owner's own
 * OWNER_TEST_CODE, which is intentionally unlimited-use.
 *
 * Each friend code grants a small, fixed number of free reports
 * (FRIEND_CODE_ALLOWANCE). Unlike a real Stripe checkout, there's no Stripe
 * Checkout Session to store the "used" count in, so this module is the
 * authoritative store instead — same Upstash Redis instance jobStore.ts
 * already uses, just a different key namespace. Degrades to "0 used" (i.e.
 * unlimited) if Redis isn't configured, matching the rest of the codebase's
 * philosophy of never letting missing infra block a legitimate submission —
 * an acceptable trade for a small, privately-shared batch of codes, not a
 * publicly-published offer.
 */
let client: Redis | null = null;
let warnedMissingConfig = false;

function getClient(): Redis | null {
  if (client) return client;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (!warnedMissingConfig) {
      console.warn("[friendCodes] UPSTASH_REDIS_REST_URL/TOKEN not set — friend-code usage limits are disabled (codes behave as unlimited-use).");
      warnedMissingConfig = true;
    }
    return null;
  }
  client = new Redis({ url, token });
  return client;
}

function usageKey(code: string): string {
  return `friend_code_used:${code}`;
}

export async function getFriendCodeUsedCount(code: string): Promise<number> {
  const c = getClient();
  if (!c) return 0;
  try {
    const value = await c.get<number>(usageKey(code));
    return typeof value === "number" ? value : 0;
  } catch (err) {
    console.error("[friendCodes] getFriendCodeUsedCount failed", err);
    return 0;
  }
}

export async function incrementFriendCodeUsedCount(code: string): Promise<void> {
  const c = getClient();
  if (!c) return;
  try {
    await c.incr(usageKey(code));
  } catch (err) {
    console.error("[friendCodes] incrementFriendCodeUsedCount failed", err);
  }
}
