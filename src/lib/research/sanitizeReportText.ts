/**
 * Guards every customer-facing free-text field the research models produce —
 * tax insights, insurance notes, market-trend commentary, rent confidence
 * notes, condo-approval notes, the rent-accuracy narrative — against leaking
 * internal/technical language into a paying customer's report.
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
 * A second real instance the same night (GRR-MTKIHYO2) wrote "the web_search
 * tool budget for this session was exhausted... tool-use-limit error" —
 * underscore and hyphen variants the original pattern's space-only
 * separators missed. Pattern list extended again 2026-09-03 (CoWork review
 * of the same incident) with more specific phrasings and implementation
 * identifiers (max_uses, tool_use, AbortController, withHardDeadline) drawn
 * from the actual raw text these incidents produced — treat this as a living
 * list, not a one-time fix.
 *
 * A hit here doesn't fail the request or hold the job for review — it swaps
 * in a clean, professional fallback sentence and logs a warning server-side
 * so drift in the underlying model's behavior stays visible without ever
 * reaching a customer.
 */
const SEP = "[\\s_-]?";
const TECHNICAL_LANGUAGE_PATTERNS: RegExp[] = [
  new RegExp(
    "\\b(" +
      [
        `web${SEP}search`,
        `search${SEP}tool`,
        "the tool",
        `tool${SEP}use`,
        `tool${SEP}budget`,
        `tool${SEP}limit`,
        "api",
        "json",
        "http",
        `time${SEP}out`,
        "aborted",
        "abort",
        "retr(?:y|ies|ying)",
        `rate${SEP}limit`,
        `query${SEP}strateg\\w*`,
        `search${SEP}strateg\\w*`,
        `search${SEP}attempt`,
        `search${SEP}session`,
        "this session",
        "the model",
        "large language model",
        "\\bllm\\b",
        "claude",
        "anthropic",
        `token${SEP}limit`,
        "sandbox",
        "stack trace",
        "null value",
        "undefined",
        "error message",
        "exception",
      ].join("|") +
      ")\\b",
    "i",
  ),
  /\bsession (?:was|has been) exhausted\b/i,
  /\bmax_uses\b/i,
  /\btool_use\b/i,
  /\btool[- ]?(?:usage|use) limit\b/i,
  /\b(?:web[- ]?search|search) capacity\b/i,
  /\bexceeded (?:the )?(?:tool|search)(?:[- ]use)? (?:limit|budget|capacity)\b/i,
  /\bblocked with a tool[- ]use[- ]limit error\b/i,
  /\banthropic api\b/i,
  /\bapi key\b/i,
  /\brate[- ]limited?\b/i,
  /\b(?:this|the) (?:session|request) (?:timed out|hit (?:a|the) deadline)\b/i,
  /\bAbortController\b/i,
  /\bwithHardDeadline\b/i,
  /\b(?:claude|the model|the assistant) (?:was unable to|could not) (?:use|call|invoke) (?:the |its )?(?:web[- ]?search|tool)\b/i,
  /\b(?:hit|reached) (?:a|the) (?:tool|search|web[- ]?search)[- ]?(?:usage|use)? (?:limit|budget|capacity)\b/i,
  /\bdid not return usable results this session\b/i,
  /\bnot return usable results\b/i,
];

/** True when the text describes its own tool/session/API mechanics rather than substantive findings — exposed separately for callers that want to check/log without necessarily replacing the text. */
export function looksLikeToolMechanicsText(text: string): boolean {
  return TECHNICAL_LANGUAGE_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * @param text The raw candidate text from a research model's response.
 * @param fallback A clean, professional sentence to use if `text` is empty
 *   or trips the technical-language filter.
 * @param context A short label identifying which field this is, for the
 *   warning log only — never shown to a customer.
 */
export function sanitizeReportText(text: string | null | undefined, fallback: string, context: string): string {
  if (!text || !text.trim()) return fallback;
  if (looksLikeToolMechanicsText(text)) {
    console.warn("[sanitizeReportText] Filtered technical language from customer-facing text", { context, original: text });
    return fallback;
  }
  return text;
}
