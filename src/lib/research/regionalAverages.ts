/**
 * Last-resort fallback when neither the buyer nor live Claude research can
 * supply a rent or insurance figure (e.g. web search comes back with no
 * verifiable active listings). Ties the estimate to this specific property's
 * own purchase price rather than a flat nationwide number, scaled by a
 * broad Census-region ratio — a real-estate-industry rule-of-thumb, not
 * per-ZIP precision. This exists so a data gap never blocks a submission;
 * it is always clearly labeled to the buyer as a regional estimate, never
 * presented as a real comp or a real quote.
 */

type CensusRegion = "northeast" | "midwest" | "south" | "west";

const STATE_REGION: Record<string, CensusRegion> = {
  CT: "northeast", ME: "northeast", MA: "northeast", NH: "northeast", RI: "northeast", VT: "northeast",
  NJ: "northeast", NY: "northeast", PA: "northeast",
  IL: "midwest", IN: "midwest", MI: "midwest", OH: "midwest", WI: "midwest",
  IA: "midwest", KS: "midwest", MN: "midwest", MO: "midwest", NE: "midwest", ND: "midwest", SD: "midwest",
  DE: "south", FL: "south", GA: "south", MD: "south", NC: "south", SC: "south", VA: "south", DC: "south", WV: "south",
  AL: "south", KY: "south", MS: "south", TN: "south",
  AR: "south", LA: "south", OK: "south", TX: "south",
  AZ: "west", CO: "west", ID: "west", MT: "west", NV: "west", NM: "west", UT: "west", WY: "west",
  AK: "west", CA: "west", HI: "west", OR: "west", WA: "west",
};

// Typical monthly rent as a percentage of purchase price ("rent-to-price
// ratio"), by region — broad industry-rule-of-thumb ranges, not a specific
// market's actual figure.
const RENT_TO_PRICE_MONTHLY_PCT: Record<CensusRegion, number> = {
  northeast: 0.6,
  midwest: 0.9,
  south: 0.8,
  west: 0.6,
};

// Typical annual landlord/rental-property insurance premium per $1,000 of
// value, by region — the South/Gulf skews higher for storm/hurricane/wind
// exposure, broadly consistent with published NAIC/III regional patterns.
const INSURANCE_PER_1000_VALUE: Record<CensusRegion, number> = {
  northeast: 4.5,
  midwest: 5.5,
  south: 6.5,
  west: 4.0,
};

function regionForState(state: string): CensusRegion {
  return STATE_REGION[state.trim().toUpperCase()] ?? "south";
}

export function regionalRentEstimate(
  state: string,
  purchasePrice: number,
): { monthly: number; note: string } | null {
  if (!purchasePrice || purchasePrice <= 0) return null;
  const region = regionForState(state);
  const pct = RENT_TO_PRICE_MONTHLY_PCT[region];
  const monthly = Math.round(purchasePrice * (pct / 100));
  return {
    monthly,
    note: `Regional average estimate (~${pct}% of purchase price/month, typical for the ${region} region) — not live comps for this address. Confirm with real rental listings before relying on this number.`,
  };
}

export function regionalInsuranceEstimate(
  state: string,
  purchasePrice: number,
): { annual: number; note: string } | null {
  if (!purchasePrice || purchasePrice <= 0) return null;
  const region = regionForState(state);
  const rate = INSURANCE_PER_1000_VALUE[region];
  const annual = Math.round((purchasePrice / 1000) * rate);
  return {
    annual,
    note: `Regional average estimate (~$${rate}/year per $1,000 of value, typical for the ${region} region) — not a real quote. Get an actual landlord insurance quote before closing.`,
  };
}
