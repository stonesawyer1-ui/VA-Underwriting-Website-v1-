import { describe, it, expect, vi, beforeEach } from "vitest";

// The Resend SDK does NOT throw on an API-level rejection (bad recipient,
// sandbox-domain restriction, bounced address, etc.) — it resolves
// normally with { data: null, error: {...} }. This mock lets each test
// control exactly what a `.emails.send()` call resolves with, the same way
// the real SDK would for a rejected vs. accepted send.
const sendMock = vi.fn();
vi.mock("resend", () => {
  class MockResend {
    emails = { send: sendMock };
  }
  return { Resend: MockResend };
});

describe("email sending surfaces Resend rejections instead of swallowing them", () => {
  beforeEach(() => {
    vi.resetModules();
    sendMock.mockReset();
    process.env.RESEND_API_KEY = "test-key";
  });

  it("throws when Resend reports an error — the exact bug that silently lost a real customer's report (2026-09-01, epskinner20@gmail.com)", async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { name: "validation_error", message: "You can only send testing emails to your own email address." },
    });
    const { sendContactMessageEmail } = await import("./email");

    await expect(
      sendContactMessageEmail({ name: "Test User", email: "test@example.com", message: "hello" }),
    ).rejects.toThrow(/validation_error/);
  });

  it("does not throw when Resend accepts the send", async () => {
    sendMock.mockResolvedValue({ data: { id: "email_123" }, error: null });
    const { sendContactMessageEmail } = await import("./email");

    await expect(
      sendContactMessageEmail({ name: "Test User", email: "test@example.com", message: "hello" }),
    ).resolves.toBeUndefined();
  });
});
