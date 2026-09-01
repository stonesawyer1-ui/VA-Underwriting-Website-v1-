import { Resend } from "resend";
import { siteConfig } from "@/lib/site";
import type { UnderwritingFormData } from "@/lib/underwriting/types";
import type { ResultsSummary } from "@/lib/underwriting/calculations";
import { formatCurrency, formatPercent } from "@/lib/underwriting/format";

/**
 * Extracts just the raw email address out of EMAIL_FROM_ADDRESS, whichever
 * shape it's set in ("Name <email>" or a bare email), and always wraps it
 * with our own display name. This exists specifically because Resend's
 * domain-verification UI suggests the account holder's own name as the
 * sender display name by default — EMAIL_FROM_ADDRESS had been set that
 * way, so every customer email showed a personal name instead of the
 * business name (caught 2026-09-01). Forcing the display name here means
 * it's correct no matter what the env var literally contains.
 *
 * Defaults to the verified review@garrisonriskreview.com domain, NOT
 * Resend's sandbox address — discovered 2026-09-01 that EMAIL_FROM_ADDRESS
 * was not effectively set in production, so every real customer send had
 * silently been going through the sandbox domain, which 403s on any
 * recipient except the account owner. Internal notifications (always sent
 * to the account owner) looked fine and masked this for every customer
 * send until the Resend-error-checking fix surfaced it.
 *
 * Computed fresh on every call (not cached at module load) so an
 * environment-variable change is always picked up immediately, including
 * within the same warm serverless instance.
 */
function resolveFromAddress(): string {
  const raw = process.env.EMAIL_FROM_ADDRESS || "review@garrisonriskreview.com";
  const angleMatch = raw.match(/<([^>]+)>/);
  const emailOnly = (angleMatch ? angleMatch[1] : raw).trim();
  return `Garrison Risk Review <${emailOnly}>`;
}

function getClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY is not set — skipping email notification.");
    return null;
  }
  return new Resend(apiKey);
}

function row(label: string, value: string): string {
  return `<tr><td style="padding:4px 12px 4px 0;color:#0a1f4499;white-space:nowrap;">${label}</td><td style="padding:4px 0;font-weight:600;color:#0a1f44;">${value}</td></tr>`;
}

/**
 * The Resend SDK does NOT throw on an API-level rejection (bad recipient,
 * sandbox-domain restriction, bounced/suppressed address, etc.) — it
 * resolves normally with `{ data: null, error: {...} }`. Every call site in
 * this file used to just `await client.emails.send(...)` and discard that
 * return value, so a rejected send looked identical to a successful one —
 * no log, no thrown error, nothing. That's exactly what happened to a real
 * customer's report send on 2026-09-01 (epskinner20@gmail.com,
 * GRR-MTITR367): the pipeline logged nothing wrong and marked the job
 * "completed", but the email never actually left Resend. This wrapper is
 * the fix — always inspect `error` and throw if it's set, so a genuinely
 * failed send propagates as a real failure (retry-eligible for the report
 * email, loud in logs for the internal ones) instead of vanishing silently.
 */
async function sendOrThrow(client: Resend, payload: Parameters<Resend["emails"]["send"]>[0]): Promise<void> {
  const { error } = await client.emails.send(payload);
  if (error) {
    throw new Error(`Resend rejected the send: ${error.name} — ${error.message}`);
  }
}

export async function sendUnderwritingInquiryEmail(
  data: UnderwritingFormData,
  results: ResultsSummary,
  referenceId: string,
) {
  const client = getClient();
  if (!client) return;

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
      <h2 style="color:#0a1f44;">New underwriting inquiry — ${referenceId}</h2>
      <table cellpadding="0" cellspacing="0">
        ${row("Name", data.customer.name || "—")}
        ${row("Email", data.customer.email)}
        ${row("Phone", data.customer.phone || "—")}
        ${row("Property", `${data.property.address}, ${data.property.city}, ${data.property.state} ${data.property.zip}`)}
        ${row("Purchase price", formatCurrency(Number(data.property.purchasePrice) || 0))}
        ${row("Interest rate", `${data.financing.interestRate}%`)}
        ${row("Move-in date", data.occupancy.moveInDate)}
        ${row("Package", data.tier)}
        ${row("Monthly PITI", formatCurrency(results.monthlyPITI))}
        ${row("Break-even rent", formatCurrency(results.breakEvenRent))}
        ${row("Cap rate", results.capRatePct === null ? "—" : formatPercent(results.capRatePct))}
        ${row("Verdict", results.verdict.replace(/_/g, " "))}
      </table>
    </div>
  `;

  await sendOrThrow(client, {
    from: resolveFromAddress(),
    to: siteConfig.notifyEmail,
    replyTo: data.customer.email || undefined,
    subject: `New inquiry: ${data.property.address || "Underwriting request"} (${referenceId})`,
    html,
  });
}

export async function sendUnderwritingReportToCustomer(params: {
  customerEmail: string;
  customerName: string;
  referenceId: string;
  reportPdf: Buffer;
  underwritingPdf: Buffer;
  workbookXlsx?: Buffer;
}) {
  const client = getClient();
  if (!client) return;

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
      <h2 style="color:#0a1f44;">Your VA Home Underwriting Report is ready — ${params.referenceId}</h2>
      <p style="color:#222;line-height:1.6;">
        ${params.customerName ? `Hi ${params.customerName},` : "Hi,"}<br/><br/>
        Attached are your independent VA Home Underwriting Report, underwriting detail sheet,
        ${params.workbookXlsx ? "and the filled underwriting workbook (Excel)" : ""}
        for the property you submitted. Reach out if you have questions.
      </p>
      <p style="color:#888;font-size:12px;">Reference: ${params.referenceId}</p>
    </div>
  `;

  const attachments = [
    { filename: `VA-Underwriting-Report-${params.referenceId}.pdf`, content: params.reportPdf },
    { filename: `Underwriting-Detail-${params.referenceId}.pdf`, content: params.underwritingPdf },
  ];
  if (params.workbookXlsx) {
    attachments.push({ filename: `VA-Underwriting-Workbook-${params.referenceId}.xlsx`, content: params.workbookXlsx });
  }

  await sendOrThrow(client, {
    from: resolveFromAddress(),
    to: params.customerEmail,
    replyTo: siteConfig.notifyEmail,
    subject: `Your VA Home Underwriting Report (${params.referenceId})`,
    html,
    attachments,
  });
}

