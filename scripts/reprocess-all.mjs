import dotenv from "dotenv";
import path from "path";
import { createRequire } from "module";
import { PrismaClient } from "@prisma/client";
const require = createRequire(import.meta.url);
const pricing = require("../business/pricing");
const { determineServiceType, buildDrayageInput, validateDrayageInput } = require("../lib/drayage");
const pricingData = require("../business/pricing-data.json");

dotenv.config({ path: ".env.local" });

const prisma = new PrismaClient();

const PRICING_TERMS_NAME = "FL Distribution LLC Warehouse Rates";
const PRICING_TERMS = pricingData[PRICING_TERMS_NAME];

async function run() {
  console.log("Connecting to DB...");
  const rows = await prisma.email.findMany({
    select: {
      id: true,
      normalizedJson: true,
      inferredJson: true,
      extractedJson: true,
      quoteJson: true,
      aiResponse: true,
      body: true,
    },
  });
  let updated = 0;

  for (const row of rows) {
    const storedNormalized = row.normalizedJson ?? {};
    const inferred = row.inferredJson ?? {};
    const extracted = row.extractedJson ?? {};

    const normalized = {
      ...storedNormalized,
    };
    let serviceType =
      normalized.serviceType ||
      storedNormalized.serviceType ||
      inferred?.serviceType ||
      "transloading";
    if (!serviceType || serviceType === "both") {
      serviceType = determineServiceType(extracted, row.body);
    }
    normalized.serviceType = serviceType;
    if (serviceType !== "drayage") {
      normalized.seal = normalized.seal ?? true;
      normalized.billOfLading = normalized.billOfLading ?? true;
    }

    const drayageInput = buildDrayageInput(extracted, normalized);
    normalized.drayage = drayageInput;

    let quotePayload: any;
    if (serviceType === "drayage") {
      const missing = validateDrayageInput(drayageInput);
      if (missing.length > 0) {
        console.warn(`Skipping ${row.id} - missing drayage fields: ${missing.join(", ")}`);
        continue;
      }
      try {
        quotePayload = pricing.calculateDrayagePricing(drayageInput);
      } catch (e) {
        console.warn("Drayage pricing failed for", row.id, e);
        continue;
      }
    } else {
      applyPricingHeuristics(row.body || "", normalized);
      try {
        quotePayload = {
          serviceType: "transloading",
          ...pricing.calculateTransloadingCost(normalized),
          pricingTerms: pricing.buildPricingTermsText
            ? pricing.buildPricingTermsText()
            : null,
        };
      } catch (e) {
        console.warn("Transloading pricing failed for", row.id, e);
        continue;
      }
    }

    const footer =
      serviceType === "drayage"
        ? buildDrayageFooter(quotePayload)
        : buildTransloadingFooter(quotePayload);
    const newDraft = `${row.aiResponse || "(no draft)"}\n\n${footer}`.trim();

    await prisma.email.update({
      where: { id: row.id },
      data: {
        normalizedJson: normalized,
        quoteJson: quotePayload,
        inferredJson: {
          ...(row.inferredJson || {}),
          drayage: drayageInput,
        },
        aiResponse: newDraft,
      },
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
