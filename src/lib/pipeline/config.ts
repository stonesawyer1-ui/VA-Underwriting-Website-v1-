/**
 * Single source of truth for every timing/retry constant in the async job
 * pipeline (intake -> research -> confidence gate -> retry sweep).
 *
 * Before this file existed, six related constants lived in six different
 * files with no cross-referencing, which is exactly how the 2026-09-01
 * regressions happened twice in one night (see researchProperty.ts's
 * incident log): someone tuned one number without noticing a different file
 * depended on the old value. Everything that used to be a magic number in
 * researchProperty.ts / researchRentEstimate.ts / researchMemoNarrative.ts /
 * retryPolicy.ts / processSubmission.ts now imports it from here instead.
 *
 * The two exceptions are `export const maxDuration` in
 * src/app/api/underwriting-intake/route.ts and
 * src/app/api/process-pending/route.ts — Next.js's route-segment-config
 * requires that value to be a statically-analyzable literal number, not an
 * imported variable, so it cannot be sourced from here directly. Both route
 * files carry a comment pointing back to ROUTE_MAX_DURATION_SECONDS below,
 * and config.test.ts asserts their literals still match this module, so a
 * drift between them fails the test suite instead of silently reappearing.
 */

/**
 * Absolute wall-clock cutoff for a single research call — researchRentEstimate
 * and researchMemoNarrative share this one; researchProperty gets its own,
 * longer PROPERTY_RESEARCH_HARD_DEADLINE_MS below (2026-09-02) since it
 * consistently needs more time. Enforced by withHardDeadline()'s own
 * AbortController rather than the Anthropic SDK's `timeout` option (see
 * hardDeadline.ts for why the SDK option alone isn't reliable). Tuned to
 * 240s after two same-night regressions — see researchProperty.ts's
 * incident log for the full story of 25min and 180s both being wrong in
 * opposite directions.
 */
export const RESEARCH_HARD_DEADLINE_MS = 240_000;

/**
 * Dedicated hard deadline for researchProperty() only (2026-09-02 speed
 * pass, incident GRR-MTKATP8P — Moore County, NC, zip 28387, a zip NOT in
 * taxRateDatabase.json). researchRentEstimate() and researchMemoNarrative()
 * stay on the shared RESEARCH_HARD_DEADLINE_MS above.
 *
 * researchProperty() does genuinely more sub-work per call than the other
 * two: on a tax-database miss it has to find the county tax district, pull
 * the current official rate, classify which of four tax models applies,
 * *and* produce a market-rate insurance estimate — all in one web-search
 * call — versus researchRentEstimate's single comps search or
 * researchMemoNarrative's single-topic passes. The incident data backs this
 * up directly: on GRR-MTKATP8P, researchProperty hit the 240s deadline on 7
 * of 8 attempts, while the other two calls (which don't depend on the tax
 * database and ran on the same job) mostly succeeded in 100-200s. The one
 * researchProperty attempt that *did* succeed took 151s — already 63% of
 * the 240s budget for a call sharing that budget with the two harder
 * sub-tasks above.
 *
 * Picked 360s (1.5x RESEARCH_HARD_DEADLINE_MS) rather than a bigger jump:
 * the one success (151s) suggests a genuinely-completing call mostly lands
 * well under 240s already, so the failures look like real multi-round
 * search work running past 240s, not a call that needs many multiples of
 * it — 1.5x gives a real additional round of search headroom without
 * reintroducing the 2026-09-01 regression class this file's header
 * describes (an overlong deadline letting one stuck call eat the delivery
 * budget). Re-check this number against fresh incident data after the
 * change ships; there wasn't a large enough sample to fit a precise
 * percentile.
 *
 * Headroom check (see ROUTE_MAX_DURATION_SECONDS below): the three research
 * calls run in parallel (see processSubmission.ts), so the fan-out's own
 * worst case is now bounded by this constant, not RESEARCH_HARD_DEADLINE_MS
 * — 360s, leaving 600s - 360s = 240s for PDF/XLSX generation and email
 * delivery afterward, which in practice takes low single-digit seconds, not
 * minutes. If this constant is ever raised again, re-verify that headroom
 * still holds (config.test.ts only checks the maxDuration literals stay in
 * sync with each other, not that they leave enough room for this deadline).
 */
