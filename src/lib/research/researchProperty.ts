import Anthropic from "@anthropic-ai/sdk";
import { extractJson } from "./jsonExtract";
import { lookupTaxRate, taxRateEntryToResearchOutcome } from "./taxRateDatabase";
import { withHardDeadline } from "./hardDeadline";
import { getCachedResearch, setCachedResearch } from "./researchCache";
import { RESEARCH_HARD_DEADLINE_MS, ANTHROPIC_CLIENT_TIMEOUT_MS, RESEARCH_CACHE_TTL_MS, RESEARCH_CACHE_TTL_SECONDS } from "@/lib/pipeline/config";

export type FieldConfidence = "Confirmed" | "Estimated";

export type ResearchedField = {
  value: number | null;
  confidence: FieldConfidence;
  source: string | null;
};

export type TaxInsight = {
  note: string;
  source: string | null;
};

export type InsuranceEstimate = {
  annualPremium: number | null;
  confidence: FieldConfidence;
  source: string | null;
  note: string;
};

export type PropertyResearch = {
  taxModel: "assessment_ratio" | "homestead_exemption" | "flat_rate" | "fallback";
  taxFields: Record<string, ResearchedField>;
  /** State/county-specific tax rules worth flagging (caps, exemption portability, reassessment triggers) — informational only, never a substitute for a CPA or the county assessor. */
  taxInsights: TaxInsight[];
  /** Market-rate landlord/rental insurance estimate for this state and property value — never a real quote, always labeled Estimated. */
  insuranceEstimate: InsuranceEstimate;
  propertyFacts: {
    sqft: number | null;
    beds: number | null;
    baths: number | null;
    yearBuilt: number | null;
    confidence: string;
  };
  researchedAt: string;
  rawResponse: unknown;
};

export type ResearchOutcome =
  | { status: "not_configured" }
  | { status: "error"; message: string }
  | { status: "ok"; result: PropertyResearch; cached: boolean };

/**
 * `refinementRound` 0 = the initial pass. 1+ = a confidence-seeking retry
 * (see processSubmission.ts's confidence gate loop) — the previous pass
 * left at least one field (typically insurance, occasionally tax) without
 * a "high"-confidence answer, so this round is told explicitly to try
 * harder rather than repeat the same search and land on the same result.
 */
