import { render, screen } from "@testing-library/react";
import PricingBreakdownTable from "@/components/PricingBreakdownTable";
import { describe, expect, it } from "vitest";

describe("PricingBreakdownTable", () => {
  it("renders drayage line and invoice items", () => {
    render(
      <PricingBreakdownTable
        quote={{
          total: 950,
          lineItems: [
            { label: "Base drayage (40' · 120 mi @ $3.75/mi)", amount: 450 },
            { label: "Weight surcharge (47k-50k lbs)", amount: 350 },
            { label: "Prepaid Pier pass charges", amount: 80 },
          ],
          invoiceItems: [
            { label: "Terminal Dry Run", amount: 10 },
            { label: "Live unload (after 1 free hour)", amount: 85 },
          ],
        }}
        note="Pricing synced from drayage calculator"
      />
    );

    expect(
      screen.getByText("Base drayage (40' · 120 mi @ $3.75/mi)")
    ).toBeInTheDocument();
    expect(screen.getByText("Terminal Dry Run")).toBeInTheDocument();
    expect(screen.getByText("Invoice-only charges")).toBeInTheDocument();
    expect(screen.getByText("Pricing synced from drayage calculator")).toBeInTheDocument();
  });

  it("falls back to classic breakdown labels", () => {
    render(
      <PricingBreakdownTable
        quote={{
          total: 300,
          breakdown: {
            baseCost: 200,
            handling: 100,
          },
        }}
        note={null}
      />
    );

    expect(screen.getByText("Base transloading")).toBeInTheDocument();
    expect(screen.queryByText("Invoice-only charges")).not.toBeInTheDocument();
  });
});