export const PROPERTY_RESEARCH_HARD_DEADLINE_MS = 360_000;

/**
 * The Anthropic SDK client's own `timeout` option. Deliberately much more
 * generous than RESEARCH_HARD_DEADLINE_MS and *not* meant to be the thing
 * that actually fires in normal operation — it's a backstop in case
 * withHardDeadline's AbortController somehow doesn't propagate. Matching
 * this too closely to the hard deadline let its unreliable idle-timeout
 * behavior race the AbortController and win on a real submission (see
 * researchProperty.ts).
 */
export const ANTHROPIC_CLIENT_TIMEOUT_MS = 650_000;

/**
 * How long a job can sit "processing" (not yet delivered, not yet held for
 * review) before the retry sweep sends the owner a one-time early-warning
 * email (see sendPastHourAlertEmail, checked in process-pending/route.ts).
 * Added 2026-09-03 at the owner's explicit request: with the
 * confidence-seeking / infra-backoff redesign, a job can now legitimately
 * keep retrying for a long time (see MAX_INFRA_ATTEMPTS's comment — up to
 * ~1.5-2 hours in the worst case) before ever reaching a terminal state, so
 * "wait for it to finish, then get notified" isn't good enough anymore —
 * the owner wants to know it's running long WHILE it's still in flight, so
 * they can bring the referenceId to Claude for a real-time investigation
 * rather than only after the fact.
 */
export const PAST_HOUR_ALERT_THRESHOLD_MS = 60 * 60 * 1000;

/**
 * How often Vercel Cron invokes /api/process-pending (see vercel.json's
 * "schedule": "* * * * *"). This constant doesn't configure the cron itself
 * — vercel.json's schedule string is what Vercel actually reads — but every
 * piece of retry-timing math in this module treats 60s as the sweep's real
 * detection latency, so if vercel.json's schedule ever changes, this must
 * change with it (or vice versa).
 */
export const CRON_SWEEP_INTERVAL_MS = 60_000;

/**
 * export const maxDuration for both underwriting-intake/route.ts and
 * process-pending/route.ts. Kept here only as the documented value those two
 * literals must match — see the file-level comment above for why it can't
 * be imported directly into a route-segment-config export.
 */
export const ROUTE_MAX_DURATION_SECONDS = 600;

/**
 * Safety-only fallback for the retry sweep's "is this job still running"
 * check — see retryPolicy.ts's shouldRetryJob for the real (attemptInProgress)
 * signal this only backstops.
 */
export const STALE_THRESHOLD_MS = 12 * 60 * 1000;

/**
 * Path B (infrastructure faults — Anthropic errors, timeouts, a missing
 * ANTHROPIC_API_KEY): how many attempts the retry sweep gives a job before
 * finalizing it held_for_review (holdReason "infra_fault_exhausted") as a
 * last-resort safety valve so a submission is never stuck in "processing"
 * forever with no human ever finding out.
 *
 * Raised from the original 5 (a ~24-real-minute budget) specifically because
 * the owner's design goal is that a slow API or a transient outage should
 * never look like a data-quality finding just because a fixed retry count
 * ran out on a short timer. Combined with the exponential backoff in
 * retryPolicy.ts (base 30s, capped at 5min between attempts), 20 attempts
 * gives a genuine outage roughly 1.5-2 real hours to clear before a human
 * gets pulled in — long enough that "the API had a bad five minutes" almost
 * never reaches this ceiling, while a truly permanent break (e.g. the API
 * key itself got revoked, which will never self-heal no matter how many
 * times it's retried) still surfaces to a human in a bounded, predictable
 * time instead of retrying invisibly forever. See the design summary in
 * processSubmission.ts for why "retry forever, no ceiling at all" was
 * considered and rejected.
 *
 * Trade-off worth naming explicitly: this deliberately abandons the earlier
 * "under 25 minutes" delivery target for the rare genuine-outage case, in
 * exchange for never mislabeling an infrastructure problem as a
 * data-quality finding. The common (successful) case is unaffected — it's
 * only a sustained, multi-attempt outage that now takes up to ~2 hours
 * instead of ~24 minutes before a human is looped in.
 */
