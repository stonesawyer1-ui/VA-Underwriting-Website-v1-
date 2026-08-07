import { NextRequest, NextResponse } from "next/server";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: NextRequest) {
  let body: { name?: string; email?: string; message?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!isNonEmptyString(body.name) || !isNonEmptyString(body.message)) {
    return NextResponse.json(
      { error: "Name and message are required." },
      { status: 400 },
    );
  }

  if (!isNonEmptyString(body.email) || !isValidEmail(body.email)) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }

  console.log("[contact] New message", {
    receivedAt: new Date().toISOString(),
    ...body,
  });

  return NextResponse.json({ success: true }, { status: 200 });
}
