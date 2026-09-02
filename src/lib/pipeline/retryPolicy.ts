import type { ProcessingJob } from "@/lib/jobStore";
import {
  STALE_THRESHOLD_MS,
  INFRA_BACKOFF_BASE_MS,
  INFRA_BACKOFF_CAP_MS,
  CONFIDENCE_BACKOFF_BASE_MS,
  CONFIDENCE_BACKOFF_CAP_MS,
  exponentialBackoffMs,
} from "@/lib/pipeline/config";

export { STALE_THRESHOLD_MS };

/**
 * Decides whether a pending job is safe for the retry sweep to pick up right
 * now, purely from an in-flight-or-not standpoint — this is the "don't run
 * the same attempt twice at once" guard, not the backoff-spacing guard (see
 * isBackoffElapsed below for that).
 *
 * This is the exact logic that caused a real production incident on
 * 2026-09-01 (epskinner20@gmail.com, GRR-MTITR367): the sweep used to judge
 * "is this job still running" purely from elapsed time since lastAttemptAt,
 * with no way to know an attempt had already finished. A job whose research
 * failed and returned within seconds still had to wait out the full
 * STALE_THRESHOLD_MS window before the *next* sweep tick would touch it —
 * over 30 minutes of a customer's submission sitting untouched despite
 * already being retry-eligible. `attemptInProgress` fixes that: it's the
 * real signal, and elapsed time is only the fallback for when that signal
 * itself might be lying (a hard kill that never got to clear it).
 *
 * Extracted as a pure function (job + a wall-clock time in, boolean out) so
 * this specific regression is covered by a fast unit test instead of only
 * being caught by a real customer noticing their report never arrived.
 */
export function shouldRetryJob(job: Pick<ProcessingJob, "attemptInProgress" | "lastAttemptAt">, now: number = Date.now()): boolean {
  const ageMs = now - new Date(job.lastAttemptAt).getTime();
  const stillPlausiblyInFlight = job.attemptInProgress && ageMs < STALE_THRESHOLD_MS;
  return !stillPlausiblyInFlight;
}

/**
 * How long to wait after the most recent finished attempt before the sweep
 * is allowed to fire the *next* one — exponential backoff, distinct per
 * retry path (see config.ts for why Path A and Path B use different
 * base/cap values). Previously the sweep retried a job on literally the very
 * next 1-minute tick after any finished attempt, with no spacing at all; for
 * an infra outage affecting many jobs at once, that meant hammering the
 * Anthropic API at a fixed 1-minute cadence with no back-pressure, at the
 * fixed 5-attempt budget's most inefficient collar. Backoff spaces later
 * attempts further apart, giving a transient outage room to actually clear
 * between attempts instead of just re-trying into the same failure.
 *
 * `job.pendingRetryKind` records which counter (attempts vs
 * confidenceRounds) this particular pending retry is spaced against — set by
 * runJobAttempt the moment a job is left "processing" for either path.
 */
export function isBackoffElapsed(
  job: Pick<ProcessingJob, "lastAttemptAt" | "pendingRetryKind" | "attempts" | "confidenceRounds">,
  now: number = Date.now(),
): boolean {
  if (!job.pendingRetryKind) {
    // No retry pending (e.g. a fresh job on its very first attempt, or a
    // terminal job) — nothing to space out.
    return true;
  }
  const delayMs =
    job.pendingRetryKind === "infra"
      ? exponentialBackoffMs(job.attempts ?? 1, INFRA_BACKOFF_BASE_MS, INFRA_BACKOFF_CAP_MS)
      : exponentialBackoffMs(job.confidenceRounds ?? 1, CONFIDENCE_BACKOFF_BASE_MS, CONFIDENCE_BACKOFF_CAP_MS);
  const ageMs = now - new Date(job.lastAttemptAt).getTime();
  return ageMs >= delayMs;
}
