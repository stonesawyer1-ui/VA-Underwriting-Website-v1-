import { Redis } from "@upstash/redis";

/**
 * Shared Redis-backed cache for research results (property tax/insurance
 * research, rent comps) — persists across cold starts and across separate
 * serverless instances, unlike a plain in-memory Map (which resets every
 * cold start and is invisible to any other concurrently-running instance,
 * so in production it was barely caching anything).
 *
 * Same "user sets up, I use, gracefully no-op otherwise" pattern as
 * jobStore.ts: if UPSTASH_REDIS_REST_URL/TOKEN aren't configured, every
 * function here is a no-op (always a cache miss on read, a silent skip on
 * write) — caching is a pure performance/cost optimization, never something
 * the site can be broken by if Redis is unset or briefly down.
 */

let client: Redis | null = null;
let warnedMissingConfig = false;

function getClient(): Redis | null {
  if (client) return client;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (!warnedMissingConfig) {
      console.warn("[researchCache] UPSTASH_REDIS_REST_URL/TOKEN not set — research caching is disabled (every call is a live lookup).");
      warnedMissingConfig = true;
    }
    return null;
  }
  client = new Redis({ url, token });
  return client;
}

export async function getCachedResearch<T>(key: string): Promise<T | null> {
  const c = getClient();
  if (!c) return null;
  try {
    return (await c.get<T>(key)) ?? null;
  } catch (err) {
    console.error("[researchCache] get failed", { key, err });
    return null;
  }
}

export async function setCachedResearch<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const c = getClient();
  if (!c) return;
  try {
    await c.set(key, value, { ex: ttlSeconds });
  } catch (err) {
    console.error("[researchCache] set failed", { key, err });
  }
}
