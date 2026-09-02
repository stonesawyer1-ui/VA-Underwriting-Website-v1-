import { NextRequest, NextResponse } from "next/server";
import { getJob, listPendingJobIds, saveJob, removePendingJob, isJobStoreConfigured, type ProcessingJob } from "@/lib/jobStore";
import { runJobAttempt } from "@/lib/pipeline/processSubmission";
import { shouldRetryJob, isBackoffElapsed } from "@/lib/pipeline/retryPolicy";
import { PAST_HOUR_ALERT_THRESHOLD_MS } from "@/lib/pipeline/config";
import { sendPastHourAlertEmail } from "@/lib/email";

// Matches the intake route's maxDuration (see its comment) so a background
// retry gets the same full time budget as the initial attempt. Must stay
// equal to ROUTE_MAX_DURATION_SECONDS in pipeline/config.ts — see that
// file's comment for why it can't be imported directly here.
export const maxDuration = 600;

/**
 * Called every 1 minute by Vercel Cron (see vercel.json — CRON_SWEEP_INTERVAL_MS
 * in pipeline/config.ts documents that same cadence for the retry-timing
 * math). Every tick, checks each pending job for two independent gates
 * before touching it:
 *   1. shouldRetryJob — is the previous attempt actually finished (not just
 *      old enough to guess it might be)?
 *   2. isBackoffElapsed — has this job's exponential backoff window (Path A
 *      confidence rounds and Path B infra-fault attempts use separate,
 *      independently-configured backoff curves — see retryPolicy.ts and
 *      config.ts) elapsed since its last attempt?
 * Only a job that clears both gets retried this tick — this is what
 * replaced the old fixed "retry on literally the very next tick" behavior,
 * so a sustained outage doesn't get hammered at a flat 1-minute cadence
 * with no back-pressure. See MAX_INFRA_ATTEMPTS / MAX_CONFIDENCE_ROUNDS in
 * config.ts for how long each path's retry budget actually runs in real
 * time.
 *
 * Independently of those two gates, every tick also checks each pending
 * job's total age against PAST_HOUR_ALERT_THRESHOLD_MS (config.ts) and
 * sends the owner a one-time alert email if a job has been "processing"
 * for over an hour without resolving — see sendPastHourAlertEmail. This is
 * deliberately unconditional (checked even on a tick that's about to skip
 * the job for either retry gate above) since a job can legitimately still
 * be mid-attempt or mid-backoff past that mark, and the point is to catch
 * it while still in flight, not only once it finally resolves.
 *
 * Vercel Cron invokes its path with a GET request — a POST-only handler
 * here 405s on every single tick (caught 2026-08-31 in runtime logs). GET
 * is the real entry point; POST is kept too so a manual curl-triggered
 * retry during testing can use either verb. Vercel automatically sends
 * `Authorization: Bearer <value>` using the project's own CRON_SECRET env
 * var for its own scheduled invocations — the same value verified below.
 */
export async function GET(request: NextRequest) {
  return handleSweep(request);
}

export async function POST(request: NextRequest) {
  return handleSweep(request);
}

async function handleSweep(request: NextRequest) {
  const configuredSecret = process.env.CRON_SECRET;
  if (!configuredSecret) {
    console.error("[process-pending] CRON_SECRET is not set — refusing to run an unauthenticated sweep.");
    return NextResponse.json({ error: "Not configured." }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${configuredSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!isJobStoreConfigured()) {
    return NextResponse.json({ success: true, checked: 0, retried: 0, note: "Job store not configured — nothing to sweep." });
  }

  const pendingIds = await listPendingJobIds();
  let checked = 0;
  let retried = 0;
  const now = Date.now();

  await Promise.allSettled(
    pendingIds.map(async (referenceId) => {
      checked++;
      const job = await getJob(referenceId);
      if (!job || job.status !== "processing") {
        // Stale set membership (e.g. already finalized elsewhere) — clean it up.
        await removePendingJob(referenceId);
        return;
      }

      // Checked unconditionally, before either retry gate below — a job
      // can legitimately still be mid-attempt or mid-backoff past the
      // one-hour mark (that's the whole point of the confidence-seeking /
      // infra-backoff redesign), and the owner wants to know it's running
      // long WHILE it's still in flight, not only once it finally resolves.
      // Fires once per job (see pastHourAlertSent on ProcessingJob).
      if (!job.pastHourAlertSent) {
        const ageMs = now - new Date(job.createdAt).getTime();
        if (ageMs > PAST_HOUR_ALERT_THRESHOLD_MS) {
          job.pastHourAlertSent = true;
          await saveJob(job);
          try {
            await sendPastHourAlertEmail({
              referenceId: job.referenceId,
              customerEmail: job.formData.customer.email,
              propertyAddress: job.formData.property.address,
              elapsedMinutes: Math.round(ageMs / 60_000),
              attempts: job.attempts,
              confidenceRounds: job.confidenceRounds ?? 0,
              pendingRetryKind: job.pendingRetryKind,
            });
          } catch (err) {
            console.error("[process-pending] Failed to send past-hour alert email", err);
          }
        }
      }

      if (!shouldRetryJob(job, now)) {
        // The last recorded attempt hasn't reported finishing yet, and it's
        // not old enough to assume it was silently killed — leave it for a
        // later sweep rather than risk running it twice at once.
        return;
      }

      if (!isBackoffElapsed(job, now)) {
        // The job finished its last attempt but hasn't waited out its
        // exponential backoff window yet (see retryPolicy.ts) — leave it for
        // a later tick instead of hammering the same failure every minute.
        return;
      }

      retried++;
      // Path A (confidence) retries don't consume the Path B attempts
      // budget, and vice versa — only the counter matching this job's
      // pendingRetryKind actually increments here.
      const isConfidenceRetry = job.pendingRetryKind === "confidence";
      const updated: ProcessingJob = {
        ...job,
        attempts: isConfidenceRetry ? job.attempts : job.attempts + 1,
        lastAttemptAt: new Date().toISOString(),
        attemptInProgress: true,
      };
      await saveJob(updated);
      await runJobAttempt(updated);
    }),
  );

  return NextResponse.json({ success: true, checked, retried });
}
