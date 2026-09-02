import Anthropic from "@anthropic-ai/sdk";
import { extractJson } from "./jsonExtract";
import { withHardDeadline } from "./hardDeadline";
import { getCachedResearch, setCachedResearch } from "./researchCache";
import { sanitizeReportText } from "./sanitizeReportText";
import { RESEARCH_HARD_DEADLINE_MS, ANTHROPIC_CLIENT_TIMEOUT_MS, RESEARCH_CACHE_TTL_MS, RESEARCH_CACHE_TTL_SECONDS } from "@/lib/pipeline/config";

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
 *
 * `refinementRound` 0 = the initial pass (10-mile radius, as always).
 * 1+ = a confidence-seeking retry (see processSubmission.ts's
 * confidence gate loop): the previous pass came back below the 90%
 * ("high") confidence bar, so this round is explicitly told it's a
 * do-over and asked to broaden its search — wider radius, more
 * platforms, different phrasing — rather than repeat the identical
 * query and land on the same answer again.
 */
function systemPrompt(refinementRound: number): string {
  const radiusMiles = Math.min(10 + refinementRound * 7, 30);
  const refinementNote =
    refinementRound > 0
      ? `\n\nIMPORTANT — this is refinement attempt ${refinementRound + 1}: an earlier search for this same property did not reach "high" confidence. Do not just repeat the same query. Genuinely broaden your effort this time: search additional listing platforms and local property-management sites you may not have tried, rephrase your search terms (try the neighborhood name, nearby cross-streets, or the zip code alone rather than just the street address), and use the full ${radiusMiles}-mile radius available this round. A different, wider search is far more likely to turn up better comps than repeating the same search would.`
      : "";
  return `You are finding real, currently active rental comps for a specific residential property, to
underwrite it for VA rental financing. You have a generous web-search budget dedicated entirely
to this task — use it. A single search attempt that comes up empty is not a reason to report low
confidence; try multiple listing platforms and search strategies before concluding comps don't
exist.${refinementNote}

If "units" is present in the known facts, this is a multi-unit property (duplex/triplex/fourplex)
being rented out unit-by-unit, not as one whole-building lease. In that case: find comps for EACH
unit's bed/bath size separately (a studio/1BR unit rents very differently than a 3BR unit in the
same building), then report "base"/"low"/"high" as the SUM of all units' rents combined — that
total is what feeds the property's cash-flow math. Say in "confidence_note" what each unit rented
for individually so the buyer can see the breakdown, and include comps for each unit size in
"comps". If "units" is absent, treat this as a single rentable unit as usual.

Find 3-5 CURRENTLY ACTIVE rental listings within up to ${radiusMiles} miles of the subject property, matching
bed/bath/sqft as closely as possible (per unit, if this is a multi-unit property):
- Search across multiple sources: Zillow rentals, Apartments.com, Realtor.com rentals, Rent.com,
  and any local property-management company or MLS rental feed you can reach. Do not stop after
  one platform returns nothing.
- Start close and widen the radius up to the ${radiusMiles}-mile limit if closer searches don't turn up
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
  ${radiusMiles}-mile radius - this should be rare, not the default when the first search doesn't turn up a
  perfect match.

Put your reasoning, any adjustments you made, and caveats in "confidence_note" as plain text.

Write "confidence_note" (and every other text field) in professional, plain-language business
prose for a homebuyer client, as a real-estate analyst would — describe only the property, the
comps you found, and market conditions. Never mention web searches, tools, retries, technical
limitations, or anything about how you performed the research. If you genuinely could not find
comps, state that as a market-data finding (e.g. "no active comparable listings were identified
within the search radius"), not as an explanation of a technical process.

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
}

// Two-tier cache (in-memory + Redis backstop) — see researchProperty.ts's
// cache comment for why both layers exist.
const cache = new Map<string, { result: RentEstimate; expiresAt: number }>();

function normalizeCacheKey(address: string, state: string): string {
  return `${address.trim().toLowerCase()}|${state.trim().toUpperCase()}`;
}

function redisCacheKey(cacheKey: string): string {
  return `research:rent:${cacheKey}`;
}

export async function researchRentEstimate(
  address: string,
  city: string,
  state: string,
  zip: string,
  knownFacts: { sqft?: number; beds?: number; baths?: number; units?: { beds?: number; baths?: number }[] },
  options?: {
    /**
     * >0 signals a confidence-seeking retry — see systemPrompt() and
     * processSubmission.ts's confidence gate loop. Also bypasses the cache
     * (reading AND writing under the normal key would just hand back the
     * same below-bar result that triggered the retry in the first place).
     */
    refinementRound?: number;
  },
): Promise<RentResearchOutcome> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { status: "not_configured" };
  }

  const refinementRound = options?.refinementRound ?? 0;
  const cacheKey = normalizeCacheKey(address, state);

  if (refinementRound === 0) {
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return { status: "ok", result: cached.result, cached: true };
    }
    const redisCached = await getCachedResearch<RentEstimate>(redisCacheKey(cacheKey));
    if (redisCached) {
      cache.set(cacheKey, { result: redisCached, expiresAt: Date.now() + RESEARCH_CACHE_TTL_MS });
      return { status: "ok", result: redisCached, cached: true };
    }
  }

  // Hard per-attempt timeout so a slow/stuck web-search round can't silently
  // consume the whole request — this call runs in parallel with
  // researchProperty, and both share the intake route's 300s ceiling with
  // the narrative pass still to come after them.
  //
  // Raised from 70s to 110s, retries dropped from 2 to 1, on 2026-08-31:
  // real-world timing showed Claude routing web_search through a
  // code_execution sandbox layer (extra latency per round) rather than
  // calling it directly, and multi-round rent-comp searches were
  // genuinely — not transiently — taking longer than 70s. A failed attempt
  // now costs the customer nothing regardless (see the
  // allowance-on-infra-failure fix).
  //
  // Same-day follow-up: the SDK's own `timeout` option turned out NOT to be
  // a reliable absolute deadline — a real submission ran well past it
  // without ever throwing, and Vercel's 300s ceiling killed the whole
  // request instead. withHardDeadline() enforces a real one via
  // AbortController and is the thing that should actually bound this call.
  //
  // Client timeout: 650s, a long-proven generous backstop (kept generous
  // deliberately — see researchProperty.ts for the 2026-09-01 regression
  // where matching it to the real deadline let this unreliable idle-timeout
  // mechanism fire instead of the AbortController).
  // Hard deadline: 240s, not the 180s briefly used the same night — that
  // was short enough that this call's legitimate 5-round searches failed
  // on every one of 5 retry attempts for a real submission, dumping it into
  // manual review instead of an automated report (also researchProperty.ts).
  const client = new Anthropic({ apiKey, timeout: ANTHROPIC_CLIENT_TIMEOUT_MS });

  const startedAt = Date.now();
  try {
    const response = await withHardDeadline(RESEARCH_HARD_DEADLINE_MS, (signal) =>
      client.messages.create(
        {
          model: "claude-sonnet-5",
          max_tokens: 4096,
          system: systemPrompt(refinementRound),
          tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }],
          messages: [
            {
              role: "user",
              content: `Address: ${address}\nCity: ${city}\nState: ${state}\nZip: ${zip}\nKnown facts: ${JSON.stringify(knownFacts)}`,
            },
          ],
        },
        { signal },
      ),
    );

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
      confidenceNote: sanitizeReportText(parsed.confidence_note, "No detailed comp reasoning was returned for this search.", "rent.confidenceNote"),
      comps: parsed.comps ?? [],
      researchedAt: new Date().toISOString(),
    };

    cache.set(cacheKey, { result, expiresAt: Date.now() + RESEARCH_CACHE_TTL_MS });
    await setCachedResearch(redisCacheKey(cacheKey), result, RESEARCH_CACHE_TTL_SECONDS);
    console.log("[research-rent] Rent estimate completed", {
      address,
      state,
      confidence: result.confidence,
      refinementRound,
      durationMs: Date.now() - startedAt,
    });

    return { status: "ok", result, cached: false };
  } catch (err) {
    console.error("[research-rent] Attempt failed", { address, state, refinementRound, durationMs: Date.now() - startedAt, err });
    return { status: "error", message: err instanceof Error ? err.message : "Unknown research error" };
  }
}
