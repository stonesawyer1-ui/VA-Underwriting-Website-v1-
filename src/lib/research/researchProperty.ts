import Anthropic from "@anthropic-ai/sdk";
import { extractJson } from "./jsonExtract";
import { lookupTaxRate, taxRateEntryToResearchOutcome } from "./taxRateDatabase";
import { withHardDeadline } from "./hardDeadline";

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

const SYSTEM_PROMPT = `You are researching a specific real estate property, in any U.S. state, to underwrite it for VA rental financing.
You will be given an address and state. Find, using web search:

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

/**
 * In-memory cache keyed by normalized address, 30-day TTL. This resets on
 * server restart and is not shared across serverless instances — fine for a
 * single long-running dev/prod server, but a real deployment on serverless
 * infrastructure needs a persistent store (Redis/DB) instead.
 */
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const cache = new Map<string, { result: PropertyResearch; expiresAt: number }>();

function normalizeCacheKey(address: string, state: string): string {
  return `${address.trim().toLowerCase()}|${state.trim().toUpperCase()}`;
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

  const cacheKey = normalizeCacheKey(address, state);
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { status: "ok", result: cached.result, cached: true };
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
  // withHardDeadline() below enforces a real one via AbortController; the
  // client's own timeout stays as a secondary guard.
  // Raised to 650s on 2026-08-31: the intake route runs under Vercel Pro's
  // 800s ceiling (the real, generally-available budget — not the 1800s
  // extended-duration beta, which this account isn't enrolled in), leaving
  // ~150s of headroom after this for compute/PDF/email — a slow-but-real
  // search round is worth waiting out rather than cutting off just to fail
  // fast into a retry queue.
  const client = new Anthropic({ apiKey, timeout: 650_000 });

  let lastErr: unknown;
  for (let attempt = 0; attempt < 1; attempt++) {
    try {
      return await withHardDeadline(650_000, (signal) =>
        runResearchAttempt(client, address, city, state, zip, knownFacts, cacheKey, signal),
      );
    } catch (err) {
      lastErr = err;
      console.error(`[research] Attempt ${attempt + 1} failed`, err);
    }
  }
  return { status: "error", message: lastErr instanceof Error ? lastErr.message : "Unknown research error" };
}

async function runResearchAttempt(
  client: Anthropic,
  address: string,
  city: string,
  state: string,
  zip: string,
  knownFacts: { sqft?: number; beds?: number; baths?: number; yearBuilt?: number },
  cacheKey: string,
  signal: AbortSignal,
): Promise<ResearchOutcome> {
  const response = await client.messages.create(
    {
      model: "claude-sonnet-5",
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
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

  cache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });

  // Audit log: every research call's raw response, alongside the address it was for.
  console.log("[research] Property research completed", {
    address,
    state,
    taxModel: result.taxModel,
  });

  return { status: "ok", result, cached: false };
}
