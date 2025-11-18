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

export interface PricingLineItem {
  label: string;
  amount: number;
  category?: string;
  unit?: string | null;
  quantity?: number | null;
}

export interface DrayageQuoteInput {
  containerSize?: string | null;
  containerWeightLbs?: number | null;
  miles?: number | null;
  origin?: string | null;
  destination?: string | null;
  shipByDate?: string | null;
  urgent?: boolean | null;
  urgentWithin48Hours?: boolean | null;
  lfdHoursNotice?: number | null;
  extraStops?: number | null;
  emptyStorageDays?: number | null;
  storageDays?: number | null;
  prepullRequired?: boolean | null;
  chassisSplitRequired?: boolean | null;
  prepaidPierPass?: boolean | null;
  tcfCharges?: boolean | null;
  terminalDryRun?: boolean | null;
  reefer?: boolean | null;
  hazmat?: boolean | null;
  chassisDays?: number | null;
  chassisType?: "standard" | "wccp" | null;
  terminalWaitingHours?: number | null;
  liveUnloadHours?: number | null;
  examinationRequired?: boolean | null;
  replugRequired?: boolean | null;
  deliveryOrderCancellation?: boolean | null;
  onTimeDelivery?: boolean | null;
  failedDeliveryCityRate?: number | null;
}

export interface DrayageQuoteResult {
  serviceType: "drayage";
  total: number;
  lineItems: PricingLineItem[];
  invoiceItems: PricingLineItem[];
  metadata: {
    containerSize?: string | null;
    containerWeightLbs?: number | null;
    weightBracket?: string | null;
    chargedMiles?: number | null;
    requestedMiles?: number | null;
    ratePerMile?: number | null;
    origin?: string | null;
    destination?: string | null;
    shipByDate?: string | null;
    extraStops?: number | null;
    emptyStorageDays?: number | null;
    storageDays?: number | null;
    urgent?: boolean | null;
  };
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

  const lineItems: PricingLineItem[] = [
    { label: "Base transloading", amount: baseCost, category: "base" },
  ];
  if (accessories > 0) {
    lineItems.push({ label: "Accessories", amount: accessories, category: "accessories" });
  }
  if (handling > 0) {
    lineItems.push({ label: "Handling", amount: handling, category: "handling" });
  }
  if (afterHoursFee > 0) {
    lineItems.push({ label: "After-hours fee", amount: afterHoursFee, category: "afterHours" });
  }
  if (storage > 0) {
    lineItems.push({ label: "Storage", amount: storage, category: "storage" });
  }
  if (labor > 0) {
    lineItems.push({ label: "Labor", amount: labor, category: "labor" });
  }

  return {
    breakdown: {
      baseCost,
      accessories,
      handling,
      afterHoursFee,
      storage,
      labor,
    },
    lineItems,
    total: parseFloat(total.toFixed(2)),
  };
}

