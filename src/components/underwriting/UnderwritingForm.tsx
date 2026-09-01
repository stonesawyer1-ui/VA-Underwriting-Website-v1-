"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CurrencyField,
  FieldShell,
  NumberField,
  PercentField,
  SectionCard,
  SelectField,
  TextField,
  ToggleField,
} from "./Field";
import { ResultsPanel } from "./ResultsPanel";
import { calculateResults } from "@/lib/underwriting/calculations";
import { createDefaultFormData, resizeUnitsForPropertyType, unitCountForPropertyType } from "@/lib/underwriting/defaults";
import { DEFAULT_INSURANCE_MONTHLY_ESTIMATE, US_STATES, getStateModelId } from "@/lib/underwriting/constants";
import type { LoanStatus, PriorVaLoan, UnderwritingFormData } from "@/lib/underwriting/types";
import { formatCurrency } from "@/lib/underwriting/format";

function newLoanRow(): PriorVaLoan {
  return {
    id: typeof crypto !== "undefined" ? crypto.randomUUID() : String(Math.random()),
    nickname: "",
    originalLoanAmount: 0,
    status: "open",
  };
}

const LOAN_STATUS_OPTIONS: { value: LoanStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "paid_off", label: "Paid Off" },
  { value: "sold", label: "Sold" },
];

