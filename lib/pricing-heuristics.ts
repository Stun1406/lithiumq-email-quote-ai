const PALLET_REGEX = /(\d[\d,]*)\s+pallets?/i;
const PIECES_REGEX = /(\d[\d,]*)\s+(?:pieces|pcs|cartons|cases)/i;
const DAYS_REGEX = /(\d[\d,]*)\s+days?/i;
const HOURS_REGEX = /(\d[\d,]*)\s+hours?/i;
const WORKERS_REGEX = /(\d[\d,]*)\s+workers?/i;
const CONTAINER_REGEX = /(20|40|45)\s*(?:['’]?|ft|foot|feet|container)/i;

function parseNumber(match: RegExpMatchArray | null) {
  if (!match?.[1]) return null;
  const cleaned = match[1].replace(/,/g, "");
  const value = parseInt(cleaned, 10);
  return Number.isFinite(value) ? value : null;
}

export function applyPricingHeuristics(
  emailText: string | null | undefined,
  normalized: Record<string, any>
) {
  if (!emailText?.trim()) return normalized;
  const lower = emailText.toLowerCase();

  if (/(shrink[-\s]?wrap|shrinkwrap)/i.test(lower)) {
    normalized.shrinkWrap = true;
  }

  if (/(weekend|sat(?:urday)?|sun(?:day)?)/i.test(lower)) {
    normalized.afterHours = "weekend";
  } else if (!normalized.afterHours && /after[-\s]?hours?/i.test(lower)) {
    normalized.afterHours = "weekday";
  }

  const dayCount = parseNumber(lower.match(DAYS_REGEX));
  if (dayCount && (!normalized.storageDays || dayCount > normalized.storageDays)) {
    normalized.storageDays = dayCount;
  }

  const palletCount = parseNumber(lower.match(PALLET_REGEX));
  if (palletCount && (!normalized.pallets || palletCount > normalized.pallets)) {
    normalized.pallets = palletCount;
  }

  const pieceCount = parseNumber(lower.match(PIECES_REGEX));
  if (pieceCount && (!normalized.pieces || pieceCount > normalized.pieces)) {
    normalized.pieces = pieceCount;
  }

  const workerCount = parseNumber(lower.match(WORKERS_REGEX));
  if (workerCount) {
    normalized.workers = workerCount;
  }

  const hourCount = parseNumber(lower.match(HOURS_REGEX));
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
