export const siteConfig = {
  name: "Garrison Risk Review",
  shortName: "Garrison",
  tagline: "Independent risk review for VA loan buyers.",
  description:
    "Flat-fee, done-for-you underwriting review for VA loan and house-hack buyers. Know your post-PCS tax exposure, rent coverage, and cash flow risk before you close.",
  email: "review@garrisonriskreview.com",
  url: "https://www.garrisonriskreview.com",
  /** Where inquiry notification emails are sent — the site operator's inbox, not the public-facing address above. */
  notifyEmail: "stonesawyer1@gmail.com",
} as const;

export type PricingTier = {
  id: "recon" | "sentry";
  name: string;
  price: number;
  priceLabel: string;
  bestFor: string;
  properties: string;
  /** How many separate property submissions this purchase unlocks. */
  propertyAllowance: number;
  highlighted: boolean;
  features: string[];
};

export const pricingTiers: PricingTier[] = [
  {
    id: "recon",
    name: "Recon",
    price: 125,
    priceLabel: "$125",
    bestFor: "A couple properties, straightforward numbers, fast answer.",
    properties: "2 properties",
    propertyAllowance: 2,
    highlighted: false,
    features: [
      "Post-PCS tax spike analysis",
      "Rent coverage calculation",
      "Core risk factor summary",
      "VA Home Underwriting Report PDF delivery",
    ],
  },
  {
    id: "sentry",
    name: "Sentry",
    price: 199,
    priceLabel: "$199",
    bestFor: "House-hack buyers who want market context, not just math.",
    properties: "5 properties",
    propertyAllowance: 5,
    highlighted: true,
    features: [
      "Everything in Recon",
      "Local market trend analysis",
      "2-4 unit house-hack cash flow scenarios",
    ],
  },
];

export function getPricingTier(id: string): PricingTier | undefined {
  return pricingTiers.find((t) => t.id === id);
}

export const comparisonRows: { label: string; recon: string; sentry: string }[] = [
  { label: "Properties included", recon: "2 properties", sentry: "5 properties" },
  { label: "Post-PCS tax spike analysis", recon: "Included", sentry: "Included" },
  { label: "Rent coverage calculation", recon: "Included", sentry: "Included" },
  { label: "Core risk factor summary", recon: "Included", sentry: "Included" },
  { label: "Local market trend analysis", recon: "—", sentry: "Included" },
  { label: "2-4 unit house-hack scenarios", recon: "—", sentry: "Included" },
];
