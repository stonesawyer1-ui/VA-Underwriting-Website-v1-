import { NextRequest, NextResponse } from "next/server";
import { getJob, saveJob } from "@/lib/jobStore";
import { runJobAttempt } from "@/lib/pipeline/processSubmission";

/**
 * Permanent admin tool: force an immediate retry on one specific stuck
 * submission, using its real stored data straight from Redis — instead of
 * hand-transcribing a customer's data out of Vercel logs into a throwaway
 * route each time (what every recovery on 2026-09-01 required: slow, and a
 * real risk of a transcription error silently producing a wrong report).
 *
 * Deliberately scoped to jobs still in "processing" only. A "completed" or
 * "held_for_review" job is terminal — replaying it could charge the
 * customer's allowance a second time (chargeAllowanceForJob has no
 * idempotency guard against being called twice for the same job). A
 * genuinely-needed redo of a terminal job stays a deliberate, case-by-case
 * action, not something this generic tool does for you.
 *
 * Only reaches jobs created after the async job store went live
 * (2026-09-01) — a submission from before that never had a Redis record at
 * all, so there's nothing here to replay for it.
 */
export const maxDuration = 1800;

export async function POST(request: NextRequest) {
  const configuredSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!configuredSecret || authHeader !== `Bearer ${configuredSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: { referenceId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body — expected { referenceId }." }, { status: 400 });
  }

  const referenceId = body.referenceId;
  if (!referenceId) {
    return NextResponse.json({ error: "referenceId is required." }, { status: 400 });
  }

  const job = await getJob(referenceId);
  if (!job) {
    return NextResponse.json(
      {
        error:
          "No stored job found for this referenceId. This tool only works for submissions made after the async job store went live (2026-09-01) — an older one needs manual reconstruction from Vercel logs instead.",
      },
      { status: 404 },
    );
  }

  if (job.status !== "processing") {
    return NextResponse.json(
      {
        error: `Refusing to replay a job with status "${job.status}" — it's already terminal, and re-running it risks charging the customer's allowance a second time. A genuine manual redo of a terminal job is a deliberate, case-by-case action, not this tool.`,
        status: job.status,
      },
      { status: 409 },
    );
  }

  const attemptsBefore = job.attempts;
  // Mirrors process-pending's own accounting: a pending confidence-retry
  // (Path A) doesn't consume the infra-fault attempts budget (Path B), and
  // vice versa — see runJobAttempt/processSubmission.ts.
  const isConfidenceRetry = job.pendingRetryKind === "confidence";
  const updated = {
    ...job,
    attempts: isConfidenceRetry ? job.attempts : job.attempts + 1,
    lastAttemptAt: new Date().toISOString(),
    attemptInProgress: true,
  };
  await saveJob(updated);
  await runJobAttempt(updated);
  const after = await getJob(referenceId);

  return NextResponse.json({
    referenceId,
    attemptsBefore,
    attemptsAfter: after?.attempts ?? updated.attempts,
    statusAfter: after?.status ?? "unknown",
  });
}
