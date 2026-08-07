import { NextRequest, NextResponse } from "next/server";
import { isValidTier, type IntakePayload } from "@/lib/intake";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: NextRequest) {
  let body: Partial<IntakePayload>;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const requiredFields: (keyof IntakePayload)[] = [
    "fullName",
    "email",
    "phone",
    "propertyAddress",
    "tier",
  ];

  const missing = requiredFields.filter((field) => !isNonEmptyString(body[field]));
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Missing required field(s): ${missing.join(", ")}` },
      { status: 400 },
    );
  }

  if (!isValidEmail(body.email!)) {
    return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
  }

  if (!isValidTier(body.tier)) {
    return NextResponse.json({ error: "Invalid pricing tier." }, { status: 400 });
  }

  const referenceId = `GRR-${Date.now().toString(36).toUpperCase()}`;

  // Extension point: persist the lead (CRM/DB), send confirmation email,
  // and create a Stripe Checkout session for the selected tier once
  // payments are wired up. For now, the lead is logged server-side.
  console.log("[intake] New submission", {
    referenceId,
    receivedAt: new Date().toISOString(),
    ...body,
  });

  return NextResponse.json({ success: true, referenceId }, { status: 200 });
}