function systemPrompt(refinementRound: number): string {
  const refinementNote =
    refinementRound > 0
      ? `\n\nIMPORTANT — this is refinement attempt ${refinementRound + 1}: an earlier search for this property did not reach a fully confident answer for at least one field. Do not just repeat the same query. Try additional, different sources this time (a different named insurer's rate guidance, a different assessor page, a state insurance department filing) and different search phrasing before concluding a value can't be found.`
      : "";
  return `You are researching a specific real estate property, in any U.S. state, to underwrite it for VA rental financing.
You will be given an address and state. Find, using web search:${refinementNote}

1. The property's tax district / county / municipality and the CURRENT official combined tax
   rate for that specific parcel - from the county Assessor/Auditor's own published rate
   schedule, never a third-party estimate site. Determine which tax model applies for THIS
   SPECIFIC STATE:
   - "assessment_ratio": the state assesses owner-occupied and non-owner-occupied (rental)
     property at different percentages of fair market value (e.g. South Carolina).
   - "homestead_exemption": the state reduces the taxable value for an owner-occupied primary
     residence via a homestead exemption that does not apply once the property is a rental,
     rather than using a separate assessment ratio (e.g. Texas).
   - "flat_rate": the state applies one tax rate regardless of owner-occupancy status for a
     typical buyer, with no material owner-vs-rental differential (e.g. North Carolina).
   - "fallback": you cannot confidently determine which of the above applies, or the state's
     mechanism doesn't cleanly fit any of them.
   Return the specific rate components that model needs (see field names below), each with
   its own confidence and source. Also flag ANY state- or county-specific tax rules worth the
   buyer's attention as "tax_insights" - assessment caps, exemption portability rules,
   reassessment triggers on sale/PCS, circuit-breaker caps, etc. Every insight is informational
   only, is not tax or legal advice, and should say so; cite a source when you have one.
2. Basic property facts if not supplied: sqft, beds, baths, year built.
3. Only if the buyer has not supplied their own insurance quote: a market-rate ANNUAL
   landlord/rental-property (non-owner-occupied, "DP-3" style) insurance premium estimate for
   this property's state, county, and approximate value/sqft - based on published state or
   national average landlord insurance cost data (e.g. NAIC, Insurance Information Institute,
   or a named insurer's published rate guidance for that state). This is never a real quote for
   this specific property - always label its confidence "Estimated" (never "Confirmed"), cite
   your source, and say in "note" that it's a market-rate estimate, not a bindable quote, and
   the buyer should get a real quote before closing.

For every value you return, include a confidence label (Confirmed / Estimated) and the source
URL. If you cannot find real comps or a real tax rate, say so explicitly rather than guessing -
return null with an explanation, don't fabricate a plausible-sounding number.

Valid JSON only: never use a literal double-quote character inside a string value (e.g. when quoting a phrase from a source) - use single quotes ' ' instead, since an embedded " breaks the surrounding string.

Return your findings as a single JSON object matching this schema, and nothing else after it:
{
  "tax_model": "assessment_ratio | homestead_exemption | flat_rate | fallback",
  "tax_fields": { "<field_name>": { "value": number|null, "confidence": "Confirmed"|"Estimated", "source": string|null } },
  "tax_insights": [{"note": "string - plain-language, includes a not-tax-advice disclaimer", "source": string|null}],
  "insurance_estimate": {"annual_premium": number|null, "confidence": "Estimated", "source": string|null, "note": "string - market-rate estimate disclaimer"},
  "property_facts": {"sqft": number|null, "beds": number|null, "baths": number|null, "year_built": number|null, "confidence": "string"}
}

Field names expected in tax_fields, by tax_model:
- assessment_ratio: totalMillageRate, schoolOperatingMillage, schoolBondMillage, ownerAssessmentRatioPct, investorAssessmentRatioPct
- homestead_exemption: cityTaxRatePct, schoolIsdTaxRatePct, countyTaxRatePct, schoolHomesteadExemption
- flat_rate: combinedTaxRatePct
- fallback: estimatedEffectiveTaxRatePct

Units: every field ending in "Pct" is a plain percentage number, e.g. 6.5 for a
6.5% rate — NOT a fraction like 0.065. Millage fields (totalMillageRate,
schoolOperatingMillage, schoolBondMillage) are in mills. schoolHomesteadExemption
is a dollar amount.`;
}

/**
 * Two-tier cache, both keyed on normalized address, 30-day TTL:
 * 1. In-memory Map — fastest, but resets every cold start and is invisible
 *    to any other concurrently-running serverless instance.
 * 2. Redis (researchCache.ts) — durable backstop that actually survives
 *    cold starts and is shared across instances; this is what makes
 *    caching meaningfully effective in production (2026-09-01 — the
 *    in-memory-only cache was barely hitting at all in practice).
 * Checked in that order; a fresh result is written to both. TTL comes from
 * RESEARCH_CACHE_TTL_MS in pipeline/config.ts.
 */
const cache = new Map<string, { result: PropertyResearch; expiresAt: number }>();

function normalizeCacheKey(address: string, state: string): string {
  return `${address.trim().toLowerCase()}|${state.trim().toUpperCase()}`;
}

function redisCacheKey(cacheKey: string): string {
  return `research:property:${cacheKey}`;
}

function normalizeTaxFields(raw: Record<string, unknown> | undefined): Record<string, ResearchedField> {
  const out: Record<string, ResearchedField> = {};
  if (!raw) return out;
  for (const [key, value] of Object.entries(raw)) {
    const v = value as Partial<ResearchedField> | undefined;
    out[key] = {
      value: typeof v?.value === "number" ? v.value : null,
      confidence: v?.confidence === "Confirmed" ? "Confirmed" : "Estimated",
      source: typeof v?.source === "string" ? v.source : null,
    };
  }
  return out;
}