export const MAX_INFRA_ATTEMPTS = 20;

/** Base delay before the first infra-fault retry; see nextBackoffDelayMs. */
export const INFRA_BACKOFF_BASE_MS = 30_000;
/** Longest gap the exponential backoff is allowed to grow to for Path B. */
export const INFRA_BACKOFF_CAP_MS = 5 * 60 * 1000;

/**
 * Path A (a genuine confidence-gate finding — research succeeded but didn't
 * clear the 90% bar): how many total research rounds (the initial pass plus
 * refinement rounds) the pipeline runs before accepting that this is a real
 * data-quality gap rather than something more search effort will fix, and
 * finalizing held_for_review (holdReason "confidence_exhausted", charged
 * normally — this is a genuine finding, not a fault). Each round beyond the
 * first asks the research calls to broaden their search (wider radius,
 * alternate sources/phrasing) rather than repeating the identical query.
 */
export const MAX_CONFIDENCE_ROUNDS = 3;

/** Base delay before the next confidence-refinement round; shorter than the
 * infra backoff because this isn't waiting out an outage — it's a deliberate
 * "try a broader search" step that should happen fairly promptly. */
export const CONFIDENCE_BACKOFF_BASE_MS = 15_000;
/** Longest gap the confidence-refinement backoff is allowed to grow to. */
export const CONFIDENCE_BACKOFF_CAP_MS = 2 * 60 * 1000;

/** How long a research result (property or rent) is cached, keyed by
 * normalized address — both the in-memory and Redis tiers use this. */
export const RESEARCH_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const RESEARCH_CACHE_TTL_SECONDS = RESEARCH_CACHE_TTL_MS / 1000;

/**
 * Considered and rejected: Anthropic's Message Batches API for research
 * calls, to remove the synchronous-timeout risk entirely.
 *
 * Batches would remove the per-call wall-clock risk this whole hard-deadline
 * / retry-sweep system exists to manage — a batch job runs on Anthropic's
 * side with no client-held connection to time out at all. But it trades that
 * for a different latency shape that's a poor fit here:
 *   - Batches are typically processed within a window of up to 24 hours, not
 *     seconds-to-minutes; there's no guaranteed fast-path for a batch of one
 *     that needs an answer in the next few minutes, which is what a customer
 *     mid-submission actually needs.
 *   - Retrieving a batch result means polling (there's no push/webhook
 *     completion signal), so this system would still need a poll loop —
 *     effectively re-deriving the same cron-sweep architecture it already
 *     has, but pointed at a batch-status endpoint instead of directly
 *     retrying a live call.
 *   - It would double the moving parts (submit-to-batch, then poll-for-
 *     result, on top of the existing job-store retry state) for a workload
 *     (3 research calls per submission, seconds-to-a-few-minutes each) that
 *     doesn't have the batch API's actual sweet spot: large, latency-
 *     insensitive volumes.
 * If submission volume grows enough that Anthropic API cost (not latency)
 * becomes the binding constraint — Batches are typically priced lower per
 * token — this is worth revisiting, ideally as an opt-in "overnight batch"
 * path for a subset of low-urgency traffic rather than replacing the
 * synchronous path.
 */

/**
 * Exponential backoff with a cap, shared by both retry paths (they just pass
 * different base/cap values). `roundNumber` is 1 for the delay before the
 * *second* attempt (i.e. how long to wait after attempt 1 failed), 2 for the
 * delay before the third, and so on — matching "how many attempts have
 * already happened" so callers can pass job.attempts or job.confidenceRounds
 * directly.
 */
export function exponentialBackoffMs(roundNumber: number, baseMs: number, capMs: number): number {
  const raw = baseMs * Math.pow(2, Math.max(0, roundNumber - 1));
  return Math.min(raw, capMs);
}
