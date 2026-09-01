import { NextResponse } from "next/server";

// TEMPORARY — verifying whether this Vercel account's runtime actually
// honors maxDuration past the 800s generally-available ceiling, or silently
// caps it there regardless of what's configured. Delete after the test.
export const maxDuration = 1800;

export async function GET() {
  const start = Date.now();
  // 14 minutes — past the 800s GA ceiling, comfortably under the 1800s
  // extended-beta ceiling, so a plain 200 here (vs. a connection drop /
  // 504 around 800s) is a real answer either way.
  await new Promise((resolve) => setTimeout(resolve, 840_000));
  return NextResponse.json({ completed: true, elapsedMs: Date.now() - start });
}
