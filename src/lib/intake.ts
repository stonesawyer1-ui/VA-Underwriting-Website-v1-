import { pricingTiers } from "@/lib/site";

export type IntakePayload = {
  fullName: string;
  email: string;
  phone: string;
  propertyAddress: string;
  loanRate: string;
  loanBalance: string;
  isVaLoan: "yes" | "no" | "unsure";
  pcsTimeline: string;
  tier: (typeof pricingTiers)[number]["id"];
};

export const emptyIntakePayload: IntakePayload = {
  fullName: "",
  email: "",
  phone: "",
  propertyAddress: "",
  loanRate: "",
  loanBalance: "",
  isVaLoan: "yes",
  pcsTimeline: "",
  tier: "sentry",
};

export function isValidTier(
  value: string | undefined,
): value is IntakePayload["tier"] {
  return pricingTiers.some((t) => t.id === value);
}
