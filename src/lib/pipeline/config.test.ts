import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROUTE_MAX_DURATION_SECONDS, exponentialBackoffMs } from "./config";

/**
 * Next.js's route-segment-config requires `export const maxDuration` to be a
 * statically-analyzable literal number, not an imported variable — so the
 * two route files can't source it directly from config.ts (see config.ts's
 * file-level comment). This test is the substitute single-source-of-truth
 * enforcement: it reads each route file's literal straight out of its
 * source and asserts it matches ROUTE_MAX_DURATION_SECONDS, so a change to
 * one without the other fails CI instead of silently reappearing (exactly
 * the failure mode that caused the 2026-09-01 regressions this whole
 * config module exists to prevent).
 */
describe("ROUTE_MAX_DURATION_SECONDS stays in sync with route-segment-config literals", () => {
  const routeFiles = [
    "src/app/api/underwriting-intake/route.ts",
    "src/app/api/process-pending/route.ts",
  ];

  for (const relativePath of routeFiles) {
    it(`${relativePath} declares maxDuration = ${ROUTE_MAX_DURATION_SECONDS}`, () => {
      const source = readFileSync(join(process.cwd(), relativePath), "utf-8");
      const match = source.match(/export const maxDuration = (\d+);/);
      expect(match, `expected to find "export const maxDuration = <number>;" in ${relativePath}`).not.toBeNull();
      expect(Number(match![1])).toBe(ROUTE_MAX_DURATION_SECONDS);
    });
  }
});

describe("exponentialBackoffMs", () => {
  it("is monotonically non-decreasing as roundNumber increases", () => {
    let prev = 0;
    for (let round = 1; round <= 20; round++) {
      const delay = exponentialBackoffMs(round, 1000, 60_000);
      expect(delay).toBeGreaterThanOrEqual(prev);
      prev = delay;
    }
  });

  it("never returns a negative or zero delay for round 1+", () => {
    expect(exponentialBackoffMs(1, 1000, 60_000)).toBeGreaterThan(0);
  });
});
