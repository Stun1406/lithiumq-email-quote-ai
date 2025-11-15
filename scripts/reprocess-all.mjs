import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: '.env.local' });

// reuse the app's Prisma client to avoid installing @prisma/client here
const fileUrl = new URL(path.resolve('./lib/prisma.js'), 'file://');
const { prisma } = await import(fileUrl.href);

function calculateTransloadingCost(data) {
  let baseCost = 0;
  const containerSize = data.containerSize;
  const palletized = data.palletized;
  const pieces = data.pieces;

  if (containerSize === '20') {
    if (palletized) baseCost = 235;
    else if (pieces <= 500) baseCost = 170;
    else if (pieces <= 1000) baseCost = 230;
    else if (pieces <= 1500) baseCost = 300;
    else baseCost = 0.3 * pieces;
  } else if (containerSize === '40' || containerSize === '45') {
    if (palletized) baseCost = 335;
    else if (pieces <= 500) baseCost = 170;
    else if (pieces <= 1000) baseCost = 230;
    else if (pieces <= 1500) baseCost = 300;
    else baseCost = 0.3 * pieces;
  }

  let accessories = 0;
  if (data.shrinkWrap) accessories += (data.pallets || 0) * 15;
  const sealFlag = data.seal ?? true;
  const bolFlag = data.billOfLading ?? true;
  if (sealFlag) accessories += 5;
  if (bolFlag) accessories += 5;

  let handling = (data.pallets || 0) * 22;

  let afterHoursFee = 0;
  if (data.afterHours === 'weekday') afterHoursFee = 350;
  if (data.afterHours === 'weekend') afterHoursFee = 550;

  let storage = 0;
  if ((data.storageDays || 0) > 2) {
    const weeks = Math.ceil((data.storageDays - 2) / 7);
    storage += weeks * (data.pallets || 0) * 7;
  }

  if ((data.heightInches || 0) > 0) {
    if (data.heightInches <= 60) storage += (data.pallets || 0) * 22;
    else storage += (data.pallets || 0) * 34;
  }

  let labor = 0;
  if ((data.extraHours || 0) > 0 && (data.workers || 0) > 0) {
    labor = data.extraHours * data.workers * 35;
  }

  const total = baseCost + accessories + handling + afterHoursFee + storage + labor;

  return {
    breakdown: { baseCost, accessories, handling, afterHoursFee, storage, labor },
    total: Number(total.toFixed(2)),
  };
}

async function run() {
  console.log('Connecting to DB...');
  const rows = await prisma.email.findMany({ select: { id: true, normalizedJson: true, inferredJson: true } });
  let updated = 0;

  for (const row of rows) {
    const stored = row.normalizedJson ?? row.inferredJson ?? {};
    const normalized = { ...stored, seal: true, billOfLading: true };
    let cost;
    try {
      cost = calculateTransloadingCost(normalized);
    } catch (e) {
      console.warn('Pricing failed for', row.id, e);
      continue;
    }

    await prisma.email.update({ where: { id: row.id }, data: { normalizedJson: normalized, quoteJson: cost } });
    updated++;
  }

  console.log('Updated', updated, 'emails');
  await prisma.$disconnect();
}

run().catch((e) => { console.error(e); process.exit(1); });