export async function researchProperty(
  address: string,
  city: string,
  state: string,
  zip: string,
  knownFacts: { sqft?: number; beds?: number; baths?: number; yearBuilt?: number },
  options?: {
    /** >0 signals a confidence-seeking retry — see systemPrompt() and processSubmission.ts. Bypasses the cache in both directions. */
    refinementRound?: number;
  },
): Promise<ResearchOutcome> {
  // Checked before anything else, including the API-key check below — a
  // verified rate answers the tax question with zero Anthropic cost and no
  // network round-trip at all, regardless of whether research is configured.
  const dbEntry = lookupTaxRate(state, zip);
  if (dbEntry) {
    console.log("[research] Tax-rate database hit — skipping Anthropic research entirely", {
      state,
      zip,
      county: dbEntry.county,
    });
    return taxRateEntryToResearchOutcome(dbEntry);
  }

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
    const redisCached = await getCachedResearch<PropertyResearch>(redisCacheKey(cacheKey));
    if (redisCached) {
      cache.set(cacheKey, { result: redisCached, expiresAt: Date.now() + RESEARCH_CACHE_TTL_MS });
      return { status: "ok", result: redisCached, cached: true };
    }
  }

  // Hard per-attempt timeout so a slow/stuck web-search round can't silently
  // consume the whole request. The intake API route has a 300s ceiling on
  // this plan; three research calls (this one, rent, and the narrative
  // pass) share that budget, so each one is bounded well below it — a
  // customer submission timing out with no email at all (as happened on
  // 2026-08-30) is worse than a bounded, occasionally-lower-confidence result.
  //
  // Raised from 70s to 110s, and retries dropped from 2 to 1, on
  // 2026-08-31: real-world timing showed Claude routing web_search through a
  // code_execution sandbox layer (extra latency per search round) rather
  // than calling it directly, and this call's multi-round searches were
  // genuinely — not transiently — taking longer than 70s.
  //
  // 2026-08-31 follow-up: the SDK's own `timeout` option (below) turned out
  // NOT to be a reliable absolute deadline on its own — a real submission
  // ran well past 110s without it ever throwing, and the whole request was
  // eventually killed by Vercel's 300s ceiling instead, the worst outcome.
  // withHardDeadline() below enforces a real one via AbortController — this
  // is the mechanism that should actually bound how long a call runs.
  //
  // 2026-09-01 regression #1 (stonesawyer1@gmail.com, GRR-MTJ0ZS2V): this had
  // been raised to 1500s (25min) during a same-night test of Vercel's
  // extended-max-duration beta and never brought back down. A single stuck
  // research call then had room to occupy nearly the entire background job's
  // retry budget by itself — the customer waited ~17 minutes for what should
  // have been one failed attempt plus one quick successful retry, because
  // the retry sweep (correctly) won't touch a job until its current attempt
  // actually finishes.
  //
  // 2026-09-01 regression #2 (same night, GRR-MTJ2RJ26, the very next real
  // submission): "fixed" #1 by dropping this to 180s — without noticing an
  // earlier commit had deliberately tuned it to 650s specifically because
  // real multi-round searches genuinely need that long, not just hung ones.
  // 180s was short enough that legitimate searches started failing outright
  // — this property's rent research failed on all 5 retry attempts, and the
  // job fell all the way through to a manual hold-for-review instead of an
  // automated report. Worse, the client's own `timeout` (below) had also
  // been dropped to that same 180s — matching it to the real deadline let
  // that unreliable idle-timeout mechanism (see the block above) become the
  // thing that actually fired, instead of our precise AbortController.
  //
  // Fix: keep this client-level timeout generous (650s, its long-proven
  // value) so it stays a rarely-firing backstop as originally intended, and
  // let withHardDeadline below be the real, precise cutoff at a more
  // realistic 240s — enough headroom for genuinely slow searches without
  // reintroducing regression #1.
  const client = new Anthropic({ apiKey, timeout: ANTHROPIC_CLIENT_TIMEOUT_MS });

  const startedAt = Date.now();
  try {
    const result = await withHardDeadline(RESEARCH_HARD_DEADLINE_MS, (signal) =>
      runResearchAttempt(client, address, city, state, zip, knownFacts, cacheKey, refinementRound, signal),
    );
    console.log("[research] Attempt finished", { address, state, refinementRound, durationMs: Date.now() - startedAt });
    return result;
  } catch (err) {
    console.error("[research] Attempt failed", { address, state, refinementRound, durationMs: Date.now() - startedAt, err });
    return { status: "error", message: err instanceof Error ? err.message : "Unknown research error" };
  }
}