export function UnderwritingForm({
  initialTier,
  entitlementToken,
  allowance,
  used,
}: {
  initialTier: UnderwritingFormData["tier"];
  entitlementToken: string;
  allowance: number;
  used: number;
}) {
  const [data, setData] = useState<UnderwritingFormData>(() => createDefaultFormData(initialTier));
  const [errors, setErrors] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [referenceId, setReferenceId] = useState<string | null>(null);
  const [usedCount, setUsedCount] = useState(used);
  const [token, setToken] = useState(entitlementToken);

  const results = useMemo(() => calculateResults(data), [data]);
  const stateModelId = getStateModelId(data.property.state);
  const hasOpenPriorLoan = data.priorVaLoans.some((l) => l.status === "open");

  function update<K extends keyof UnderwritingFormData>(
    key: K,
    updater: (prev: UnderwritingFormData[K]) => UnderwritingFormData[K],
  ) {
    setData((prev) => ({ ...prev, [key]: updater(prev[key]) }));
  }

  function validate(): string[] {
    const problems: string[] = [];
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.customer.email)) {
      problems.push("A valid email is required.");
    }
    if (!(typeof data.property.purchasePrice === "number" && data.property.purchasePrice > 0)) {
      problems.push("Purchase price is required.");
    }
    if (!data.property.address.trim()) problems.push("Property address is required.");
    if (!data.property.state) problems.push("Property state is required.");
    if (!(typeof data.financing.interestRate === "number" && data.financing.interestRate > 0)) {
      problems.push("Interest rate is required.");
    }
    if (!data.occupancy.moveInDate) problems.push("Move-in date is required.");
    return problems;
  }

  async function handleSubmit() {
    const problems = validate();
    if (problems.length > 0) {
      setErrors(problems);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setErrors([]);
    setStatus("submitting");
    try {
      const res = await fetch("/api/underwriting-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, results, entitlementToken: token }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Something went wrong. Please try again.");
      setReferenceId(json.referenceId);
      setUsedCount((n) => n + 1);
      if (json.nextToken) setToken(json.nextToken);
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setErrors([err instanceof Error ? err.message : "Something went wrong."]);
    }
  }

  function submitAnother() {
    setData(createDefaultFormData(initialTier));
    setReferenceId(null);
    setErrors([]);
  }

  if (referenceId) {
    const remaining = allowance - usedCount;
    return (
      <div className="mx-auto max-w-xl rounded-sm border border-navy-900/10 bg-white p-10 text-center shadow-xl shadow-navy-950/10">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
          <svg width="22" height="22" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3 8.5L6.2 11.5L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <h2 className="mt-5 font-display text-2xl font-bold text-navy-900">Submission received</h2>
        <p className="mt-3 text-sm leading-relaxed text-navy-900/60">
          Your reference number is{" "}
          <span className="font-mono font-semibold text-navy-900">{referenceId}</span>. We&apos;ve
          started your full underwriting review.
        </p>
        <p className="mt-3 rounded-sm bg-navy-50 px-4 py-3 text-sm leading-relaxed text-navy-900/70">
          You&apos;ll receive your VA Home Underwriting Report by email within{" "}
          <span className="font-semibold text-navy-900">30 minutes</span> for a full review. If you don&apos;t see it in
          your inbox, please check your{" "}
          <span className="font-semibold text-navy-900">spam or junk folder</span> before reaching
          out to us.
        </p>
        {remaining > 0 ? (
          <>
            <p className="mt-4 text-sm font-semibold text-navy-900">
              {remaining} of {allowance} property review{allowance === 1 ? "" : "s"} left on this plan.
            </p>
            <button
              type="button"
              onClick={submitAnother}
              className="mt-6 inline-flex items-center justify-center rounded-sm bg-navy-900 px-6 py-3 text-sm font-semibold tracking-wide text-white uppercase hover:bg-navy-800"
            >
              Submit Another Property
            </button>
          </>
        ) : (
          <p className="mt-4 text-sm font-semibold text-navy-900">
            You&apos;ve used all {allowance} property reviews on this plan.
          </p>
        )}
        <div className="mt-4">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-sm border border-navy-900/20 px-6 py-3 text-sm font-semibold tracking-wide text-navy-900 uppercase hover:border-navy-900/50"
          >
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-5 lg:items-start">
      <div className="space-y-6 lg:col-span-3">
        <div className="rounded-sm border border-navy-900/10 bg-white px-5 py-3 text-sm font-semibold text-navy-900">
          Property {usedCount + 1} of {allowance} on your {initialTier === "sentry" ? "Sentry" : "Recon"} plan
        </div>

        {errors.length > 0 && (
          <div className="rounded-sm border border-red-600/20 bg-red-100 p-4">
            <ul className="list-inside list-disc space-y-1 text-sm text-red-700">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Section 1: About You */}
        <SectionCard eyebrow="Section 1" title="About You">
          <FieldShell label="Name" htmlFor="name">
            <TextField
              id="name"
              value={data.customer.name}
              onChange={(v) => update("customer", (c) => ({ ...c, name: v }))}
              placeholder="Jordan Miller"
            />
          </FieldShell>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <FieldShell label="Email" htmlFor="email" required help="So we can send your VA Home Underwriting Report and follow up.">
              <TextField
                id="email"
                type="email"
                value={data.customer.email}
                onChange={(v) => update("customer", (c) => ({ ...c, email: v }))}
                placeholder="you@example.com"
              />
            </FieldShell>
            <FieldShell label="Phone" htmlFor="phone">
              <TextField
                id="phone"
                type="tel"
                value={data.customer.phone}
                onChange={(v) => update("customer", (c) => ({ ...c, phone: v }))}
                placeholder="(555) 555-0100"
              />
            </FieldShell>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <FieldShell label="Current duty station" htmlFor="dutyStation">
              <TextField
                id="dutyStation"
                value={data.customer.dutyStation}
                onChange={(v) => update("customer", (c) => ({ ...c, dutyStation: v }))}
                placeholder="Fort Liberty, NC"
              />
            </FieldShell>
            <FieldShell label="Target PCS / move date" htmlFor="targetPcsDate">
              <TextField
                id="targetPcsDate"
                type="date"
                value={data.customer.targetPcsDate}
                onChange={(v) => update("customer", (c) => ({ ...c, targetPcsDate: v }))}
              />
            </FieldShell>
          </div>
          <FieldShell label="VA disability rating" htmlFor="vaDisability" help="A rating waives the VA funding fee entirely.">
            <ToggleField
              value={data.customer.vaDisabilityRating ? "yes" : "no"}
              onChange={(v) => update("customer", (c) => ({ ...c, vaDisabilityRating: v === "yes" }))}
              options={[
                { value: "no", label: "No" },
                { value: "yes", label: "Yes" },
              ]}
            />
          </FieldShell>
        </SectionCard>

        {/* Section 2: Prior VA Loan History */}
        <SectionCard
          eyebrow="Section 2"
          title="Prior VA Loan History"
          description="Add one row per VA loan you've used before. Leave empty if this is your first."
        >
          <div className="space-y-4">
            {data.priorVaLoans.map((loan, idx) => (
              <div key={loan.id} className="rounded-sm border border-navy-900/10 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold tracking-wide text-navy-900/50 uppercase">
                    Loan {idx + 1}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      update("priorVaLoans", (loans) => loans.filter((l) => l.id !== loan.id))
                    }
                    className="text-xs font-semibold text-red-600 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <FieldShell label="Nickname / address" htmlFor={`loan-${loan.id}-nickname`}>
                    <TextField
                      id={`loan-${loan.id}-nickname`}
                      value={loan.nickname}
                      onChange={(v) =>
                        update("priorVaLoans", (loans) =>
                          loans.map((l) => (l.id === loan.id ? { ...l, nickname: v } : l)),
                        )
                      }
                      placeholder="123 Prior St"
                    />
                  </FieldShell>
                  <FieldShell label="Original loan amount" htmlFor={`loan-${loan.id}-amount`}>
                    <CurrencyField
                      id={`loan-${loan.id}-amount`}
                      value={loan.originalLoanAmount}
                      onChange={(v) =>
                        update("priorVaLoans", (loans) =>
                          loans.map((l) =>
                            l.id === loan.id ? { ...l, originalLoanAmount: v === "" ? 0 : v } : l,
                          ),
                        )
                      }
                    />
                  </FieldShell>
                  <FieldShell label="Status" htmlFor={`loan-${loan.id}-status`}>
                    <SelectField
                      id={`loan-${loan.id}-status`}
                      value={loan.status}
                      onChange={(v) =>
                        update("priorVaLoans", (loans) =>
                          loans.map((l) => (l.id === loan.id ? { ...l, status: v as LoanStatus } : l)),
                        )
                      }
                      options={LOAN_STATUS_OPTIONS}
                    />
                  </FieldShell>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={() => update("priorVaLoans", (loans) => [...loans, newLoanRow()])}
              className="w-full rounded-sm border border-dashed border-navy-900/25 py-3 text-sm font-semibold text-navy-900/60 hover:border-navy-900/50 hover:text-navy-900"
            >
              + Add prior VA loan
            </button>

            <div className="rounded-sm bg-navy-50 p-4 text-sm text-navy-900/70">
              <p>
                Entitlement charged: <span className="font-semibold">{formatCurrency(results.entitlement.entitlementCharged)}</span>
                {" · "}
                First-time use: <span className="font-semibold">{results.entitlement.firstTimeUse ? "Yes" : "No"}</span>
              </p>
            </div>
          </div>
        </SectionCard>

        {/* Conditional: rental income for next loan */}
        {hasOpenPriorLoan && (
          <SectionCard
            eyebrow="Qualifying"
            title="Rental Income for Your Next Loan"
            description="Since you have an open VA loan, lenders typically need this to qualify the rental income on your current property."
          >
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <FieldShell label="Current rent" htmlFor="currentRent">
                <CurrencyField
                  id="currentRent"
                  value={data.rentalIncomeForNextLoan.currentRent}
                  onChange={(v) =>
                    update("rentalIncomeForNextLoan", (r) => ({ ...r, currentRent: v === "" ? 0 : v }))
                  }
                />
              </FieldShell>
              <FieldShell label="Current mortgage payment" htmlFor="currentMortgagePayment">
                <CurrencyField
                  id="currentMortgagePayment"
                  value={data.rentalIncomeForNextLoan.currentMortgagePayment}
                  onChange={(v) =>
                    update("rentalIncomeForNextLoan", (r) => ({
                      ...r,
                      currentMortgagePayment: v === "" ? 0 : v,
                    }))
                  }
                />
              </FieldShell>
              <FieldShell label="Household monthly income" htmlFor="householdMonthlyIncome">
                <CurrencyField
                  id="householdMonthlyIncome"
                  value={data.rentalIncomeForNextLoan.householdMonthlyIncome}
                  onChange={(v) =>
                    update("rentalIncomeForNextLoan", (r) => ({
                      ...r,
                      householdMonthlyIncome: v === "" ? 0 : v,
                    }))
                  }
                />
              </FieldShell>
              <FieldShell label="Other monthly debts" htmlFor="otherMonthlyDebts">
                <CurrencyField
                  id="otherMonthlyDebts"
                  value={data.rentalIncomeForNextLoan.otherMonthlyDebts}
                  onChange={(v) =>
                    update("rentalIncomeForNextLoan", (r) => ({
                      ...r,
                      otherMonthlyDebts: v === "" ? 0 : v,
                    }))
                  }
                />
              </FieldShell>
            </div>
            <FieldShell label="Do you have a signed lease?" htmlFor="hasSignedLease">
              <ToggleField
                value={data.rentalIncomeForNextLoan.hasSignedLease ? "yes" : "no"}
                onChange={(v) =>
                  update("rentalIncomeForNextLoan", (r) => ({ ...r, hasSignedLease: v === "yes" }))
                }
                options={[
                  { value: "no", label: "No" },
                  { value: "yes", label: "Yes" },
                ]}
              />
            </FieldShell>
          </SectionCard>
        )}

        {/* Section 3: The Property */}
        <SectionCard eyebrow="Section 3" title="The Property">
          <FieldShell label="Address" htmlFor="address" required>
            <TextField
              id="address"
              value={data.property.address}
              onChange={(v) => update("property", (p) => ({ ...p, address: v }))}
              placeholder="123 Main St"
            />
          </FieldShell>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <FieldShell label="City" htmlFor="city">
              <TextField
                id="city"
                value={data.property.city}
                onChange={(v) => update("property", (p) => ({ ...p, city: v }))}
              />
            </FieldShell>
            <FieldShell label="State" htmlFor="state" required>
              <SelectField
                id="state"
                value={data.property.state}
                onChange={(v) => update("property", (p) => ({ ...p, state: v }))}
                options={[{ value: "", label: "Select a state" }, ...US_STATES.map((s) => ({ value: s.code, label: s.name }))]}
              />
            </FieldShell>
            <FieldShell label="Zip" htmlFor="zip">
              <TextField
                id="zip"
                value={data.property.zip}
                onChange={(v) => update("property", (p) => ({ ...p, zip: v }))}
              />
            </FieldShell>
            <FieldShell label="County" htmlFor="county">
              <TextField
                id="county"
                value={data.property.county}
                onChange={(v) => update("property", (p) => ({ ...p, county: v }))}
              />
            </FieldShell>
          </div>
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            <FieldShell label="Property type" htmlFor="propertyType">
              <SelectField
                id="propertyType"
                value={data.property.propertyType}
                onChange={(v) => {
                  const nextType = v as UnderwritingFormData["property"]["propertyType"];
                  update("property", (p) => ({
                    ...p,
                    propertyType: nextType,
                    units: resizeUnitsForPropertyType(p.units, nextType),
                  }));
                }}
                options={[
                  { value: "single_family", label: "Single Family" },
                  { value: "duplex", label: "Duplex" },
                  { value: "triplex", label: "Triplex" },
                  { value: "fourplex", label: "Fourplex" },
                  { value: "condo", label: "Condo" },
                ]}
              />
            </FieldShell>
            <FieldShell label={unitCountForPropertyType(data.property.propertyType) > 0 ? "Beds (total)" : "Beds"} htmlFor="beds">
              <NumberField id="beds" value={data.property.beds} onChange={(v) => update("property", (p) => ({ ...p, beds: v }))} />
            </FieldShell>
            <FieldShell label={unitCountForPropertyType(data.property.propertyType) > 0 ? "Baths (total)" : "Baths"} htmlFor="baths">
              <NumberField id="baths" value={data.property.baths} onChange={(v) => update("property", (p) => ({ ...p, baths: v }))} />
            </FieldShell>
            <FieldShell label="Sqft" htmlFor="sqft">
              <NumberField id="sqft" value={data.property.sqft} onChange={(v) => update("property", (p) => ({ ...p, sqft: v }))} />
            </FieldShell>
          </div>

          {unitCountForPropertyType(data.property.propertyType) > 0 && (
            <div className="rounded-sm border border-navy-900/10 bg-navy-50 p-4">
              <p className="text-xs font-semibold tracking-wide text-navy-900/60 uppercase">
                Per-unit breakdown (optional)
              </p>
              <p className="mt-1 text-xs text-navy-900/50">
                Different unit sizes rent for different amounts — filling this in helps us find
                more accurate rent comps per unit type and shows the breakdown on your report.
              </p>
              <div className="mt-3 space-y-3">
                {data.property.units.map((unit, idx) => (
                  <div key={idx} className="grid grid-cols-2 gap-3">
                    <FieldShell label={`Unit ${idx + 1} beds`} htmlFor={`unit-${idx}-beds`}>
                      <NumberField
                        id={`unit-${idx}-beds`}
                        value={unit.beds}
                        onChange={(v) =>
                          update("property", (p) => ({
                            ...p,
                            units: p.units.map((u, i) => (i === idx ? { ...u, beds: v } : u)),
                          }))
                        }
                      />
                    </FieldShell>
                    <FieldShell label={`Unit ${idx + 1} baths`} htmlFor={`unit-${idx}-baths`}>
                      <NumberField
                        id={`unit-${idx}-baths`}
                        value={unit.baths}
                        onChange={(v) =>
                          update("property", (p) => ({
                            ...p,
                            units: p.units.map((u, i) => (i === idx ? { ...u, baths: v } : u)),
                          }))
                        }
                      />
                    </FieldShell>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <FieldShell label="Purchase price" htmlFor="purchasePrice" required>
              <CurrencyField
                id="purchasePrice"
                value={data.property.purchasePrice}
                onChange={(v) => update("property", (p) => ({ ...p, purchasePrice: v }))}
                placeholder="385000"
              />
            </FieldShell>
            <FieldShell label="Status" htmlFor="ownershipStatus">
              <ToggleField
                value={data.property.ownershipStatus}
                onChange={(v) => update("property", (p) => ({ ...p, ownershipStatus: v }))}
                options={[
                  { value: "evaluating_purchase", label: "Evaluating a purchase" },
                  { value: "already_owned", label: "Already owned" },
                ]}
              />
            </FieldShell>
          </div>
        </SectionCard>

        {/* Section 4: Financing */}
        <SectionCard eyebrow="Section 4" title="Financing">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <FieldShell label="Interest rate" htmlFor="interestRate" required>
              <PercentField
                id="interestRate"
                value={data.financing.interestRate}
                onChange={(v) => update("financing", (f) => ({ ...f, interestRate: v }))}
              />
            </FieldShell>
            <FieldShell label="Loan term (years)" htmlFor="loanTermYears">
              <NumberField
                id="loanTermYears"
                value={data.financing.loanTermYears}
                onChange={(v) => update("financing", (f) => ({ ...f, loanTermYears: v === "" ? 30 : v }))}
              />
            </FieldShell>
            <FieldShell label="Down payment" htmlFor="downPayment">
              <CurrencyField
                id="downPayment"
                value={data.financing.downPayment}
                onChange={(v) => update("financing", (f) => ({ ...f, downPayment: v === "" ? 0 : v }))}
              />
            </FieldShell>
            <FieldShell label="HOA (monthly)" htmlFor="hoaMonthly">
              <CurrencyField
                id="hoaMonthly"
                value={data.financing.hoaMonthly}
                onChange={(v) => update("financing", (f) => ({ ...f, hoaMonthly: v === "" ? 0 : v }))}
              />
            </FieldShell>
          </div>
          <FieldShell
            label="County loan limit"
            htmlFor="countyLoanLimit"
            estimated={!data.financing.countyLoanLimitOverridden}
            help="Defaults to a baseline conforming limit. Override with your county's actual current VA/FHFA limit if you know it."
          >
            <CurrencyField
              id="countyLoanLimit"
              value={data.financing.countyLoanLimit}
              onChange={(v) =>
                update("financing", (f) => ({
                  ...f,
                  countyLoanLimit: v === "" ? 0 : v,
                  countyLoanLimitOverridden: true,
                }))
              }
            />
          </FieldShell>
        </SectionCard>

        {/* Section 5: Property Tax */}
        <SectionCard
          eyebrow="Section 5"
          title="Property Tax"
          description={
            data.property.state
              ? results.tax.note
              : "Select a state in Section 3 to load the right tax model."
          }
        >
          {stateModelId === "assessment_ratio" && (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <FieldShell
                label="Total millage rate"
                htmlFor="totalMillageRate"
                estimated={!data.tax.assessmentRatioTouched.totalMillageRate}
              >
                <NumberField
                  id="totalMillageRate"
                  value={data.tax.assessmentRatio.totalMillageRate}
                  onChange={(v) =>
                    update("tax", (t) => ({
                      ...t,
                      assessmentRatio: { ...t.assessmentRatio, totalMillageRate: v === "" ? 0 : v },
                      assessmentRatioTouched: { ...t.assessmentRatioTouched, totalMillageRate: true },
                    }))
                  }
                />
              </FieldShell>
              <FieldShell
                label="School operating millage"
                htmlFor="schoolOperatingMillage"
                estimated={!data.tax.assessmentRatioTouched.schoolOperatingMillage}
              >
                <NumberField
                  id="schoolOperatingMillage"
                  value={data.tax.assessmentRatio.schoolOperatingMillage}
                  onChange={(v) =>
                    update("tax", (t) => ({
                      ...t,
                      assessmentRatio: { ...t.assessmentRatio, schoolOperatingMillage: v === "" ? 0 : v },
                      assessmentRatioTouched: { ...t.assessmentRatioTouched, schoolOperatingMillage: true },
                    }))
                  }
                />
              </FieldShell>
              <FieldShell
                label="School bond millage"
                htmlFor="schoolBondMillage"
                estimated={!data.tax.assessmentRatioTouched.schoolBondMillage}
              >
                <NumberField
                  id="schoolBondMillage"
                  value={data.tax.assessmentRatio.schoolBondMillage}
                  onChange={(v) =>
                    update("tax", (t) => ({
                      ...t,
                      assessmentRatio: { ...t.assessmentRatio, schoolBondMillage: v === "" ? 0 : v },
                      assessmentRatioTouched: { ...t.assessmentRatioTouched, schoolBondMillage: true },
                    }))
                  }
                />
              </FieldShell>
              <FieldShell
                label="Owner-occupied assessment ratio"
                htmlFor="ownerAssessmentRatioPct"
                estimated={!data.tax.assessmentRatioTouched.ownerAssessmentRatioPct}
              >
                <PercentField
                  id="ownerAssessmentRatioPct"
                  value={data.tax.assessmentRatio.ownerAssessmentRatioPct}
                  onChange={(v) =>
                    update("tax", (t) => ({
                      ...t,
                      assessmentRatio: { ...t.assessmentRatio, ownerAssessmentRatioPct: v === "" ? 0 : v },
                      assessmentRatioTouched: { ...t.assessmentRatioTouched, ownerAssessmentRatioPct: true },
                    }))
                  }
                />
              </FieldShell>
              <FieldShell
                label="Investor assessment ratio"
                htmlFor="investorAssessmentRatioPct"
                estimated={!data.tax.assessmentRatioTouched.investorAssessmentRatioPct}
              >
                <PercentField
                  id="investorAssessmentRatioPct"
                  value={data.tax.assessmentRatio.investorAssessmentRatioPct}
                  onChange={(v) =>
                    update("tax", (t) => ({
                      ...t,
                      assessmentRatio: { ...t.assessmentRatio, investorAssessmentRatioPct: v === "" ? 0 : v },
                      assessmentRatioTouched: { ...t.assessmentRatioTouched, investorAssessmentRatioPct: true },
                    }))
                  }
                />
              </FieldShell>
            </div>
          )}

          {stateModelId === "homestead_exemption" && (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <FieldShell
                label="City rate"
                htmlFor="cityRatePct"
                estimated={!data.tax.homesteadExemptionTouched.cityRatePct}
              >
                <PercentField
                  id="cityRatePct"
                  value={data.tax.homesteadExemption.cityRatePct}
                  onChange={(v) =>
                    update("tax", (t) => ({
                      ...t,
                      homesteadExemption: { ...t.homesteadExemption, cityRatePct: v === "" ? 0 : v },
                      homesteadExemptionTouched: { ...t.homesteadExemptionTouched, cityRatePct: true },
                    }))
                  }
                />
              </FieldShell>
              <FieldShell
                label="School ISD rate"
                htmlFor="schoolIsdRatePct"
                estimated={!data.tax.homesteadExemptionTouched.schoolIsdRatePct}
              >
                <PercentField
                  id="schoolIsdRatePct"
                  value={data.tax.homesteadExemption.schoolIsdRatePct}
                  onChange={(v) =>
                    update("tax", (t) => ({
                      ...t,
                      homesteadExemption: { ...t.homesteadExemption, schoolIsdRatePct: v === "" ? 0 : v },
                      homesteadExemptionTouched: { ...t.homesteadExemptionTouched, schoolIsdRatePct: true },
                    }))
                  }
                />
              </FieldShell>
              <FieldShell
                label="County rate"
                htmlFor="countyRatePct"
                estimated={!data.tax.homesteadExemptionTouched.countyRatePct}
              >
                <PercentField
                  id="countyRatePct"
                  value={data.tax.homesteadExemption.countyRatePct}
                  onChange={(v) =>
                    update("tax", (t) => ({
                      ...t,
                      homesteadExemption: { ...t.homesteadExemption, countyRatePct: v === "" ? 0 : v },
                      homesteadExemptionTouched: { ...t.homesteadExemptionTouched, countyRatePct: true },
                    }))
                  }
                />
              </FieldShell>
              <FieldShell
                label="School homestead exemption"
                htmlFor="schoolHomesteadExemption"
                estimated={!data.tax.homesteadExemptionTouched.schoolHomesteadExemption}
              >
                <CurrencyField
                  id="schoolHomesteadExemption"
                  value={data.tax.homesteadExemption.schoolHomesteadExemption}
                  onChange={(v) =>
                    update("tax", (t) => ({
                      ...t,
                      homesteadExemption: { ...t.homesteadExemption, schoolHomesteadExemption: v === "" ? 0 : v },
                      homesteadExemptionTouched: { ...t.homesteadExemptionTouched, schoolHomesteadExemption: true },
                    }))
                  }
                />
              </FieldShell>
            </div>
          )}

          {stateModelId === "flat_rate" && (
            <FieldShell
              label="Combined tax rate"
              htmlFor="combinedTaxRatePct"
              estimated={!data.tax.flatRateTouched.combinedTaxRatePct}
            >
              <PercentField
                id="combinedTaxRatePct"
                value={data.tax.flatRate.combinedTaxRatePct}
                onChange={(v) =>
                  update("tax", (t) => ({
                    ...t,
                    flatRate: { ...t.flatRate, combinedTaxRatePct: v === "" ? 0 : v },
                    flatRateTouched: { ...t.flatRateTouched, combinedTaxRatePct: true },
                  }))
                }
              />
            </FieldShell>
          )}

          {stateModelId === "fallback" && data.property.state && (
            <FieldShell
              label="Estimated effective tax rate"
              htmlFor="estimatedEffectiveTaxRatePct"
              estimated
              help="Confirm the real rate with your county Assessor/Auditor's office before relying on it."
            >
              <PercentField
                id="estimatedEffectiveTaxRatePct"
                value={data.tax.fallback.estimatedEffectiveTaxRatePct}
                onChange={(v) =>
                  update("tax", (t) => ({
                    ...t,
                    fallback: { ...t.fallback, estimatedEffectiveTaxRatePct: v === "" ? 0 : v },
                  }))
                }
              />
            </FieldShell>
          )}
        </SectionCard>

        {/* Section 6: Occupancy & Expenses */}
        <SectionCard eyebrow="Section 6" title="Occupancy & Expenses">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <FieldShell label="Move-in date" htmlFor="moveInDate" required>
              <TextField
                id="moveInDate"
                type="date"
                value={data.occupancy.moveInDate}
                onChange={(v) => update("occupancy", (o) => ({ ...o, moveInDate: v }))}
              />
            </FieldShell>
            <FieldShell label="Move-out date (rental start)" htmlFor="moveOutDate">
              <TextField
                id="moveOutDate"
                type="date"
                value={data.occupancy.moveOutDate}
                onChange={(v) => update("occupancy", (o) => ({ ...o, moveOutDate: v }))}
              />
            </FieldShell>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <FieldShell label="Estimated monthly rent" htmlFor="monthlyRent">
              <CurrencyField
                id="monthlyRent"
                value={data.rentEstimate.monthlyRent}
                onChange={(v) => update("rentEstimate", (r) => ({ ...r, monthlyRent: v }))}
                placeholder="2200"
              />
            </FieldShell>
            <FieldShell label="Confidence in that estimate" htmlFor="confidence">
              <ToggleField
                value={data.rentEstimate.confidence}
                onChange={(v) => update("rentEstimate", (r) => ({ ...r, confidence: v }))}
                options={[
                  { value: "low", label: "Low" },
                  { value: "moderate", label: "Moderate" },
                  { value: "high", label: "High" },
                ]}
              />
            </FieldShell>
          </div>

          <FieldShell label="Insurance" htmlFor="hasInsuranceQuote">
            <ToggleField
              value={data.expenses.hasInsuranceQuote ? "quote" : "estimate"}
              onChange={(v) =>
                update("expenses", (e) => ({
                  ...e,
                  hasInsuranceQuote: v === "quote",
                  insuranceAnnual: v === "quote" ? e.insuranceAnnual : DEFAULT_INSURANCE_MONTHLY_ESTIMATE * 12,
                }))
              }
              options={[
                { value: "estimate", label: "Estimate for me" },
                { value: "quote", label: "I have a real quote" },
              ]}
            />
          </FieldShell>
          <FieldShell
            label="Annual insurance premium"
            htmlFor="insuranceAnnual"
            estimated={!data.expenses.hasInsuranceQuote}
          >
            <CurrencyField
              id="insuranceAnnual"
              value={data.expenses.insuranceAnnual}
              onChange={(v) => update("expenses", (e) => ({ ...e, insuranceAnnual: v === "" ? 0 : v }))}
            />
          </FieldShell>

          <FieldShell label="Management" htmlFor="selfManaged">
            <ToggleField
              value={data.expenses.selfManaged ? "self" : "manager"}
              onChange={(v) => update("expenses", (e) => ({ ...e, selfManaged: v === "self" }))}
              options={[
                { value: "self", label: "Self-managed" },
                { value: "manager", label: "Property manager" },
              ]}
            />
          </FieldShell>

          <FieldShell label="Known near-term capital needs" htmlFor="knownCapitalNeeds" help="Optional — e.g. roof, HVAC, water heater.">
            <textarea
              id="knownCapitalNeeds"
              rows={3}
              className="w-full rounded-sm border border-navy-900/15 bg-white px-3.5 py-2.5 text-sm text-navy-900 outline-none transition-colors focus:border-navy-900 focus:ring-2 focus:ring-red-600/20"
              value={data.expenses.knownCapitalNeeds}
              onChange={(e) => update("expenses", (ex) => ({ ...ex, knownCapitalNeeds: e.target.value }))}
            />
          </FieldShell>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <FieldShell label="Vacancy %" htmlFor="vacancyPct">
              <PercentField
                id="vacancyPct"
                value={data.expenses.vacancyPct}
                onChange={(v) => update("expenses", (e) => ({ ...e, vacancyPct: v === "" ? 0 : v }))}
              />
            </FieldShell>
            <FieldShell label="Reserve % (repairs + management)" htmlFor="reservePct">
              <PercentField
                id="reservePct"
                value={data.expenses.reservePct}
                onChange={(v) => update("expenses", (e) => ({ ...e, reservePct: v === "" ? 0 : v }))}
              />
            </FieldShell>
          </div>
        </SectionCard>

        {/* Submit */}
        <SectionCard
          eyebrow="Last Step"
          title="Submit for Underwriting"
          description="Your full VA Home Underwriting Report PDF is delivered after we verify these numbers — already paid for on this plan."
        >
          <button
            type="button"
            onClick={handleSubmit}
            disabled={status === "submitting"}
            className="inline-flex w-full items-center justify-center rounded-sm bg-red-600 px-7 py-3.5 text-sm font-semibold tracking-wide text-white uppercase transition-colors hover:bg-red-700 disabled:opacity-60"
          >
            {status === "submitting" ? "Submitting…" : "Submit for Underwriting"}
          </button>
        </SectionCard>
      </div>

      <div className="order-first lg:sticky lg:top-24 lg:order-last lg:col-span-2 lg:self-start">
        <ResultsPanel results={results} />
      </div>
    </div>
  );
}
