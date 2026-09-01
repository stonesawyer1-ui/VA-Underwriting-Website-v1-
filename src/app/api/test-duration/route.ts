import { NextResponse, after } from "next/server";

// TEMPORARY — verifying whether after() background work actually gets to
// run past the 800s GA ceiling, up to the 1800s extended-beta ceiling.
// Responds immediately (like the real intake route) instead of holding a
// client connection open — a held-open connection hits unrelated
// intermediate-network idle timeouts that have nothing to do with Vercel's
// actual function execution ceiling (confirmed 2026-09-01: a plain long-poll
// curl died at ~5m41s to a TLS/connection-level error, not a Vercel kill).
// Check Vercel runtime logs for both "[test-duration] started" and
// "[test-duration] completed" — only the first line appearing means the
// invocation was killed before finishing. Delete this route after the test.
export const maxDuration = 1800;

export async function GET() {
  const startedAt = new Date().toISOString();
  after(async () => {
    console.log("[test-duration] started", { startedAt });
    await new Promise((resolve) => setTimeout(resolve, 840_000));
    console.log("[test-duration] completed", { startedAt, completedAt: new Date().toISOString(), elapsedMs: 840_000 });
  });
  return NextResponse.json({ accepted: true, startedAt });
}
