import { NextRequest, NextResponse } from "next/server";
import { getJob, listPendingJobIds, saveJob, removePendingJob, isJobStoreConfigured, type ProcessingJob } from "@/lib/jobStore";
import { runJobAttempt } from "@/lib/pipeline/processSubmission";

// Matches the intake route's maxDuration (see its comment) so a background
// retry gets the same full time budget as the initial attempt.
export const maxDuration = 1800;

// Comfortably longer than this route's own maxDuration (1800s = 30min), so a
// previous attempt that's still genuinely in flight is never picked up again
// by an overlapping sweep run — this app has no distributed locking, so this
// timestamp guard is the whole concurrency story, and it only needs to work
// for single-digit-per-day submission volume.
const STALE_THRESHOLD_MS = 35 * 60 * 1000;

/**
 * Called every 5 minutes by Vercel Cron (see vercel.json). Vercel Cron
 * invokes its path with a GET request — a POST-only handler here 405s on
 * every single tick (caught 2026-08-31 in runtime logs). GET is the real
 * entry point; POST is kept too so a manual curl-triggered retry during
 * testing can use either verb. Vercel automatically sends
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

      const ageMs = now - new Date(job.lastAttemptAt).getTime();
      if (ageMs < STALE_THRESHOLD_MS) {
        // Still plausibly in flight from a previous attempt — leave it for
        // a later sweep rather than risk running it twice at once.
        return;
      }

      retried++;
      const updated: ProcessingJob = { ...job, attempts: job.attempts + 1, lastAttemptAt: new Date().toISOString() };
      await saveJob(updated);
      await runJobAttempt(updated);
    }),
  );

  return NextResponse.json({ success: true, checked, retried });
}
