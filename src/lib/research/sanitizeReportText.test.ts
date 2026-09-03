import { describe, it, expect } from "vitest";
import { sanitizeReportText, looksLikeToolMechanicsText } from "./sanitizeReportText";

describe("sanitizeReportText — defense-in-depth filter for tool-mechanics text", () => {
  it("passes through ordinary buyer-facing text unchanged", () => {
    const text = "Comps found within a 1-mile radius ranged $2,100-$2,450/mo, supporting the buyer's $2,300 estimate.";
    expect(sanitizeReportText(text, "fallback", "test")).toBe(text);
  });

  it("catches the exact real-incident phrasing (GRR-MTJ2RJ26 / GRR-MTKATP8P / GRR-MTKIHYO2)", () => {
    const text = "the web_search tool budget for this session was exhausted... blocked with a tool-use-limit error...";
    const result = sanitizeReportText(text, "fallback sentence", "test");
    expect(result).toBe("fallback sentence");
  });

  it("catches 'tool-use limit' phrasing", () => {
    expect(looksLikeToolMechanicsText("I hit a tool-use limit while searching.")).toBe(true);
  });

  it("catches 'tool budget' phrasing", () => {
    expect(looksLikeToolMechanicsText("Ran out of tool budget before finding a rate.")).toBe(true);
  });

  it("catches web_search tool mentions", () => {
    expect(looksLikeToolMechanicsText("The web_search tool returned no results.")).toBe(true);
  });

  it("catches session-exhausted phrasing", () => {
    expect(looksLikeToolMechanicsText("This session was exhausted before a value could be found.")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(looksLikeToolMechanicsText("TOOL-USE-LIMIT reached")).toBe(true);
  });

  it("catches 'tool usage limit' phrasing (variant that slipped past the original pattern list, 2026-09-03)", () => {
    expect(looksLikeToolMechanicsText("A web-search capacity limit was hit before comps could be gathered.")).toBe(true);
  });

  it("catches 'did not return usable results this session' phrasing", () => {
    expect(looksLikeToolMechanicsText("The rent-comparable search did not return usable results this session.")).toBe(true);
  });

  it("returns the fallback for empty or whitespace-only text", () => {
    expect(sanitizeReportText("", "fallback", "test")).toBe("fallback");
    expect(sanitizeReportText("   ", "fallback", "test")).toBe("fallback");
    expect(sanitizeReportText(null, "fallback", "test")).toBe("fallback");
    expect(sanitizeReportText(undefined, "fallback", "test")).toBe("fallback");
  });
});
