import { Redis } from "@upstash/redis";
import type { UnderwritingFormData } from "@/lib/underwriting/types";
import type { EntitlementPayload } from "@/lib/entitlementToken";

export type JobStatus = "processing" | "completed" | "held_for_review";

/**
 * Why a job ended up held_for_review — answerable from data instead of log
 * archaeology. null for a job that isn't (or isn't yet) held.
 *
 * - "confidence_exhausted": Path A. Research genuinely ran (successfully)
 *   and the confidence gate never cleared the 90% bar even after
 *   MAX_CONFIDENCE_ROUNDS of broadened research effort. A real
 *   data-quality finding — the customer's allowance was charged normally.
 * - "infra_fault_exhausted": Path B. The research service itself kept
 *   erroring/timing out/being unconfigured across MAX_INFRA_ATTEMPTS
 *   attempts. Never a reflection of this property's actual data, and never
 *   charged — this is the pipeline giving up on an infrastructure problem,
 *   not a judgment about the report.
 */
export type HoldReason = "confidence_exhausted" | "infra_fault_exhausted" | null;

/**
 * Which retry counter/backoff a currently-"processing" job is waiting on,
 * for the sweep and admin/replay to space the next attempt correctly (see
 * retryPolicy.ts's isBackoffElapsed). null when no retry is pending (a job
 * on its first attempt, or a terminal job).
 */
export type PendingRetryKind = "infra" | "confidence" | null;

export type ProcessingJob = {
  referenceId: string;
  status: JobStatus;
  formData: UnderwritingFormData;
  /** Snapshot of the entitlement at submission time — the source of truth for allowance-charging, independent of any client-held token. */
  entitlement: EntitlementPayload;
  attempts: number;
  createdAt: string;
  lastAttemptAt: string;
  /**
   * True from the moment an attempt starts until runJobAttempt records its
   * outcome (any outcome — completed, held, or retry-eligible). This is
   * what the sweep actually trusts to decide "is this job still running
   * right now" — set true right before an attempt starts, false right
   * after it ends. The time-based STALE_THRESHOLD_MS in process-pending is
   * only a fallback for the pathological case where a hard kill mid-attempt
   * never got to flip this back to false at all.
   *
   * Missing on any job record written before 2026-09-01 — reads as falsy,
   * which is the correct behavior for an old record (its one and only
   * attempt already finished, one way or another, by definition).
   */
  attemptInProgress: boolean;
  /** Whether the one-time "this is taking longer than usual" email has already gone out — sent once, not on every retry. */
  notifiedProcessingDelay: boolean;
  /**
   * How many confidence-seeking research rounds beyond the initial pass have
   * completed for this job (Path A) — 0 until the first time the gate fails
   * without being exhausted. Distinct from `attempts`, which only
   * increments for Path B infrastructure-fault retries. Missing on any job
   * record written before this feature — reads as 0/undefined, which is the
   * correct starting value.
   */
  confidenceRounds: number;
  /** See HoldReason. null until (and unless) the job is finalized held_for_review. */
  holdReason: HoldReason;
  /** See PendingRetryKind. */
  pendingRetryKind: PendingRetryKind;
};

const PENDING_SET_KEY = "pending_jobs";
function jobKey(referenceId: string): string {
  return `job:${referenceId}`;
}

let client: Redis | null = null;
let warnedMissingConfig = false;

/**
 * Returns null (never throws) when UPSTASH_REDIS_REST_URL/TOKEN aren't set.
 * Every function in this module degrades to a no-op in that case, so the
 * site keeps working exactly as it did before this feature existed — the
 * job store is an enhancement (auto-recovery for slow submissions), never a
 * dependency the live site can be broken by if Upstash is misconfigured or
 * down.
 */
function getClient(): Redis | null {
  if (client) return client;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (!warnedMissingConfig) {
      console.warn("[jobStore] UPSTASH_REDIS_REST_URL/TOKEN not set — background retry is disabled; submissions fall back to single-attempt behavior.");
      warnedMissingConfig = true;
    }
    return null;
  }
  client = new Redis({ url, token });
  return client;
}

export function isJobStoreConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

export async function createJob(job: ProcessingJob): Promise<void> {
  const c = getClient();
  if (!c) return;
  try {
    await c.set(jobKey(job.referenceId), job);
    await c.sadd(PENDING_SET_KEY, job.referenceId);
  } catch (err) {
    console.error("[jobStore] createJob failed", err);
  }
}

export async function getJob(referenceId: string): Promise<ProcessingJob | null> {
  const c = getClient();
  if (!c) return null;
  try {
    return (await c.get<ProcessingJob>(jobKey(referenceId))) ?? null;
  } catch (err) {
    console.error("[jobStore] getJob failed", err);
    return null;
  }
}

export async function saveJob(job: ProcessingJob): Promise<void> {
  const c = getClient();
  if (!c) return;
  try {
    await c.set(jobKey(job.referenceId), job);
  } catch (err) {
    console.error("[jobStore] saveJob failed", err);
  }
}

export async function removePendingJob(referenceId: string): Promise<void> {
  const c = getClient();
  if (!c) return;
  try {
    await c.srem(PENDING_SET_KEY, referenceId);
  } catch (err) {
    console.error("[jobStore] removePendingJob failed", err);
  }
}

export async function listPendingJobIds(): Promise<string[]> {
  const c = getClient();
  if (!c) return [];
  try {
    const ids = await c.smembers(PENDING_SET_KEY);
    return (ids ?? []) as string[];
  } catch (err) {
    console.error("[jobStore] listPendingJobIds failed", err);
    return [];
  }
}