export async function sendHoldForReviewNotice(params: {
  referenceId: string;
  reasons: string[];
  customerEmail: string;
  propertyAddress: string;
}) {
  const client = getClient();
  if (!client) return;

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
      <h2 style="color:#c8102e;">Held for manual review — ${params.referenceId}</h2>
      <p style="color:#222;">
        ${params.propertyAddress} (${params.customerEmail}) was not confident enough to
        auto-send. Confirm the numbers by hand, then deliver the report manually.
      </p>
      <ul style="color:#222;">
        ${params.reasons.map((r) => `<li>${r}</li>`).join("")}
      </ul>
    </div>
  `;

  await sendOrThrow(client, {
    from: resolveFromAddress(),
    to: siteConfig.notifyEmail,
    subject: `Held for review: ${params.propertyAddress} (${params.referenceId})`,
    html,
  });
}

/**
 * The customer-facing counterpart to sendHoldForReviewNotice — without this,
 * a held submission left the customer with only the generic "within 1 hour"
 * success-screen message and then silence, well past the promised window,
 * with no explanation. This tells them honestly that their case needs a
 * closer manual look and sets a real (still same-day) expectation instead.
 */
export async function sendCustomerReviewDelayNotice(params: {
  referenceId: string;
  customerEmail: string;
  customerName: string;
  /** True when the delay is a research-service failure on our end (API outage, etc.) rather than a genuine data-quality gap — the wording and the allowance-charging decision both hinge on this. */
  isInfrastructureFault: boolean;
}) {
  const client = getClient();
  if (!client) return;

  const bodyText = params.isInfrastructureFault
    ? `Most reports are ready within 30 minutes, but yours hit a temporary issue on our end (our research
      service was briefly unavailable) before it could finish. This was not caused by anything in your
      submission, and it does <strong>not</strong> count against your plan — we're re-running it now
      and you'll have your VA Home Underwriting Report within one business day.`
    : `Most reports are ready within 30 minutes, but a few of the numbers on your property need a
      manual check before we're comfortable sending the report — usually a local tax rate or
      rent comp we want to confirm by hand rather than estimate. We're on it, and you'll have
      your VA Home Underwriting Report within one business day.`;

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
      <h2 style="color:#0a1f44;">Your report needs a closer look — ${params.referenceId}</h2>
      <p style="color:#222;line-height:1.6;">
        ${params.customerName ? `Hi ${params.customerName},` : "Hi,"}<br/><br/>
        ${bodyText}
      </p>
      <p style="color:#888;font-size:12px;">Reference: ${params.referenceId}</p>
    </div>
  `;

  await sendOrThrow(client, {
    from: resolveFromAddress(),
    to: params.customerEmail,
    replyTo: siteConfig.notifyEmail,
    subject: `Your VA Home Underwriting Report is taking a bit longer (${params.referenceId})`,
    html,
  });
}

/**
 * Sent once, the first time a submission doesn't finish within its initial
 * background attempt and gets left for the retry sweep — distinct from
 * sendCustomerReviewDelayNotice, which is the *final* word (a genuine
 * data-quality hold, or all retries exhausted). This one is reassurance
 * mid-flight: nothing is wrong, it just needs another pass, still same-day.
 */
export async function sendStillProcessingNotice(params: {
  referenceId: string;
  customerEmail: string;
  customerName: string;
}) {
  const client = getClient();
  if (!client) return;

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
      <h2 style="color:#0a1f44;">Still working on your report — ${params.referenceId}</h2>
      <p style="color:#222;line-height:1.6;">
        ${params.customerName ? `Hi ${params.customerName},` : "Hi,"}<br/><br/>
        Most reports are ready within 30 minutes, but yours is taking a bit longer than usual —
        nothing is wrong, and there's nothing you need to do. We're continuing to work on it
        and you'll have your VA Home Underwriting Report within one business day.
      </p>
      <p style="color:#888;font-size:12px;">Reference: ${params.referenceId}</p>
    </div>
  `;

  await sendOrThrow(client, {
    from: resolveFromAddress(),
    to: params.customerEmail,
    replyTo: siteConfig.notifyEmail,
    subject: `Your VA Home Underwriting Report is still processing (${params.referenceId})`,
    html,
  });
}

export async function sendContactMessageEmail(body: { name: string; email: string; message: string }) {
  const client = getClient();
  if (!client) return;

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
      <h2 style="color:#0a1f44;">New contact form message</h2>
      <table cellpadding="0" cellspacing="0">
        ${row("Name", body.name)}
        ${row("Email", body.email)}
      </table>
      <p style="margin-top:16px;white-space:pre-wrap;color:#0a1f44;">${body.message}</p>
    </div>
  `;

  await sendOrThrow(client, {
    from: resolveFromAddress(),
    to: siteConfig.notifyEmail,
    replyTo: body.email,
    subject: `New contact message from ${body.name}`,
    html,
  });
}
