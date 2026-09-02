import { NextRequest, NextResponse } from "next/server";
import { regenerateReportFiles } from "@/lib/pipeline/processSubmission";

/**
 * Owner-only debug tool: returns the three report files (PDF, detail PDF,
 * workbook) for any stored job as base64, without emailing the customer or
 * touching job status — see regenerateReportFiles's own comment.
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

  const result = await regenerateReportFiles(referenceId);
  if (result.status === "not_found") {
    return NextResponse.json({ referenceId, error: "No stored job found for this referenceId." }, { status: 404 });
  }

  return NextResponse.json({
    referenceId,
    reportPdf: result.files.reportPdf.toString("base64"),
    underwritingPdf: result.files.underwritingPdf.toString("base64"),
    workbookXlsx: result.files.workbookXlsx.toString("base64"),
  });
}
