import dotenv from "dotenv";
import path from "path";
import { createRequire } from "module";
import { PrismaClient } from "@prisma/client";
const require = createRequire(import.meta.url);
const pricingData = require("../business/pricing-data.json");

dotenv.config({ path: ".env.local" });

const prisma = new PrismaClient();

const PRICING_TERMS_NAME = "FL Distribution LLC Warehouse Rates";
const PRICING_TERMS = pricingData[PRICING_TERMS_NAME];
const LOOSE_KEYS = [
  "Loose cargo 1-500 pcs",
  "Loose cargo 501-1000 pcs",
  "Loose cargo 1001-1500 pcs",
  "Loose cargo 1501 or more pcs",
];

const TRANSLOADING_RATES = PRICING_TERMS.TRANSLOADING.map((row) => ({
  containers: parseContainerTokens(row["Container Size"]),
  palletized: extractDollarValue(row["Palletized"]),
  looseTiers: LOOSE_KEYS.map((key) => parseLooseTier(key, row[key])),
}));

const ACCESSORIES = PRICING_TERMS["ACCESSORIAL CHARGES"];
const shrinkWrapRate = extractDollarValue(ACCESSORIES["Palletize + Shrink Wrap"]);
const sealRate = extractDollarValue(ACCESSORIES["Seal"]);
const billOfLadingRate = extractDollarValue(ACCESSORIES["Bill of Lading"]);

const WAREHOUSING = PRICING_TERMS.WAREHOUSING;
const handlingPerPallet = extractDollarValue(WAREHOUSING["Handling in and out per pallet"]);
const afterHoursWeekday = extractDollarValue(WAREHOUSING["Warehouse after hours open fee (Mon-Fri)"]);
const afterHoursWeekend = extractDollarValue(WAREHOUSING["Warehouse open fee (Sat-Sun)"]);
const monthlyStorageUnder = extractDollarValue(WAREHOUSING["Monthly storage per pallet (40x48x60 and under)"]);
const monthlyStorageOver = extractDollarValue(WAREHOUSING["Monthly storage per pallet (40x48x61 and over)"]);

const weeklyStorageLine = PRICING_TERMS.STORAGE.find((line) => line.includes("$7.00")) || "";
const weeklyStoragePerPallet = extractDollarValue(weeklyStorageLine);
const laborLine = PRICING_TERMS.STORAGE.find((line) => line.includes("$35")) || "";
const laborRate = extractDollarValue(laborLine);
const freeHoursLine = PRICING_TERMS.STORAGE.find((line) => line.includes("48 hrs")) || "";
const freeHours = parseInt(freeHoursLine.match(/\d+/)?.[0] ?? "48", 10);
const FREE_DAYS = Math.floor(freeHours / 24);
const WEEKLY_THRESHOLD_DAYS = FREE_DAYS + 7;

function calculateTransloadingCost(data) {
  const { containerSize, palletized, pieces } = data;
  const pallets = data.pallets || 0;
  const row = findTransloadingRow(containerSize);

  let baseCost = 0;
  if (palletized) {
    baseCost = row.palletized;
  } else {
    const tier = pickLooseTier(row.looseTiers, pieces);
    baseCost = tier.perPiece ? tier.amount * pieces : tier.amount;
  }

  let accessories = 0;
  if (data.shrinkWrap) accessories += pallets * shrinkWrapRate;
  if (data.seal !== false) accessories += sealRate;
  if (data.billOfLading !== false) accessories += billOfLadingRate;

  const handling = pallets * handlingPerPallet;

  let afterHoursFee = 0;
  if (data.afterHours === "weekday") afterHoursFee = afterHoursWeekday;
  if (data.afterHours === "weekend") afterHoursFee = afterHoursWeekend;

  const storageDays = data.storageDays || 0;
  let storage = 0;
  if (storageDays > FREE_DAYS && pallets > 0) {
    const billableDays = storageDays - FREE_DAYS;
    const weeks = Math.min(1, Math.ceil(billableDays / 7));
    storage += weeks * pallets * weeklyStoragePerPallet;

    if (storageDays > WEEKLY_THRESHOLD_DAYS) {
      const monthlyDays = storageDays - WEEKLY_THRESHOLD_DAYS;
      const months = Math.max(1, Math.ceil(monthlyDays / 30));
      const height = data.heightInches || 0;
      const monthlyRate = height > 60 ? monthlyStorageOver : monthlyStorageUnder;
      storage += months * pallets * monthlyRate;
    }
  }

  let labor = 0;
  if ((data.extraHours || 0) > 0 && (data.workers || 0) > 0) {
    labor = data.extraHours * data.workers * laborRate;
  }

  const total = baseCost + accessories + handling + afterHoursFee + storage + labor;

  return {
    breakdown: { baseCost, accessories, handling, afterHoursFee, storage, labor },
    total: Number(total.toFixed(2)),
  };
}

