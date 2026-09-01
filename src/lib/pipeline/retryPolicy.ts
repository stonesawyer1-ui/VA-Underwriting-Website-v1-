import type { ProcessingJob } from "@/lib/jobStore";

/**
 * Safety-only fallback, not the normal gate: a clean attempt clears
 * job.attemptInProgress the moment it finishes (see jobStore.ts), so most
 * retries fire on the very next sweep tick regardless of this value. This
 * threshold only matters for the pathological case where a hard kill
 * mid-attempt prevents that flag from ever being cleared — comfortably
 * longer than the pipeline's own maxDuration (1800s = 30min) so a genuinely
 * still-running attempt is never picked up twice at once.
 */
export const STALE_THRESHOLD_MS = 35 * 60 * 1000;

/**
 * Decides whether a pending job is safe for the retry sweep to pick up
 * right now.
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
