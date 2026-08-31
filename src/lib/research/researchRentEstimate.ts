import Anthropic from "@anthropic-ai/sdk";
import { extractJson } from "./jsonExtract";

export type RentComp = {
  address: string;
  rent: number;
  beds: number;
  baths: number;
  sqft: number;
  source: string;
};

export type RentEstimate = {
  low: number | null;
  base: number | null;
  high: number | null;
  /** Structured, not free text — the confidence gate compares against this directly. */
  confidence: "low" | "moderate" | "high";
  confidenceNote: string;
  comps: RentComp[];
  researchedAt: string;
};

export type RentResearchOutcome =
  | { status: "not_configured" }
  | { status: "error"; message: string }
  | { status: "ok"; result: RentEstimate; cached: boolean };

/**
 * Rent gets its own dedicated call with its own full search budget — bundled
 * into the same call as tax research, it kept losing out on search budget to
 * tax-district lookups and coming back "low confidence, budget exhausted"
 * even for ordinary residential addresses. Rent comps are the core number
 * the whole cash-flow section depends on, so this call is built to actually
 * exhaust reasonable search strategies before settling for "low".
 */
const SYSTEM_PROMPT = `You are finding real, currently active rental comps for a specific residential property, to
underwrite it for VA rental financing. You have a generous web-search budget dedicated entirely
to this task — use it. A single search attempt that comes up empty is not a reason to report low
confidence; try multiple listing platforms and search strategies before concluding comps don't
exist.

Find 3-5 CURRENTLY ACTIVE rental listings within up to 10 miles of the subject property, matching
bed/bath/sqft as closely as possible:
- Search across multiple sources: Zillow rentals, Apartments.com, Realtor.com rentals, Rent.com,
  and any local property-management company or MLS rental feed you can reach. Do not stop after
  one platform returns nothing.
- Start close and widen the radius up to the 10-mile limit if closer searches don't turn up
  enough comps.
- If exact bed/bath/sqft matches aren't available, use the closest reasonable matches (e.g. one
  bedroom off) and say so explicitly in your confidence note - a well-reasoned adjustment beats
  giving up.
- Never use sold listings, expired listings, or algorithmic rent estimates (Zestimates,
  Rentometer, etc.) as a substitute for real active comps - if you truly cannot find any real
  active comps after trying multiple platforms and the full radius, say so and set confidence to
  "low", but that should be the exception, not the default outcome.

Rate your confidence as exactly one of "low", "moderate", or "high":
- "high": several close, well-matched active comps found.
- "moderate": reasonable active comps found, but with some compromise (wider radius, a bed/bath
  mismatch, fewer than 3 comps, or listings that needed cross-referencing across platforms).
- "low": genuinely could not find usable comps after trying multiple platforms and the full
  10-mile radius - this should be rare, not the default when the first search doesn't turn up a
  perfect match.

Put your reasoning, any adjustments you made, and caveats in "confidence_note" as plain text.

Valid JSON only: never use a literal double-quote character inside a string value (e.g. when quoting a phrase from a source) - use single quotes ' ' instead, since an embedded " breaks the surrounding string.

Return your findings as a single JSON object matching this schema, and nothing else after it:
{
  "low": number|null,
  "base": number|null,
  "high": number|null,
  "confidence": "low"|"moderate"|"high",
  "confidence_note": "string",
  "comps": [{"address": "string", "rent": number, "beds": number, "baths": number, "sqft": number, "source": "string"}]
}`;

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const cache = new Map<string, { result: RentEstimate; expiresAt: number }>();

function normalizeCacheKey(address: string, state: string): string {
  return `${address.trim().toLowerCase()}|${state.trim().toUpperCase()}`;
}

export async function researchRentEstimate(
  address: string,
  city: string,
  state: string,
  zip: string,
  knownFacts: { sqft?: number; beds?: number; baths?: number },
): Promise<RentResearchOutcome> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { status: "not_configured" };
  }

  const cacheKey = normalizeCacheKey(address, state);
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { status: "ok", result: cached.result, cached: true };
  }

  // Hard per-attempt timeout so a slow/stuck web-search round can't silently
  // consume the whole request — this call runs in parallel with
  // researchProperty, and both share the intake route's 300s ceiling with
  // the narrative pass still to come after them. Capped at 2 attempts
  // (was 3) for the same reason: a customer submission timing out with no
  // email at all (as happened on 2026-08-30) is worse than a bounded,
  // occasionally-lower-confidence result.
  const client = new Anthropic({ apiKey, timeout: 70_000 });

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await client.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 10 }],
        messages: [
          {
            role: "user",
            content: `Address: ${address}\nCity: ${city}\nState: ${state}\nZip: ${zip}\nKnown facts: ${JSON.stringify(knownFacts)}`,
          },
        ],
      });

      const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text");
      const fullText = textBlocks.map((b) => b.text).join("\n");
      const parsed = extractJson(fullText) as {
        low?: number | null;
        base?: number | null;
        high?: number | null;
        confidence?: string;
        confidence_note?: string;
        comps?: RentComp[];
      };

      const result: RentEstimate = {
        low: parsed.low ?? null,
        base: parsed.base ?? null,
        high: parsed.high ?? null,
        confidence: (["low", "moderate", "high"] as const).includes(parsed.confidence as "low" | "moderate" | "high")
          ? (parsed.confidence as "low" | "moderate" | "high")
          : "low",
        confidenceNote: parsed.confidence_note ?? "No confidence reasoning returned.",
        comps: parsed.comps ?? [],
        researchedAt: new Date().toISOString(),
      };

      cache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });
      console.log("[research-rent] Rent estimate completed", { address, state, confidence: result.confidence });

      return { status: "ok", result, cached: false };
    } catch (err) {
      lastErr = err;
      console.error(`[research-rent] Attempt ${attempt + 1} failed`, err);
    }
  }
  return { status: "error", message: lastErr instanceof Error ? lastErr.message : "Unknown research error" };
}
