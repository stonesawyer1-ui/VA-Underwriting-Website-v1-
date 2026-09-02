import { describe, it, expect } from "vitest";
import { shouldRetryJob, isBackoffElapsed, STALE_THRESHOLD_MS } from "./retryPolicy";
import { exponentialBackoffMs, INFRA_BACKOFF_BASE_MS, INFRA_BACKOFF_CAP_MS, CONFIDENCE_BACKOFF_BASE_MS } from "./config";

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

describe("exponentialBackoffMs", () => {
  it("returns the base delay for the first retry (roundNumber 1)", () => {
    expect(exponentialBackoffMs(1, INFRA_BACKOFF_BASE_MS, INFRA_BACKOFF_CAP_MS)).toBe(INFRA_BACKOFF_BASE_MS);
  });

  it("doubles per round", () => {
    expect(exponentialBackoffMs(2, INFRA_BACKOFF_BASE_MS, INFRA_BACKOFF_CAP_MS)).toBe(INFRA_BACKOFF_BASE_MS * 2);
    expect(exponentialBackoffMs(3, INFRA_BACKOFF_BASE_MS, INFRA_BACKOFF_CAP_MS)).toBe(INFRA_BACKOFF_BASE_MS * 4);
  });

  it("never exceeds the cap", () => {
    expect(exponentialBackoffMs(50, INFRA_BACKOFF_BASE_MS, INFRA_BACKOFF_CAP_MS)).toBe(INFRA_BACKOFF_CAP_MS);
  });
});

describe("isBackoffElapsed", () => {
  it("is always elapsed when no retry is pending", () => {
    const job = { lastAttemptAt: minutesAgo(0), pendingRetryKind: null, attempts: 1, confidenceRounds: 0 };
    expect(isBackoffElapsed(job, NOW)).toBe(true);
  });

  it("blocks an infra retry until its backoff window passes", () => {
    const job = { lastAttemptAt: minutesAgo(0.1), pendingRetryKind: "infra" as const, attempts: 1, confidenceRounds: 0 };
    expect(isBackoffElapsed(job, NOW)).toBe(false);
  });

  it("allows an infra retry once its backoff window has passed", () => {
    const job = {
      lastAttemptAt: minutesAgo(INFRA_BACKOFF_BASE_MS / 60_000 + 0.1),
      pendingRetryKind: "infra" as const,
      attempts: 1,
      confidenceRounds: 0,
    };
    expect(isBackoffElapsed(job, NOW)).toBe(true);
  });

  it("spaces confidence retries independently of the infra backoff curve", () => {
    const job = {
      lastAttemptAt: minutesAgo(CONFIDENCE_BACKOFF_BASE_MS / 60_000 + 0.1),
      pendingRetryKind: "confidence" as const,
      attempts: 1,
      confidenceRounds: 1,
    };
    expect(isBackoffElapsed(job, NOW)).toBe(true);
  });
});
