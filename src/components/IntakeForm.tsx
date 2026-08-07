"use client";

import { useState } from "react";
import Link from "next/link";
import { pricingTiers } from "@/lib/site";
import { emptyIntakePayload, type IntakePayload } from "@/lib/intake";

const inputClasses =
  "w-full rounded-sm border border-navy-900/15 bg-white px-4 py-3 text-sm text-navy-900 outline-none transition-colors focus:border-navy-900 focus:ring-2 focus:ring-red-600/20";

const labelClasses = "block text-sm font-semibold text-navy-900";

type StepId = "contact" | "property" | "loan" | "timeline" | "review";

const steps: { id: StepId; title: string }[] = [
  { id: "contact", title: "Contact Info" },
  { id: "property", title: "Property" },
  { id: "loan", title: "Loan Details" },
  { id: "timeline", title: "PCS & Tier" },
  { id: "review", title: "Review & Submit" },
];

export function IntakeForm({ initialTier }: { initialTier?: IntakePayload["tier"] }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [data, setData] = useState<IntakePayload>({
    ...emptyIntakePayload,
    ...(initialTier ? { tier: initialTier } : {}),
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [referenceId, setReferenceId] = useState<string | null>(null);

  const currentStep = steps[stepIndex];

  function update<K extends keyof IntakePayload>(key: K, value: IntakePayload[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  function validateStep(): string[] {
    const problems: string[] = [];
    if (currentStep.id === "contact") {
      if (!data.fullName.trim()) problems.push("Full name is required.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) problems.push("A valid email is required.");
      if (!data.phone.trim()) problems.push("Phone number is required.");
    }
    if (currentStep.id === "property") {
      if (!data.propertyAddress.trim()) problems.push("Property address is required.");
    }
    if (currentStep.id === "loan") {
      if (!data.loanRate.trim()) problems.push("Loan rate is required.");
      if (!data.loanBalance.trim()) problems.push("Loan balance is required.");
    }
    return problems;
  }

  function goNext() {
    const problems = validateStep();
    if (problems.length > 0) {
      setErrors(problems);
      return;
    }
    setErrors([]);
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  }

  function goBack() {
    setErrors([]);
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  async function handleSubmit() {
    setStatus("submitting");
    setErrors([]);
    try {
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? "Something went wrong. Please try again.");
      }
      setReferenceId(json.referenceId);
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setErrors([err instanceof Error ? err.message : "Something went wrong."]);
    }
  }

  if (referenceId) {
    return (
      <div className="rounded-sm border border-navy-900/10 bg-white p-10 text-center shadow-xl shadow-navy-950/10">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
          <svg width="22" height="22" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3 8.5L6.2 11.5L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <h2 className="mt-5 font-display text-2xl font-bold text-navy-900">
          Submission received
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-navy-900/60">
          Your reference number is{" "}
          <span className="font-mono font-semibold text-navy-900">{referenceId}</span>.
          We&apos;ll reach out at <span className="font-semibold">{data.email}</span> to
          confirm details and begin your review. Most Risk Memoranda are delivered within
          the turnaround window for your selected tier.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex items-center justify-center rounded-sm border border-navy-900/20 px-6 py-3 text-sm font-semibold tracking-wide text-navy-900 uppercase hover:border-navy-900/50"
        >
          Back to Home
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-sm border border-navy-900/10 bg-white p-8 shadow-xl shadow-navy-950/10 sm:p-10">
      {/* Progress */}
      <div className="mb-8">
        <p className="text-xs font-semibold tracking-[0.15em] text-navy-900/40 uppercase">
          Step {stepIndex + 1} of {steps.length} &middot; {currentStep.title}
        </p>
        <div className="mt-3 flex gap-1.5">
          {steps.map((s, i) => (
            <span
              key={s.id}
              className={`h-1 flex-1 rounded-full ${i <= stepIndex ? "bg-red-600" : "bg-navy-900/10"}`}
            />
          ))}
        </div>
      </div>

      {errors.length > 0 && (
        <div className="mb-6 rounded-sm border border-red-600/20 bg-red-100 p-4">
          <ul className="list-inside list-disc space-y-1 text-sm text-red-700">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {currentStep.id === "contact" && (
        <div className="space-y-5">
          <div>
            <label className={labelClasses} htmlFor="fullName">Full name</label>
            <input
              id="fullName"
              className={`mt-2 ${inputClasses}`}
              value={data.fullName}
              onChange={(e) => update("fullName", e.target.value)}
              placeholder="Jordan Miller"
            />
          </div>
          <div>
            <label className={labelClasses} htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              className={`mt-2 ${inputClasses}`}
              value={data.email}
              onChange={(e) => update("email", e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className={labelClasses} htmlFor="phone">Phone</label>
            <input
              id="phone"
              type="tel"
              className={`mt-2 ${inputClasses}`}
              value={data.phone}
              onChange={(e) => update("phone", e.target.value)}
              placeholder="(555) 555-0100"
            />
          </div>
        </div>
      )}

      {currentStep.id === "property" && (
        <div className="space-y-5">
          <div>
            <label className={labelClasses} htmlFor="propertyAddress">Property address</label>
            <input
              id="propertyAddress"
              className={`mt-2 ${inputClasses}`}
              value={data.propertyAddress}
              onChange={(e) => update("propertyAddress", e.target.value)}
              placeholder="123 Main St, Fayetteville, NC 28301"
            />
            <p className="mt-2 text-xs text-navy-900/50">
              The property you&apos;re purchasing or considering purchasing with
              your VA loan benefit.
            </p>
          </div>
        </div>
      )}

      {currentStep.id === "loan" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className={labelClasses} htmlFor="loanRate">Interest rate (%)</label>
              <input
                id="loanRate"
                inputMode="decimal"
                className={`mt-2 ${inputClasses}`}
                value={data.loanRate}
                onChange={(e) => update("loanRate", e.target.value)}
                placeholder="6.25"
              />
            </div>
            <div>
              <label className={labelClasses} htmlFor="loanBalance">Loan balance ($)</label>
              <input
                id="loanBalance"
                inputMode="numeric"
                className={`mt-2 ${inputClasses}`}
                value={data.loanBalance}
                onChange={(e) => update("loanBalance", e.target.value)}
                placeholder="385000"
              />
            </div>
          </div>
          <div>
            <span className={labelClasses}>Is this a VA loan?</span>
            <div className="mt-2 flex flex-wrap gap-3">
              {(["yes", "no", "unsure"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => update("isVaLoan", option)}
                  className={`rounded-sm border px-4 py-2 text-sm font-medium capitalize transition-colors ${
                    data.isVaLoan === option
                      ? "border-navy-900 bg-navy-900 text-white"
                      : "border-navy-900/15 text-navy-900/70 hover:border-navy-900/40"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {currentStep.id === "timeline" && (
        <div className="space-y-7">
          <div>
            <label className={labelClasses} htmlFor="pcsTimeline">PCS timeline (if known)</label>
            <input
              id="pcsTimeline"
              className={`mt-2 ${inputClasses}`}
              value={data.pcsTimeline}
              onChange={(e) => update("pcsTimeline", e.target.value)}
              placeholder="e.g. Expecting orders summer 2027, or Unknown"
            />
          </div>

          <div>
            <span className={labelClasses}>Select your tier</span>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {pricingTiers.map((tier) => (
                <button
                  key={tier.id}
                  type="button"
                  onClick={() => update("tier", tier.id)}
                  className={`rounded-sm border p-4 text-left transition-colors ${
                    data.tier === tier.id
                      ? "border-navy-900 bg-navy-50"
                      : "border-navy-900/15 hover:border-navy-900/40"
                  }`}
                >
                  <p className="font-display text-sm font-bold text-navy-900">{tier.name}</p>
                  <p className="mt-1 text-lg font-bold text-navy-900">{tier.priceLabel}</p>
                  <p className="mt-1 text-xs text-navy-900/50">{tier.turnaround}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {currentStep.id === "review" && (
        <div className="space-y-6">
          <dl className="divide-y divide-navy-900/10 rounded-sm border border-navy-900/10">
            {[
              ["Name", data.fullName],
              ["Email", data.email],
              ["Phone", data.phone],
              ["Property", data.propertyAddress],
              ["Rate / Balance", `${data.loanRate || "—"}% / $${data.loanBalance || "—"}`],
              ["VA Loan", data.isVaLoan],
              ["PCS Timeline", data.pcsTimeline || "Not provided"],
              ["Tier", pricingTiers.find((t) => t.id === data.tier)?.name ?? data.tier],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                <dt className="text-navy-900/50">{label}</dt>
                <dd className="text-right font-medium text-navy-900">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-navy-900/50">
            Submitting sends your intake details to Garrison Risk Review. This
            does not charge any payment method — a team member will follow up
            to confirm your order.
          </p>
        </div>
      )}

      {/* Nav buttons */}
      <div className="mt-9 flex items-center justify-between">
        <button
          type="button"
          onClick={goBack}
          disabled={stepIndex === 0}
          className="text-sm font-semibold text-navy-900/60 hover:text-navy-900 disabled:opacity-0"
        >
          &larr; Back
        </button>

        {currentStep.id === "review" ? (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={status === "submitting"}
            className="inline-flex items-center justify-center rounded-sm bg-red-600 px-7 py-3.5 text-sm font-semibold tracking-wide text-white uppercase transition-colors hover:bg-red-700 disabled:opacity-60"
          >
            {status === "submitting" ? "Submitting…" : "Submit"}
          </button>
        ) : (
          <button
            type="button"
            onClick={goNext}
            className="inline-flex items-center justify-center rounded-sm bg-navy-900 px-7 py-3.5 text-sm font-semibold tracking-wide text-white uppercase transition-colors hover:bg-navy-800"
          >
            Continue &rarr;
          </button>
        )}
      </div>
    </div>
  );
}
