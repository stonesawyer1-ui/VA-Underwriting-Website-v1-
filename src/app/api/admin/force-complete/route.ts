import { NextRequest, NextResponse } from "next/server";
import { forceCompleteHeldJob } from "@/lib/pipeline/processSubmission";

/**
 * Permanent admin tool, paired with /api/admin/replay: that route only
 * touches a job still "processing"; this one is the deliberate, case-by-case
 * exception for a job that already finalized "held_for_review" — see
 * forceCompleteHeldJob's own comment for exactly which holds it will (and
 * will refuse to) override.
 */
export const maxDuration = 600;

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

  const result = await forceCompleteHeldJob(referenceId);
  if (result.status === "refused") {
    return NextResponse.json({ referenceId, ...result }, { status: 409 });
  }
  return NextResponse.json({ referenceId, ...result });
}
