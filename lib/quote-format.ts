import { PRICING_TERMS } from "@/business/pricing-data";
import type { PricingLineItem } from "@/business/pricing";

export function buildTransloadingFooter(cost?: { total?: number | null }) {
  if (!cost || typeof cost.total !== "number") return "";
  const sealText = PRICING_TERMS["ACCESSORIAL CHARGES"]["Seal"];
  const bolText = PRICING_TERMS["ACCESSORIAL CHARGES"]["Bill of Lading"];
  return `\n\n--PRICE-FOOTER--\nPricing (computed): Total: $${cost.total.toFixed(
    2
  )}\nIncludes: Seal ${sealText}, Bill of Lading ${bolText}\n`;
}

export function buildDrayageFooter(options?: {
  total?: number | null;
  lineItems?: PricingLineItem[];
}) {
  if (!options || typeof options.total !== "number") return "";
  const summary = (options.lineItems || [])
    .map(
      (item) => `${item.label}: $${Number(item.amount || 0).toFixed(2)}`
    )
    .join("; ");
  return `\n\n--PRICE-FOOTER--\nDrayage pricing (computed): Total: $${options.total.toFixed(
    2
  )}\n${summary}\n`;
}
