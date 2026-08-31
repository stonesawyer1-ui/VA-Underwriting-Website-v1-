import { NextRequest, NextResponse, after } from "next/server";
import { sendUnderwritingInquiryEmail } from "@/lib/email";
import type { ResultsSummary } from "@/lib/underwriting/calculations";
import type { UnderwritingFormData } from "@/lib/underwriting/types";
import { signEntitlement, verifyEntitlement } from "@/lib/entitlementToken";
import { createJob, isJobStoreConfigured, type ProcessingJob } from "@/lib/jobStore";
import { runJobAttempt } from "@/lib/pipeline/processSubmission";

// The research -> compute -> PDF/Excel -> delivery pipeline (see
// processSubmission.ts) is genuinely slow, and Vercel force-kills any
// serverless function once its maxDuration elapses, no exceptions. As of
// 2026-08-31 this route no longer makes the customer's browser wait for
// that pipeline at all: it responds as soon as the submission is validated
// and recorded, and runs the actual work via Next's after() — which keeps
// the invocation alive past the response, still bounded by this same
// maxDuration. If a submission is slow enough to hit that wall anyway, it
// was already persisted as "processing" before any slow work started, so
// the Vercel Cron sweep (/api/process-pending, see vercel.json) picks it up
// and keeps retrying — no submission is silently lost, and none is ever
// double-charged, regardless of how long research takes.
//
// 800s is the generally-available ceiling on Pro + Fluid Compute (up from
// Hobby's hard 300s). Vercel does offer an "extended max duration" beta up
// to 1800s, but that's a separate opt-in the account isn't enrolled in — 800s
// is the real budget available today. Most submissions still finish in well
// under a minute of this; the rare slow one now gets a lot more room before
// it even needs a background retry at all.
export const maxDuration = 800;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const customer = body.customer as { email?: unknown } | undefined;
  const property = body.property as { address?: unknown; state?: unknown; purchasePrice?: unknown } | undefined;
  const financing = body.financing as { interestRate?: unknown } | undefined;
  const occupancy = body.occupancy as { moveInDate?: unknown } | undefined;

  if (!customer || !isNonEmptyString(customer.email) || !isValidEmail(customer.email)) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }

  if (
    !property ||
    !isNonEmptyString(property.address) ||
    !isNonEmptyString(property.state) ||
    typeof property.purchasePrice !== "number" ||
    property.purchasePrice <= 0
  ) {
    return NextResponse.json({ error: "Property address, state, and purchase price are required." }, { status: 400 });
  }

  if (!financing || typeof financing.interestRate !== "number" || financing.interestRate <= 0) {
    return NextResponse.json({ error: "Interest rate is required." }, { status: 400 });
  }

  if (!occupancy || !isNonEmptyString(occupancy.moveInDate)) {
    return NextResponse.json({ error: "Move-in date is required." }, { status: 400 });
  }

  const rawToken = body.entitlementToken;
  if (!isNonEmptyString(rawToken)) {
    return NextResponse.json({ error: "Missing payment confirmation. Choose a plan from /pricing first." }, { status: 402 });
  }
  const entitlement = verifyEntitlement(rawToken);
  if (!entitlement) {
    return NextResponse.json({ error: "We couldn't verify your payment for this submission." }, { status: 402 });
  }
  if (entitlement.used >= entitlement.allowance) {
    return NextResponse.json(
      { error: `You've already used all ${entitlement.allowance} property reviews on this plan.` },
      { status: 402 },
    );
  }

  const referenceId = `GRR-${Date.now().toString(36).toUpperCase()}`;

  console.log("[underwriting-intake] New submission", {
    referenceId,
    receivedAt: new Date().toISOString(),
    ...body,
  });

  const { results, ...formData } = body as { results: ResultsSummary; entitlementToken: string } & UnderwritingFormData;

  try {
    await sendUnderwritingInquiryEmail(formData, results, referenceId);
  } catch (err) {
    console.error("[underwriting-intake] Failed to send notification email", err);
  }

  const now = new Date().toISOString();
  const job: ProcessingJob = {
    referenceId,
    status: "processing",
    formData,
    entitlement,
    attempts: 1,
    createdAt: now,
    lastAttemptAt: now,
    notifiedProcessingDelay: false,
  };

  // Persisted BEFORE any slow work starts — this is the durability guarantee.
  // If this invocation gets killed mid-pipeline, the job already exists in
  // Redis with status "processing" and the sweep will find and retry it.
  // A no-op if Upstash isn't configured (see jobStore.ts) — the pipeline
  // still runs below via after(), just without retry/recovery if it fails.
  if (isJobStoreConfigured()) {
    await createJob(job);
  }

  // Runs after the response below is sent, but within the same invocation —
  // the customer's browser is never blocked on research/PDF generation, no
  // matter how long it takes (up to this route's own 300s ceiling).
  after(async () => {
    await runJobAttempt(job);
  });

  // The allowance shown here reflects the token as verified above (not yet
  // charged) — that's fine: /get-started re-reads the authoritative "used"
  // count fresh from the Stripe Checkout Session's own metadata rather than
  // trusting this client-held token, so this value is a convenience, not the
  // source of truth for allowance enforcement.
  return NextResponse.json({ success: true, referenceId, nextToken: signEntitlement(entitlement) }, { status: 200 });
}
