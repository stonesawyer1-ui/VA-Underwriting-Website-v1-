/**
 * Guards every customer-facing free-text field the research models produce —
 * tax insights, insurance notes, market-trend commentary, rent confidence
 * notes, condo-approval notes — against leaking internal/technical language
 * into a paying customer's report.
 *
 * The system prompts in researchProperty.ts / researchRentEstimate.ts /
 * researchMemoNarrative.ts already instruct the model to write in plain
 * business language and never describe its own search process. This is the
 * belt-and-suspenders backstop for the rare case a model ignores that — real
 * incident: GRR-MTKATP8P, 2026-09-02, where a rent-research attempt wrote its
 * confidence note as "the web search tool became unavailable ('tool use
 * limit exceeded') after the first search attempt and remained unavailable
 * through more than a dozen retries..." instead of a market-data finding.
 * That specific field happened to be routed around (a null rent value falls
 * back to a regional estimate before this text is ever displayed), but
 * nothing stopped the same kind of text from landing directly in a tax
 * insight or market-trend note, which are shown to the customer with no
 * confidence gating at all.
 *
 * A hit here doesn't fail the request or hold the job for review — it swaps
 * in a clean, professional fallback sentence and logs a warning server-side
 * so drift in the underlying model's behavior stays visible without ever
 * reaching a customer.
 */
const TECHNICAL_LANGUAGE_PATTERN =
  /\b(web[- ]?search|search tool|the tool|tool use|api|json|http|time ?out|aborted|abort|retr(?:y|ies|ying)|rate limit|query strateg\w*|search strateg\w*|search attempt|the model|large language model|\bllm\b|claude|anthropic|token limit|sandbox|stack trace|null value|undefined|error message|exception)\b/i;

/**
 * @param text The raw candidate text from a research model's response.
 * @param fallback A clean, professional sentence to use if `text` is empty
 *   or trips the technical-language filter.
 * @param context A short label identifying which field this is, for the
 *   warning log only — never shown to a customer.
 */
export function sanitizeReportText(text: string | null | undefined, fallback: string, context: string): string {
  if (!text || !text.trim()) return fallback;
  if (TECHNICAL_LANGUAGE_PATTERN.test(text)) {
    console.warn("[sanitizeReportText] Filtered technical language from customer-facing text", { context, original: text });
    return fallback;
  }
  return text;
}