export function calculateDrayagePricing(
  input: DrayageQuoteInput
): DrayageQuoteResult {
  const drayageTerms = (PRICING_TERMS as any).DRAYAGE;
  if (!drayageTerms) {
    throw new Error("Missing DRAYAGE configuration in pricing data");
  }

  const sizeKey = normalizeContainerSize(input.containerSize) ?? "40";
  const basePerMileMap = drayageTerms.BASE_PER_MILE || {};
  const perMileRaw =
    basePerMileMap[sizeKey] ??
    basePerMileMap["40"] ??
    basePerMileMap["45"] ??
    "$0";
  const ratePerMile = extractDollarValue(perMileRaw);
  const minMiles = Number(drayageTerms.MIN_MILES_CHARGE ?? 0) || 0;
  const requestedMiles = Math.max(0, input.miles ?? 0);
  const chargedMiles = Math.max(requestedMiles || minMiles, minMiles);
  const baseAmount = parseFloat((ratePerMile * chargedMiles).toFixed(2));

  const lineItems: PricingLineItem[] = [
    {
      label: `Base drayage (${sizeKey}' · ${chargedMiles} mi @ $${ratePerMile.toFixed(
        2
      )}/mi)`,
      amount: baseAmount,
      category: "base",
      quantity: chargedMiles,
      unit: "mile",
    },
  ];
  let total = baseAmount;

  const brackets = drayageTerms.WEIGHT_BRACKETS || [];
  let bracketLabel: string | null = null;
  if (input.containerWeightLbs) {
    const bracket = pickWeightBracket(brackets, input.containerWeightLbs);
    if (bracket) {
      bracketLabel = bracket.label || null;
      const surcharge = extractDollarValue(bracket.surcharge ?? "$0");
      if (surcharge > 0) {
        total += surcharge;
        lineItems.push({
          label: `Weight surcharge (${bracket.label})`,
          amount: surcharge,
          category: "weight",
        });
      }
    }
  }

  const addOns = drayageTerms.QUOTE_ADDONS || {};
  const addFlat = (key: string, enabled: boolean | null | undefined) => {
    if (!enabled) return;
    const cfg = addOns[key];
    if (!cfg) return;
    const amount = extractDollarValue(cfg.amount ?? "$0");
    if (amount <= 0) return;
    total += amount;
    lineItems.push({
      label: cfg.label,
      amount,
      category: "add-on",
    });
  };

  if (input.prepaidPierPass) addFlat("prepaidPierPass", true);
  if (input.tcfCharges) addFlat("tcfCharges", true);
  if (input.chassisSplitRequired) addFlat("chassisSplit", true);
  if (input.prepullRequired) addFlat("prepull", true);

  const hotEligible =
    input.urgent &&
    (input.urgentWithin48Hours !== false ||
      (input.lfdHoursNotice != null && input.lfdHoursNotice < 48));
  if (hotEligible) addFlat("hotRush", true);

  const addPerUnits = (
    key: string,
    units: number | null | undefined,
    options?: { unitLabel?: string; freeUnits?: number }
  ) => {
    if (!units || units <= 0) return;
    const cfg = addOns[key];
    if (!cfg) return;
    const amount = extractDollarValue(cfg.amount ?? "$0");
    if (amount <= 0) return;
    const freeUnits = options?.freeUnits ?? cfg.freeDays ?? 0;
    const billableUnits = Math.max(0, units - (freeUnits || 0));
    if (billableUnits <= 0) return;
    const totalAmount = amount * billableUnits;
    total += totalAmount;
    lineItems.push({
      label: `${cfg.label}${
        freeUnits ? ` (after ${freeUnits} free)` : ""
      }`,
      amount: parseFloat(totalAmount.toFixed(2)),
      category: "add-on",
      unit: options?.unitLabel || cfg.per || "unit",
      quantity: billableUnits,
    });
  };

  addPerUnits("extraStop", input.extraStops, { unitLabel: "stop(s)" });
  addPerUnits("emptyStorage", input.emptyStorageDays, { unitLabel: "day(s)" });
  addPerUnits("storage", input.storageDays, { unitLabel: "day(s)" });

  const invoiceItems: PricingLineItem[] = [];
  const invoiceCfg = drayageTerms.INVOICE_ADDONS || {};
  const addInvoiceFlat = (key: string, enabled?: boolean | null) => {
    if (!enabled) return;
    const cfg = invoiceCfg[key];
    if (!cfg) return;
    const amount = extractDollarValue(cfg.amount ?? "$0");
    if (amount <= 0) return;
    invoiceItems.push({
      label: cfg.label,
      amount,
      category: "invoice",
    });
  };
  const addInvoicePerUnits = (
    key: string,
    units?: number | null,
    options?: { unitLabel?: string; freeUnits?: number; minUnits?: number }
  ) => {
    if (!units || units <= 0) return;
    const cfg = invoiceCfg[key];
    if (!cfg) return;
    const amount = extractDollarValue(cfg.amount ?? "$0");
    if (amount <= 0) return;
    const minUnits = options?.minUnits ?? cfg.minDays ?? 0;
    const normalizedUnits = Math.max(minUnits || 0, units);
    const freeUnits = options?.freeUnits ?? cfg.freeHours ?? 0;
    const billableUnits = Math.max(0, normalizedUnits - (freeUnits || 0));
    if (billableUnits <= 0) return;
    invoiceItems.push({
      label: `${cfg.label}${
        freeUnits ? ` (after ${freeUnits} free)` : ""
      }`,
      amount: parseFloat((amount * billableUnits).toFixed(2)),
      unit: options?.unitLabel || cfg.per || "unit",
      quantity: billableUnits,
      category: "invoice",
    });
  };

  addInvoiceFlat("terminalDryRun", input.terminalDryRun);
  addInvoicePerUnits(
    input.chassisType === "wccp" ? "chassisWccp" : "chassisStandard",
    input.chassisDays,
    { unitLabel: "day(s)" }
  );
  addInvoicePerUnits("terminalWaiting", input.terminalWaitingHours, {
    unitLabel: "hour(s)",
    freeUnits: invoiceCfg.terminalWaiting?.freeHours,
  });
  addInvoicePerUnits("liveUnload", input.liveUnloadHours, {
    unitLabel: "hour(s)",
    freeUnits: invoiceCfg.liveUnload?.freeHours,
  });
  addInvoiceFlat("examinationFee", input.examinationRequired);
  addInvoiceFlat("replug", input.replugRequired);
  addInvoiceFlat("doCancellation", input.deliveryOrderCancellation);
  addInvoiceFlat("onTimeDelivery", input.onTimeDelivery);

  if (input.failedDeliveryCityRate) {
    const cfg = invoiceCfg.failedDelivery;
    if (cfg) {
      const amount = Math.max(0, (input.failedDeliveryCityRate ?? 0) - 100);
      if (amount > 0) {
        invoiceItems.push({
          label: cfg.label,
          amount: parseFloat(amount.toFixed(2)),
          category: "invoice",
        });
      }
    }
  }

  return {
    serviceType: "drayage",
    total: parseFloat(total.toFixed(2)),
    lineItems,
    invoiceItems,
    metadata: {
      containerSize: sizeKey,
      containerWeightLbs: input.containerWeightLbs ?? null,
      weightBracket: bracketLabel,
      chargedMiles,
      requestedMiles,
      ratePerMile,
      origin: input.origin ?? null,
      destination: input.destination ?? null,
      shipByDate: input.shipByDate ?? null,
      extraStops: input.extraStops ?? null,
      emptyStorageDays: input.emptyStorageDays ?? null,
      storageDays: input.storageDays ?? null,
      urgent: input.urgent ?? null,
    },
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

function normalizeContainerSize(value?: string | null) {
  if (!value) return null;
  const match = value.toString().match(/\d+/);
  return match ? match[0] : null;
}

function pickWeightBracket(brackets: any[], weight: number) {
  if (!Array.isArray(brackets)) return null;
  return (
    brackets.find((bracket) => {
      const min = bracket.min ?? 0;
      const max = bracket.max ?? null;
      if (weight < min) return false;
      if (max !== null && weight > max) return false;
      return true;
    }) || null
  );
}