async function run() {
  console.log("Connecting to DB...");
  const rows = await prisma.email.findMany({
    select: { id: true, normalizedJson: true, inferredJson: true, body: true },
  });
  let updated = 0;

  for (const row of rows) {
    const stored = row.normalizedJson ?? row.inferredJson ?? {};
    const normalized = { ...stored, seal: true, billOfLading: true };
    applyPricingHeuristics(row.body || "", normalized);
    let cost;
    try {
      cost = calculateTransloadingCost(normalized);
    } catch (e) {
      console.warn("Pricing failed for", row.id, e);
      continue;
    }

    await prisma.email.update({
      where: { id: row.id },
      data: { normalizedJson: normalized, quoteJson: cost },
    });
    updated++;
  }

  console.log("Updated", updated, "emails");
  await prisma.$disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

function extractDollarValue(value) {
  const numeric = String(value).replace(/[^0-9.]/g, "");
  return parseFloat(numeric || "0");
}

function parseContainerTokens(value) {
  return value
    .split("/")
    .map((token) => token.replace(/\D/g, ""))
    .filter(Boolean);
}

function parseLooseTier(label, amount) {
  const numbers = label.match(/\d+/g)?.map(Number) ?? [];
  let min = numbers[0] ?? 0;
  if (label.includes("1-")) min = 0;
  const max = label.includes("or more") ? null : numbers[1] ?? null;
  return {
    key: label,
    min,
    max,
    amount: extractDollarValue(amount),
    perPiece: /per pc/i.test(amount),
  };
}

function findTransloadingRow(containerSize) {
  const normalized = String(containerSize || "").replace(/\D/g, "");
  const row = TRANSLOADING_RATES.find((entry) => entry.containers.includes(normalized));
  if (!row) throw new Error(`Unsupported container size: ${containerSize}`);
  return row;
}

function pickLooseTier(tiers, pieces) {
  const normalizedPieces = Math.max(0, pieces || 0);
  return (
    tiers.find(
      (tier) =>
        normalizedPieces >= tier.min && (tier.max === null || normalizedPieces <= tier.max)
    ) || tiers[tiers.length - 1]
  );
}

const PALLET_REGEX = /(\d[\d,]*)\s+pallets?/i;
const PIECES_REGEX = /(\d[\d,]*)\s+(?:pieces|pcs|cartons|cases)/i;
const DAYS_REGEX = /(\d[\d,]*)\s+days?/i;
const HOURS_REGEX = /(\d[\d,]*)\s+hours?/i;
const WORKERS_REGEX = /(\d[\d,]*)\s+workers?/i;
const CONTAINER_REGEX = /(20|40|45)\s*(?:['’]?|ft|foot|feet|container)/i;

function parseCount(match) {
  if (!match || !match[1]) return null;
  const cleaned = match[1].replace(/,/g, "");
  const value = parseInt(cleaned, 10);
  return Number.isFinite(value) ? value : null;
}

function applyPricingHeuristics(emailText, normalized) {
  if (!emailText || !emailText.trim()) return normalized;
  const lower = emailText.toLowerCase();

  if (/(shrink[-\s]?wrap|shrinkwrap)/i.test(lower)) {
    normalized.shrinkWrap = true;
  }

  if (/(weekend|sat(?:urday)?|sun(?:day)?)/i.test(lower)) {
    normalized.afterHours = "weekend";
  } else if (!normalized.afterHours && /after[-\s]?hours?/i.test(lower)) {
    normalized.afterHours = "weekday";
  }

  const dayCount = parseCount(lower.match(DAYS_REGEX));
  if (dayCount && (!normalized.storageDays || dayCount > normalized.storageDays)) {
    normalized.storageDays = dayCount;
  }

  const palletCount = parseCount(lower.match(PALLET_REGEX));
  if (palletCount && (!normalized.pallets || palletCount > normalized.pallets)) {
    normalized.pallets = palletCount;
  }

  const pieceCount = parseCount(lower.match(PIECES_REGEX));
  if (pieceCount && (!normalized.pieces || pieceCount > normalized.pieces)) {
    normalized.pieces = pieceCount;
  }

  const workerCount = parseCount(lower.match(WORKERS_REGEX));
  if (workerCount) {
    normalized.workers = workerCount;
  }

  const hourCount = parseCount(lower.match(HOURS_REGEX));
  if (hourCount && hourCount > (normalized.extraHours ?? 0)) {
    normalized.extraHours = hourCount;
  }

  const containerMatch = lower.match(CONTAINER_REGEX);
  if (containerMatch && containerMatch[1]) {
    normalized.containerSize = containerMatch[1];
  }

  if (/(palletized|palletised)/i.test(lower)) {
    normalized.palletized = true;
  }

  return normalized;
}
