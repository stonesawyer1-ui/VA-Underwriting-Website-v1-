import { describe, it, expect } from "vitest";
import { shouldRetryJob, STALE_THRESHOLD_MS } from "./retryPolicy";

const NOW = new Date("2026-09-01T12:00:00Z").getTime();
const minutesAgo = (m: number) => new Date(NOW - m * 60 * 1000).toISOString();

describe("shouldRetryJob", () => {
  it("retries immediately when the last attempt already finished, no matter how recently (the 2026-09-01 regression)", () => {
    // This is the exact case that left a real customer's submission
    // (epskinner20@gmail.com, GRR-MTITR367) stuck for 30+ minutes: the
    // attempt failed and reported its outcome within seconds, but the old
    // logic only looked at elapsed time and treated it as "maybe still
    // running" for the full stale window regardless.
    const job = { attemptInProgress: false, lastAttemptAt: minutesAgo(0.01) };
    expect(shouldRetryJob(job, NOW)).toBe(true);
  });

  it("does not retry a job whose attempt is genuinely still running and recent", () => {
    const job = { attemptInProgress: true, lastAttemptAt: minutesAgo(1) };
    expect(shouldRetryJob(job, NOW)).toBe(false);
  });

  it("falls back to retrying an in-progress job once it's older than the stale threshold (hard-kill safety net)", () => {
    const staleMinutes = STALE_THRESHOLD_MS / 60_000 + 1;
    const job = { attemptInProgress: true, lastAttemptAt: minutesAgo(staleMinutes) };
    expect(shouldRetryJob(job, NOW)).toBe(true);
  });

  it("does not retry an in-progress job that is just under the stale threshold", () => {
    const almostStaleMinutes = STALE_THRESHOLD_MS / 60_000 - 1;
    const job = { attemptInProgress: true, lastAttemptAt: minutesAgo(almostStaleMinutes) };
    expect(shouldRetryJob(job, NOW)).toBe(false);
  });

  it("retries a long-idle job that was never marked in-progress at all", () => {
    const job = { attemptInProgress: false, lastAttemptAt: minutesAgo(120) };
    expect(shouldRetryJob(job, NOW)).toBe(true);
  });
});
