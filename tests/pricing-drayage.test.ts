import { describe, expect, it } from "vitest";
import {
  calculateDrayagePricing,
  DrayageQuoteInput,
} from "@/business/pricing";

const baseInput: DrayageQuoteInput = {
  containerSize: "40",
  containerWeightLbs: 46000,
  miles: 80,
  origin: "Pier A",
  destination: "Ontario, CA",
  shipByDate: "2025-11-20",
};

describe("calculateDrayagePricing", () => {
  it("applies weight bracket surcharges", () => {
    const result = calculateDrayagePricing({
      ...baseInput,
      containerWeightLbs: 48000,
    });

    const weightLine = result.lineItems.find((item) =>
      item.label.includes("Weight surcharge")
    );
    expect(weightLine).toBeDefined();
    expect(weightLine?.amount).toBe(350);

    // Base 80 miles @ $3.75 + $350 weight surcharge
    expect(result.total).toBeCloseTo(300 + 350, 2);
  });

  it("includes add-ons and invoice items", () => {
    const result = calculateDrayagePricing({
      ...baseInput,
      miles: 120,
      urgent: true,
      urgentWithin48Hours: true,
      extraStops: 2,
      emptyStorageDays: 3,
      storageDays: 4,
      prepullRequired: true,
      chassisSplitRequired: true,
      prepaidPierPass: true,
      tcfCharges: true,
      terminalDryRun: true,
      chassisDays: 6,
      chassisType: "wccp",
      terminalWaitingHours: 3,
      liveUnloadHours: 2,
      examinationRequired: true,
    });

    const labels = result.lineItems.map((item) => item.label);
    expect(labels).toContain("Prepaid Pier pass charges");
    expect(labels.some((label) => label.includes("Extra stop"))).toBe(true);

    const invoiceLabels = (result.invoiceItems || []).map(
      (item) => item.label
    );
    expect(invoiceLabels).toContain("Terminal Dry Run");
    expect(
      invoiceLabels.some((label) => label.includes("Live unload"))
    ).toBe(true);

    // Base miles: max(120, 50) * $3.75 = 450
    // Add-ons: hot rush 200 + chassis split 100 + prepull 150 + pier 80 + TCF 20
    // Extra stop: 2 * 50 = 100
    // Empty storage billable after 2 free days => 1 * 50
    // Storage billable after 2 free days => 2 * 50 = 100
    expect(result.total).toBeGreaterThan(450);
  });
});
