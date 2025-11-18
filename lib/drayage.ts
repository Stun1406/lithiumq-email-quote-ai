import type { DrayageQuoteInput } from "@/business/pricing";

export type ServiceType = "transloading" | "drayage";

const DRAYAGE_KEYWORDS =
  /drayage|pier\s?pass|lfd|prepull|terminal|container\s?truck|chassis/i;

export function determineServiceType(
  extracted: Record<string, any>,
  emailText?: string | null
): ServiceType {
  const explicit =
    extracted?.service_type ||
    extracted?.serviceType ||
    extracted?.mode ||
    extracted?.shipment_type;
  if (typeof explicit === "string") {
    const normalized = explicit.toLowerCase();
    if (normalized.includes("drayage")) return "drayage";
    if (normalized.includes("transload")) return "transloading";
  }

  if (
    extracted?.drayage ||
    extracted?.container_weight_lbs ||
    extracted?.miles_to_travel
  ) {
    return "drayage";
  }

  if (emailText && DRAYAGE_KEYWORDS.test(emailText)) {
    return "drayage";
  }

  return "transloading";
}

export function buildDrayageInput(
  extracted: Record<string, any>,
  normalized?: Record<string, any>
): DrayageQuoteInput {
  const drayage = extracted?.drayage || {};
  const invoice = drayage.invoice || {};
  const fallbackSize =
    normalized?.containerSize ||
    normalizeSize(extracted?.container_size) ||
    null;

  const pick = (...values: any[]) => values.find((v) => v != null && v !== "");

  return {
    containerSize:
      normalizeSize(drayage.container_size) ||
      normalizeSize(extracted?.drayage_container_size) ||
      fallbackSize,
    containerWeightLbs:
      toNumber(drayage.container_weight_lbs) ||
      toNumber(extracted?.container_weight_lbs) ||
      null,
    miles:
      toNumber(drayage.miles) ||
      toNumber(drayage.miles_to_travel) ||
      toNumber(extracted?.miles_to_travel) ||
      toNumber(extracted?.miles) ||
      null,
    origin:
      pick(drayage.origin, drayage.origin_city, extracted?.origin) || null,
    destination:
      pick(
        drayage.destination,
        drayage.destination_city,
        extracted?.destination
      ) || null,
    shipByDate:
      drayage.ship_by_date ||
      drayage.requested_ship_by ||
      extracted?.requested_ship_by ||
      null,
    urgent: coerceBool(drayage.urgent ?? extracted?.urgent),
    urgentWithin48Hours: coerceBool(
      pick(
        drayage.urgent_within_48h,
        drayage.within_48_hours,
        extracted?.urgent_within_48h
      )
    ),
    lfdHoursNotice:
      toNumber(drayage.hours_before_lfd) ||
      toNumber(extracted?.hours_before_lfd) ||
      null,
    extraStops:
      toNumber(drayage.extra_stops) || toNumber(extracted?.extra_stops) || null,
    emptyStorageDays:
      toNumber(drayage.empty_storage_days) ||
      toNumber(extracted?.empty_storage_days) ||
      null,
    storageDays:
      toNumber(drayage.storage_days) ||
      toNumber(extracted?.storage_days) ||
      null,
    prepullRequired: coerceBool(
      pick(drayage.prepull_required, extracted?.prepull_required)
    ),
    chassisSplitRequired: coerceBool(
      pick(drayage.chassis_split_required, extracted?.chassis_split_required)
    ),
    prepaidPierPass: coerceBool(
      pick(drayage.prepaid_pier_pass, extracted?.prepaid_pier_pass)
    ),
    tcfCharges: coerceBool(pick(drayage.tcf_charges, extracted?.tcf_charges)),
    terminalDryRun: coerceBool(
      pick(drayage.terminal_dry_run, extracted?.terminal_dry_run)
    ),
    reefer: coerceBool(pick(drayage.reefer, extracted?.reefer)),
    hazmat: coerceBool(pick(drayage.hazmat, extracted?.hazmat)),
    chassisDays:
      toNumber(drayage.chassis_days) || toNumber(invoice.chassis_days) || null,
    chassisType: detectChassisType(
      pick(
        drayage.chassis_type,
        invoice.chassis_type,
        extracted?.chassis_type
      )
    ),
    terminalWaitingHours:
      toNumber(drayage.terminal_waiting_hours) ||
      toNumber(invoice.terminal_waiting_hours) ||
      null,
    liveUnloadHours:
      toNumber(drayage.live_unload_hours) ||
      toNumber(invoice.live_unload_hours) ||
      null,
    examinationRequired: coerceBool(
      pick(drayage.examination_fee, invoice.examination_fee)
    ),
    replugRequired: coerceBool(
      pick(drayage.replug_required, invoice.replug_required)
    ),
    deliveryOrderCancellation: coerceBool(
      pick(
        drayage.delivery_order_cancellation,
        invoice.delivery_order_cancellation
      )
    ),
    onTimeDelivery: coerceBool(
      pick(drayage.on_time_delivery, invoice.on_time_delivery)
    ),
    failedDeliveryCityRate:
      toNumber(drayage.failed_delivery_city_rate) ||
      toNumber(invoice.failed_delivery_city_rate) ||
      null,
  };
}

export function validateDrayageInput(
  input: DrayageQuoteInput
): string[] {
  const missing: string[] = [];
  if (!input.containerSize) missing.push("container size");
  if (!input.containerWeightLbs) missing.push("container weight (lbs)");
  if (!input.origin) missing.push("origin location");
  if (!input.destination) missing.push("destination location");
  if (!input.miles) missing.push("miles to travel");
  if (!input.shipByDate) missing.push("requested ship-by date");
  return missing;
}

function normalizeSize(value?: string | null) {
  if (!value) return null;
  const match = value.toString().match(/\d+/);
  return match ? match[0] : null;
}

function toNumber(value: any): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value.replace(/[^0-9.-]/g, "") || "");
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function coerceBool(value: any): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  if (typeof value === "string") {
    return /^(true|yes|y|1|on)$/i.test(value.trim());
  }
  return false;
}

function detectChassisType(value: any): "standard" | "wccp" | null {
  if (!value) return null;
  return value.toString().toLowerCase().includes("wccp") ? "wccp" : "standard";
}
