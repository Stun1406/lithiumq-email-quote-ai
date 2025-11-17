import {
  PRICING_TERMS,
  extractDollarValue,
} from "./pricing-data";

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

const LOOSE_KEYS = [
  "Loose cargo 1-500 pcs",
  "Loose cargo 501-1000 pcs",
  "Loose cargo 1001-1500 pcs",
  "Loose cargo 1501 or more pcs",
] as const;

type LooseKey = typeof LOOSE_KEYS[number];

interface LooseTier {
  key: LooseKey;
  min: number;
  max: number | null;
  amount: number;
  perPiece: boolean;
}

interface TransloadingRateRow {
  containers: string[];
  palletized: number;
  looseTiers: LooseTier[];
}

const TRANSLOADING_RATES: TransloadingRateRow[] = PRICING_TERMS.TRANSLOADING.map(
  (row) => ({
    containers: parseContainerTokens(row["Container Size"]),
    palletized: extractDollarValue(row["Palletized"]),
    looseTiers: LOOSE_KEYS.map((key) => parseLooseTier(key, row[key])),
  })
);

const ACCESSORY_RATES = PRICING_TERMS["ACCESSORIAL CHARGES"];
const shrinkWrapRate = extractDollarValue(
  ACCESSORY_RATES["Palletize + Shrink Wrap"]
);
const sealRate = extractDollarValue(ACCESSORY_RATES["Seal"]);
const billOfLadingRate = extractDollarValue(ACCESSORY_RATES["Bill of Lading"]);

const WAREHOUSING = PRICING_TERMS["WAREHOUSING"];
const handlingPerPallet = extractDollarValue(
  WAREHOUSING["Handling in and out per pallet"]
);
const afterHoursWeekday = extractDollarValue(
  WAREHOUSING["Warehouse after hours open fee (Mon-Fri)"]
);
const afterHoursWeekend = extractDollarValue(
  WAREHOUSING["Warehouse open fee (Sat-Sun)"]
);
const monthlyStorageUnder = extractDollarValue(
  WAREHOUSING["Monthly storage per pallet (40x48x60 and under)"]
);
const monthlyStorageOver = extractDollarValue(
  WAREHOUSING["Monthly storage per pallet (40x48x61 and over)"]
);

const weeklyStorageLine =
  PRICING_TERMS.STORAGE.find((line) => line.includes("$7.00")) ?? "";
const weeklyStoragePerPallet = extractDollarValue(weeklyStorageLine);

const laborLine =
  PRICING_TERMS.STORAGE.find((line) => line.includes("$35")) ?? "";
const laborRate = extractDollarValue(laborLine);

const freeHoursLine =
  PRICING_TERMS.STORAGE.find((line) => line.includes("48 hrs")) ?? "";
const freeHours = parseInt(freeHoursLine.match(/\d+/)?.[0] ?? "48", 10);
const FREE_DAYS = Math.floor(freeHours / 24);
const WEEKLY_THRESHOLD_DAYS = FREE_DAYS + 7;

export function calculateTransloadingCost(data: PricingInput) {
  const { containerSize, palletized, pieces } = data;
  const pallets = data.pallets ?? 0;

  const transloadingRow = findTransloadingRow(containerSize);

  let baseCost = 0;
  if (palletized) {
    baseCost = transloadingRow.palletized;
  } else {
    const tier = pickLooseTier(transloadingRow.looseTiers, pieces);
    baseCost = tier.perPiece ? tier.amount * pieces : tier.amount;
  }

  let accessories = 0;
  if (data.shrinkWrap) accessories += pallets * shrinkWrapRate;
  // product rule: seal + bill of lading always apply unless explicitly disabled
  if (data.seal !== false) accessories += sealRate;
  if (data.billOfLading !== false) accessories += billOfLadingRate;

  const handling = pallets * handlingPerPallet;

  let afterHoursFee = 0;
  if (data.afterHours === "weekday") afterHoursFee = afterHoursWeekday;
  if (data.afterHours === "weekend") afterHoursFee = afterHoursWeekend;

  const storageDays = data.storageDays ?? 0;
  let storage = 0;
  if (storageDays > FREE_DAYS && pallets > 0) {
    const billableDays = storageDays - FREE_DAYS;
    const weeks = Math.min(1, Math.ceil(billableDays / 7));
    storage += weeks * pallets * weeklyStoragePerPallet;

    if (storageDays > WEEKLY_THRESHOLD_DAYS) {
      const monthlyDays = storageDays - WEEKLY_THRESHOLD_DAYS;
      const months = Math.max(1, Math.ceil(monthlyDays / 30));
      const height = data.heightInches ?? 0;
      const monthlyRate = height > 60 ? monthlyStorageOver : monthlyStorageUnder;
      storage += months * pallets * monthlyRate;
    }
  }

  let labor = 0;
  if ((data.extraHours ?? 0) > 0 && (data.workers ?? 0) > 0) {
    labor = data.extraHours! * data.workers! * laborRate;
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

function parseContainerTokens(value: string): string[] {
  return value
    .split("/")
    .map((token) => token.replace(/\D/g, ""))
    .filter(Boolean);
}

function parseLooseTier(label: LooseKey, value: string): LooseTier {
  const numbers = label.match(/\d+/g)?.map(Number) ?? [];
  let min = numbers[0] ?? 0;
  if (label.includes("1-")) {
    min = 0;
  }
  const max = label.includes("or more") ? null : numbers[1] ?? null;
  return {
    key: label,
    min,
    max,
    amount: extractDollarValue(value),
    perPiece: /per pc/i.test(value),
  };
}

function findTransloadingRow(containerSize: PricingInput["containerSize"]) {
  const normalized = containerSize.replace(/\D/g, "");
  const row = TRANSLOADING_RATES.find((entry) =>
    entry.containers.includes(normalized)
  );

  if (!row) {
    throw new Error(`Unsupported container size: ${containerSize}`);
  }

  return row;
}

function pickLooseTier(tiers: LooseTier[], pieces: number) {
  const normalizedPieces = Math.max(0, pieces);
  return (
    tiers.find(
      (tier) =>
        normalizedPieces >= tier.min &&
        (tier.max === null || normalizedPieces <= tier.max)
    ) ?? tiers[tiers.length - 1]
  );
}
