import Anthropic from "@anthropic-ai/sdk";
import { extractJson } from "./jsonExtract";
import { withHardDeadline } from "./hardDeadline";

export type CondoApproval = {
  applicable: boolean;
  status: "approved" | "not_approved" | "unconfirmed";
  note: string;
  source: string | null;
};

export type MarketTrendBullet = { note: string; source: string | null };

export type MemoNarrative = {
  condoApproval: CondoApproval | null;
  marketTrends: {
    note: string;
    sourcesConflict: boolean;
    bullets: MarketTrendBullet[];
  };
  positiveFactors: string[];
  marketRiskRating: "LOW" | "MEDIUM" | "MEDIUM-HIGH" | "HIGH";
};

export type MemoNarrativeOutcome =
  | { status: "not_configured" }
  | { status: "error"; message: string }
  | { status: "ok"; result: MemoNarrative };

const SYSTEM_PROMPT = `You are researching the local-market and financing-eligibility context for a VA-financed rental
property, to support an independent buyer risk memorandum. You will be given the address, whether
it's a condo, and a short summary of numbers already calculated elsewhere (tax and cash-flow) —
use that context only to keep your commentary consistent with it; do not recompute or contradict
those figures.

1. VA condo project approval (ONLY if told the property is a condo): search for whether this
   specific condo project/association appears on the VA's approved condo project list. If you
   cannot confirm either way from an authoritative source, say so explicitly and mark status
   "unconfirmed" rather than guessing "approved". This is a financing-eligibility gate, not a
   cash-flow risk — an unapproved project blocks VA financing regardless of the numbers.
2. Local market trends: current pricing/appreciation trend and economic drivers for the specific
   city/neighborhood. Check multiple sources (e.g. Zillow, Redfin, a local brokerage report). If
   sources genuinely disagree, say so explicitly rather than picking whichever tells the cleanest
   story — note that disagreement is itself a data point. Include zip-level detail when available,
   noting when it differs from the city-level picture.
3. Safety: compare city-level and zip-level crime/safety data - these often disagree, and the
   zip-level or block-level picture usually matters more for a specific property.
4. Schools and demand drivers: school district quality, proximity to military installations or
   major employers, and anything else that supports or weakens rental/resale demand.
5. Positive factors: 3-6 short, genuinely balanced bullets weighing the good against the risk
   items already established (tax swing size relative to other states' mechanisms, safety, schools,
   employment base, anything else relevant). Do not restate the entitlement/financing bullet - that
   is handled separately.
6. A single overall "market_risk_rating" (LOW / MEDIUM / MEDIUM-HIGH / HIGH) reflecting how much
   uncertainty or risk the market-trend picture itself adds - not the tax or cash-flow risk, which
   are handled elsewhere.

Valid JSON only: never use a literal double-quote character inside a string value (e.g. when quoting a phrase from a source) - use single quotes ' ' instead, since an embedded " breaks the surrounding string.

Return your findings as a single JSON object matching this schema, and nothing else after it:
{
  "condo_approval": {"applicable": boolean, "status": "approved"|"not_approved"|"unconfirmed", "note": "string", "source": string|null} | null,
  "market_trends": {"note": "string - 1-2 sentence overview", "sources_conflict": boolean, "bullets": [{"note": "string", "source": string|null}]},
  "positive_factors": ["string", ...],
  "market_risk_rating": "LOW"|"MEDIUM"|"MEDIUM-HIGH"|"HIGH"
}
"condo_approval" must be null if the property is not a condo.`;

export async function researchMemoNarrative(params: {
  address: string;
  city: string;
  state: string;
  zip: string;
  isCondo: boolean;
  /**
   * Optional — omitted when this call runs in parallel with the tax/rent
   * research instead of after it (the normal case as of 2026-08-31, so all
   * three research calls share one wait instead of stacking two of them).
   * The narrative only ever used this for light phrasing consistency, never
   * as something its own research substantively depends on, so a generic
   * placeholder here costs nothing real.
   */
  computedContext?: string;
}): Promise<MemoNarrativeOutcome> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { status: "not_configured" };
  }

  // This call now runs in parallel with researchProperty/researchRentEstimate
  // (2026-08-31), not sequentially after them, so it shares the same 300s
  // ceiling rather than getting whatever's left over.
  //
  // The SDK's own `timeout` option turned out NOT to be a reliable absolute
  // deadline on its own — a real submission ran well past it without ever
  // throwing, and Vercel's 300s ceiling killed the whole request instead.
  // withHardDeadline() enforces a real one via AbortController; the
  // client's own timeout stays as a secondary guard.
  const client = new Anthropic({ apiKey, timeout: 150_000 });

  let lastErr: unknown;
  for (let attempt = 0; attempt < 1; attempt++) {
    try {
      const response = await withHardDeadline(150_000, (signal) =>
        client.messages.create(
          {
            model: "claude-sonnet-5",
            max_tokens: 4096,
            system: SYSTEM_PROMPT,
            tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 8 }],
            messages: [
              {
                role: "user",
                content: `Address: ${params.address}\nCity: ${params.city}\nState: ${params.state}\nZip: ${params.zip}\nIs condo: ${params.isCondo}\nAlready-calculated context: ${
                  params.computedContext ??
                  "Not yet calculated — this runs in parallel with that step. Keep positive-factor phrasing general (e.g. 'a moderate tax swing relative to other states') rather than citing a specific dollar figure you don't have."
                }`,
              },
            ],
          },
          { signal },
        ),
      );

      const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text");
      const fullText = textBlocks.map((b) => b.text).join("\n");
      const parsed = extractJson(fullText) as {
        condo_approval?: {
          applicable?: boolean;
          status?: string;
          note?: string;
          source?: string | null;
        } | null;
        market_trends?: {
          note?: string;
          sources_conflict?: boolean;
          bullets?: { note?: string; source?: string | null }[];
        };
        positive_factors?: string[];
        market_risk_rating?: string;
      };

      const condoApproval: CondoApproval | null = parsed.condo_approval
        ? {
            applicable: Boolean(parsed.condo_approval.applicable),
            status:
              parsed.condo_approval.status === "approved" || parsed.condo_approval.status === "not_approved"
                ? parsed.condo_approval.status
                : "unconfirmed",
            note: parsed.condo_approval.note ?? "Approval status could not be confirmed from an authoritative source.",
            source: parsed.condo_approval.source ?? null,
          }
        : null;

      const validRatings = ["LOW", "MEDIUM", "MEDIUM-HIGH", "HIGH"] as const;
      const marketRiskRating = validRatings.includes(parsed.market_risk_rating as (typeof validRatings)[number])
        ? (parsed.market_risk_rating as (typeof validRatings)[number])
        : "MEDIUM";

      const result: MemoNarrative = {
        condoApproval,
        marketTrends: {
          note: parsed.market_trends?.note ?? "Market trend data was not conclusively found for this address.",
          sourcesConflict: Boolean(parsed.market_trends?.sources_conflict),
          bullets: (parsed.market_trends?.bullets ?? [])
            .filter((b) => typeof b.note === "string")
            .map((b) => ({ note: b.note as string, source: b.source ?? null })),
        },
        positiveFactors: (parsed.positive_factors ?? []).filter((f): f is string => typeof f === "string"),
        marketRiskRating,
      };

      return { status: "ok", result };
    } catch (err) {
      lastErr = err;
      console.error(`[memo-narrative] Attempt ${attempt + 1} failed`, err);
    }
  }
  return { status: "error", message: lastErr instanceof Error ? lastErr.message : "Unknown research error" };
}
