import { describe, expect, it } from "vitest";
import fixture from "./fixtures/drayage-extracted.json";
import {
  determineServiceType,
  buildDrayageInput,
  validateDrayageInput,
} from "@/lib/drayage";

describe("drayage fixture normalization", () => {
  it("derives drayage inputs from extracted payload", () => {
    const normalized: Record<string, any> = {
      containerSize: "40",
      palletized: false,
      pieces: null,
    };

    const serviceType = determineServiceType(fixture, "Sample drayage email");
    expect(serviceType).toBe("drayage");

    const drayageInput = buildDrayageInput(fixture as any, normalized);
    expect(validateDrayageInput(drayageInput)).toHaveLength(0);
    expect(drayageInput.miles).toBe(62);
    expect(drayageInput.extraStops).toBe(1);
    expect(drayageInput.prepullRequired).toBe(true);
    expect(drayageInput.urgentWithin48Hours).toBe(true);
  });
});
