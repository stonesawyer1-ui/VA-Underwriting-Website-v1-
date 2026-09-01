import { NextRequest, NextResponse } from "next/server";
import { getJob, listPendingJobIds, saveJob, removePendingJob, isJobStoreConfigured, type ProcessingJob } from "@/lib/jobStore";
import { runJobAttempt } from "@/lib/pipeline/processSubmission";
import { shouldRetryJob } from "@/lib/pipeline/retryPolicy";

// Matches the intake route's maxDuration (see its comment) so a background
// retry gets the same full time budget as the initial attempt.
export const maxDuration = 600;

/**
 * Called every 2 minutes by Vercel Cron (see vercel.json) — tightened from
 * 5 minutes on 2026-09-01 (stonesawyer1@gmail.com, GRR-MTJ0ZS2V) alongside
 * shrinking each research call's own hard deadline from 25min to 3min: the
 * old 5-minute cadence meant a customer whose first attempt failed still
 * waited up to 5 real minutes just for the *next* sweep to notice, on top
 * of however long that failed attempt itself took. At 2 minutes, five
 * attempts (see MAX_ATTEMPTS in processSubmission.ts) comfortably resolve
 * — success or honest hold-for-review — well inside a 25-minute target
 * even in the worst case where every attempt fails.
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

      if (!shouldRetryJob(job, now)) {
        // The last recorded attempt hasn't reported finishing yet, and it's
        // not old enough to assume it was silently killed — leave it for a
        // later sweep rather than risk running it twice at once.
        return;
      }

      retried++;
      const updated: ProcessingJob = {
        ...job,
        attempts: job.attempts + 1,
        lastAttemptAt: new Date().toISOString(),
        attemptInProgress: true,
      };
      await saveJob(updated);
      await runJobAttempt(updated);
    }),
  );

  return NextResponse.json({ success: true, checked, retried });
}
