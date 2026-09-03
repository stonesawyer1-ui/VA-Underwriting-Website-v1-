import { describe, it, expect } from "vitest";
import { computeRentSearchRadiusMiles } from "./researchRentEstimate";

describe("computeRentSearchRadiusMiles", () => {
  it("starts at 10 miles for the initial (round 0) pass", () => {
    expect(computeRentSearchRadiusMiles(0)).toBe(10);
  });

  it("widens by 7 miles per refinement round", () => {
    expect(computeRentSearchRadiusMiles(1)).toBe(17);
    expect(computeRentSearchRadiusMiles(2)).toBe(24);
  });

  it("caps at 30 miles", () => {
    expect(computeRentSearchRadiusMiles(5)).toBe(30);
  });
});