async function runResearchAttempt(
  client: Anthropic,
  address: string,
  city: string,
  state: string,
  zip: string,
  knownFacts: { sqft?: number; beds?: number; baths?: number; yearBuilt?: number },
  cacheKey: string,
  refinementRound: number,
  signal: AbortSignal,
): Promise<ResearchOutcome> {
  const response = await client.messages.create(
    {
      model: "claude-sonnet-5",
      max_tokens: 8192,
      system: systemPrompt(refinementRound),
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }],
      messages: [
        {
          role: "user",
          content: `Address: ${address}\nCity: ${city}\nState: ${state}\nZip: ${zip}\nKnown facts: ${JSON.stringify(knownFacts)}`,
        },
      ],
    },
    { signal },
  );

  const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text");
  const fullText = textBlocks.map((b) => b.text).join("\n");
  const parsed = extractJson(fullText) as {
    tax_model?: string;
    tax_fields?: Record<string, unknown>;
    tax_insights?: { note?: string; source?: string | null }[];
    insurance_estimate?: {
      annual_premium?: number | null;
      confidence?: string;
      source?: string | null;
      note?: string;
    };
    property_facts?: {
      sqft?: number | null;
      beds?: number | null;
      baths?: number | null;
      year_built?: number | null;
      confidence?: string;
    };
  };

  const result: PropertyResearch = {
    taxModel: (["assessment_ratio", "homestead_exemption", "flat_rate"].includes(parsed.tax_model ?? "")
      ? parsed.tax_model
      : "fallback") as PropertyResearch["taxModel"],
    taxFields: normalizeTaxFields(parsed.tax_fields as Record<string, unknown>),
    taxInsights: (parsed.tax_insights ?? [])
      .filter((i) => typeof i.note === "string")
      .map((i) => ({ note: i.note as string, source: i.source ?? null })),
    insuranceEstimate: {
      annualPremium: parsed.insurance_estimate?.annual_premium ?? null,
      confidence: parsed.insurance_estimate?.confidence === "Confirmed" ? "Confirmed" : "Estimated",
      source: parsed.insurance_estimate?.source ?? null,
      note: parsed.insurance_estimate?.note ?? "Market-rate estimate, not a bindable quote — confirm with a real insurer before closing.",
    },
    propertyFacts: {
      sqft: parsed.property_facts?.sqft ?? null,
      beds: parsed.property_facts?.beds ?? null,
      baths: parsed.property_facts?.baths ?? null,
      yearBuilt: parsed.property_facts?.year_built ?? null,
      confidence: parsed.property_facts?.confidence ?? "unknown",
    },
    researchedAt: new Date().toISOString(),
    rawResponse: response,
  };

  cache.set(cacheKey, { result, expiresAt: Date.now() + RESEARCH_CACHE_TTL_MS });
  await setCachedResearch(redisCacheKey(cacheKey), result, RESEARCH_CACHE_TTL_SECONDS);

  // Audit log: every research call's raw response, alongside the address it was for.
  console.log("[research] Property research completed", {
    address,
    state,
    taxModel: result.taxModel,
    refinementRound,
  });

  return { status: "ok", result, cached: false };
}
