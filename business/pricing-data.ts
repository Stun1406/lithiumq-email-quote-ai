import pricingJson from "./pricing-data.json";

export const PRICING_TERMS_NAME = "FL Distribution LLC Warehouse Rates" as const;

const pricingData = pricingJson as typeof pricingJson;

export const PRICING_DATA = pricingData;
export const PRICING_TERMS = PRICING_DATA[PRICING_TERMS_NAME];

export type PricingTerms = typeof PRICING_TERMS;

const TRANSLOADING_COLUMNS = [
  "Container Size",
  "Palletized",
  "Loose cargo 1-500 pcs",
  "Loose cargo 501-1000 pcs",
  "Loose cargo 1001-1500 pcs",
  "Loose cargo 1501 or more pcs",
] as const;

export function extractDollarValue(value: string): number {
  const numeric = value.replace(/[^0-9.]/g, "");
  return parseFloat(numeric || "0");
}

export function buildPricingTermsText(): string {
  const lines: string[] = [];
  lines.push(PRICING_TERMS_NAME);
  lines.push("");
  lines.push("TRANSLOADING");
  lines.push(TRANSLOADING_COLUMNS.join(" | "));
  for (const row of PRICING_TERMS.TRANSLOADING) {
    lines.push(
      TRANSLOADING_COLUMNS.map((col) => row[col as keyof typeof row]).join(" | ")
    );
  }
  lines.push("");
  lines.push("ACCESSORIAL CHARGES");
  for (const [key, value] of Object.entries(PRICING_TERMS["ACCESSORIAL CHARGES"])) {
    lines.push(`${key}: ${value}`);
  }
  lines.push("");
  lines.push("STORAGE");
  for (const entry of PRICING_TERMS.STORAGE) {
    lines.push(entry);
  }
  lines.push("");
  lines.push("WAREHOUSING");
  for (const [key, value] of Object.entries(PRICING_TERMS.WAREHOUSING)) {
    lines.push(`${key}: ${value}`);
  }

  return lines.join("\n");
}

export function getPricingJsonString(): string {
  return JSON.stringify({ [PRICING_TERMS_NAME]: PRICING_TERMS }, null, 2);
}
