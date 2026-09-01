import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveFromAddress } from "./email";

describe("resolveFromAddress", () => {
  const original = process.env.EMAIL_FROM_ADDRESS;

  afterEach(() => {
    if (original === undefined) delete process.env.EMAIL_FROM_ADDRESS;
    else process.env.EMAIL_FROM_ADDRESS = original;
  });

  it("defaults to the verified domain, not Resend's sandbox address, when unset", () => {
    // 2026-09-01 discovery: EMAIL_FROM_ADDRESS was never set in production
    // at all, so every real customer email had been silently falling back
    // to Resend's sandbox domain, which can only deliver to the account
    // owner. Every future submission depends on this default being the
    // real domain, not the sandbox one.
    delete process.env.EMAIL_FROM_ADDRESS;
    expect(resolveFromAddress()).toBe("Garrison Risk Review <review@garrisonriskreview.com>");
  });

  it("forces the business display name even when the env var carries a personal name (the 2026-09-01 regression)", () => {
    process.env.EMAIL_FROM_ADDRESS = "Stone Sawyer <review@garrisonriskreview.com>";
    expect(resolveFromAddress()).toBe("Garrison Risk Review <review@garrisonriskreview.com>");
  });

  it("wraps a bare email address with the business display name", () => {
    process.env.EMAIL_FROM_ADDRESS = "someone@garrisonriskreview.com";
    expect(resolveFromAddress()).toBe("Garrison Risk Review <someone@garrisonriskreview.com>");
  });

  it("preserves whatever email address is actually configured, only overriding the display name", () => {
    process.env.EMAIL_FROM_ADDRESS = "Anyone <billing@garrisonriskreview.com>";
    expect(resolveFromAddress()).toBe("Garrison Risk Review <billing@garrisonriskreview.com>");
  });
});
