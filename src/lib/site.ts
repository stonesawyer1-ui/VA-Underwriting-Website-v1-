export const siteConfig = {
  name: "Garrison Risk Review",
  shortName: "Garrison",
  tagline: "Independent risk review for VA loan buyers.",
  description:
    "Flat-fee, done-for-you underwriting review for VA loan and house-hack buyers. Know your post-PCS tax exposure, rent coverage, and cash flow risk before you close.",
  email: "review@garrisonriskreview.com",
  url: "https://www.garrisonriskreview.com",
} as const;

export type PricingTier = {
  id: "recon" | "sentry" | "command";
  name: string;
  price: number;
  priceLabel: string;
  bestFor: string;
  turnaround: string;
  highlighted: boolean;
  features: string[];
};

export const pricingTiers: PricingTier[] = [
  {
    id: "recon",
    name: "Recon",
    price: 149,
    priceLabel: "$149",
    bestFor: "A single property, straightforward numbers, fast answer.",
    turnaround: "5 business days",
    highlighted: false,
    features: [
      "Post-PCS tax spike analysis",
      "Rent coverage calculation",
      "Core risk factor summary",
      "Risk Memorandum PDF delivery",
    ],
  },
  {
    id: "sentry",
    name: "Sentry",
    price: 249,
    priceLabel: "$249",
    bestFor: "House-hack buyers who want market context, not just math.",
    turnaround: "3 business days",
    highlighted: true,
    features: [
      "Everything in Recon",
      "Local market trend analysis",
      "2-4 unit house-hack cash flow scenarios",
      "One round of email follow-up questions",
    ],
  },
  {
    id: "command",
    name: "Command",
    price: 399,
    priceLabel: "$399",
    bestFor: "Comparing financing paths before you write an offer.",
    turnaround: "2 business days",
    highlighted: false,
    features: [
      "Everything in Sentry",
      "Multiple financing scenario comparison",
      "20-minute live walkthrough call",
      "30 days of unlimited email follow-up",
    ],
  },
];

export const comparisonRows: { label: string; recon: string; sentry: string; command: string }[] = [
  { label: "Post-PCS tax spike analysis", recon: "Included", sentry: "Included", command: "Included" },
  { label: "Rent coverage calculation", recon: "Included", sentry: "Included", command: "Included" },
  { label: "Core risk factor summary", recon: "Included", sentry: "Included", command: "Included" },
  { label: "Local market trend analysis", recon: "—", sentry: "Included", command: "Included" },
  { label: "2-4 unit house-hack scenarios", recon: "—", sentry: "Included", command: "Included" },
  { label: "Financing scenario comparison", recon: "—", sentry: "—", command: "Included" },
  { label: "Live walkthrough call", recon: "—", sentry: "—", command: "20 min" },
  { label: "Follow-up questions", recon: "—", sentry: "1 round (email)", command: "30 days (email)" },
  { label: "Turnaround", recon: "5 business days", sentry: "3 business days", command: "2 business days" },
];
