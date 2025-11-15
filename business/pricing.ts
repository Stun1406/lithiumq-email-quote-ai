export interface PricingInput {
  containerSize: "20" | "40" | "45";
  palletized: boolean;
  pieces: number;
  pallets?: number;
  shrinkWrap?: boolean;
  seal?: boolean;
  billOfLading?: boolean;
  afterHours?: "weekday" | "weekend" | null;
  heightInches?: number;
  storageDays?: number;
  workers?: number;
  extraHours?: number;
}

export function calculateTransloadingCost(data: PricingInput) {
  let baseCost = 0;
  const { containerSize, palletized, pieces } = data;

  // Base transloading cost
  if (containerSize === "20") {
    if (palletized) baseCost = 235;
    else if (pieces <= 500) baseCost = 170;
    else if (pieces <= 1000) baseCost = 230;
    else if (pieces <= 1500) baseCost = 300;
    else baseCost = 0.3 * pieces;
  } else if (containerSize === "40" || containerSize === "45") {
    if (palletized) baseCost = 335;
    else if (pieces <= 500) baseCost = 170;
    else if (pieces <= 1000) baseCost = 230;
    else if (pieces <= 1500) baseCost = 300;
    else baseCost = 0.3 * pieces;
  }

  // Accessorial charges
  let accessories = 0;
  if (data.shrinkWrap) accessories += (data.pallets ?? 0) * 15;
  // Product rule: always include seal and bill of lading fees ($5 each)
  accessories += 5; // seal
  accessories += 5; // bill of lading

  // Handling
  let handling = (data.pallets ?? 0) * 22;

  // After-hours warehouse fee
  let afterHoursFee = 0;
  if (data.afterHours === "weekday") afterHoursFee = 350;
  if (data.afterHours === "weekend") afterHoursFee = 550;

  // Storage
  let storage = 0;
  if ((data.storageDays ?? 0) > 2) {
    const weeks = Math.ceil((data.storageDays! - 2) / 7);
    storage += weeks * (data.pallets ?? 0) * 7;
  }

  // Monthly storage (optional)
  if ((data.heightInches ?? 0) > 0) {
    if (data.heightInches! <= 60) storage += (data.pallets ?? 0) * 22;
    else storage += (data.pallets ?? 0) * 34;
  }

  // Labor beyond 2 hrs
  let labor = 0;
  if ((data.extraHours ?? 0) > 0 && (data.workers ?? 0) > 0) {
    labor = data.extraHours! * data.workers! * 35;
  }

  const total =
    baseCost + accessories + handling + afterHoursFee + storage + labor;

  return {
    breakdown: {
      baseCost,
      accessories,
      handling,
      afterHoursFee,
      storage,
      labor,
    },
    total: parseFloat(total.toFixed(2)),
  };
}
