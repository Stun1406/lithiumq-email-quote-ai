import { NextResponse, NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";
import {
  calculateTransloadingCost,
  calculateDrayagePricing,
} from "@/business/pricing";
import {
  deriveSenderContactDetails,
  formatSenderContactBlock,
} from "@/lib/contact-info";
import {
  determineServiceType,
  buildDrayageInput,
  validateDrayageInput,
} from "@/lib/drayage";
import { formatQuoteTable } from "@/lib/quote-table";
import {
  buildDrayageFooter,
  buildTransloadingFooter,
} from "@/lib/quote-format";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

interface Params {
  params: { id: string };
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;

    const email = await prisma.email.findUnique({
      where: { id },
    });

    if (!email) {
      return NextResponse.json(
        { error: "Email not found" },
        { status: 404 }
      );
    }

    // Helper for logs
    const addLog = (type: string, message: string) =>
      prisma.emailLog.create({
        data: { emailId: email.id, type: type as any, message },
      });

    await addLog("update", "Reprocessing email with AI.");

    // --------------------------------------------------------
    // 1. AI Extraction
    // --------------------------------------------------------
    const extractionPrompt = `
Extract logistics shipment details from this email:

${email.body}

Return ONLY valid JSON with:
{
  "quantity": number | null,
  "palletized": boolean | null,
  "pallet_size": "40x48" | "48x48" | "euro" | null,
  "container_size": "20ft" | "40ft" | "45ft" | "53ft" | null,
  "fragile": boolean | null,
  "temperature_controlled": boolean | null,
  "hazmat": boolean | null,
  "urgent": boolean | null,
  "service_type": "transloading" | "drayage" | "both" | null,
  "origin": string | null,
  "destination": string | null,
  "special_instructions": string | null,
  "requested_ship_by": string | null,
  "container_weight_lbs": number | null,
  "miles_to_travel": number | null,
  "extra_stops": number | null,
  "empty_storage_days": number | null,
  "storage_days": number | null,
  "prepull_required": boolean | null,
  "chassis_split_required": boolean | null,
  "prepaid_pier_pass": boolean | null,
  "tcf_charges": boolean | null,
  "terminal_dry_run": boolean | null,
  "terminal_waiting_hours": number | null,
  "live_unload_hours": number | null,
  "chassis_days": number | null,
  "chassis_type": string | null,
  "examination_fee": boolean | null,
  "replug_required": boolean | null,
  "delivery_order_cancellation": boolean | null,
  "on_time_delivery": boolean | null,
  "failed_delivery_city_rate": number | null,
  "contact_name": string | null,
  "company_name": string | null,
  "phone": string | null,
  "email": string | null,
  "drayage": {
    "container_size": string | null,
    "container_weight_lbs": number | null,
    "miles": number | null,
    "origin": string | null,
    "destination": string | null,
    "ship_by_date": string | null,
    "urgent_within_48h": boolean | null,
    "hours_before_lfd": number | null,
    "extra_stops": number | null,
    "empty_storage_days": number | null,
    "storage_days": number | null,
    "prepull_required": boolean | null,
    "chassis_split_required": boolean | null,
    "prepaid_pier_pass": boolean | null,
    "tcf_charges": boolean | null,
    "terminal_dry_run": boolean | null,
    "chassis_days": number | null,
    "chassis_type": string | null,
    "terminal_waiting_hours": number | null,
    "live_unload_hours": number | null,
    "examination_fee": boolean | null,
    "replug_required": boolean | null,
    "delivery_order_cancellation": boolean | null,
    "on_time_delivery": boolean | null,
    "failed_delivery_city_rate": number | null,
    "invoice": {
      "terminal_waiting_hours": number | null,
      "live_unload_hours": number | null,
      "chassis_days": number | null
    }
  }
}
`;

    const extractionResponse = await client.responses.create({
      model: "gpt-4.1-mini",
      input: extractionPrompt,
    });
    const rawExtracted =
      // @ts-ignore - response typing is varied; guard defensively
      (extractionResponse as any).output?.[0]?.content?.[0]?.text
        ?.replace(/```json/gi, "")
        ?.replace(/```/g, "")
        ?.trim() || "";

    const extractedJson = rawExtracted ? JSON.parse(rawExtracted) : {};

    await addLog("extraction", JSON.stringify(extractedJson, null, 2));

    // --------------------------------------------------------
    // 2. Normalize
    // --------------------------------------------------------
    const normalized = {
      containerSize: extractedJson.container_size?.replace("ft", "") || null,
      palletized: extractedJson.palletized ?? null,
      pieces: extractedJson.quantity ?? null,
      pallets: extractedJson.quantity
        ? Math.ceil(extractedJson.quantity / 40)
        : null,
      shrinkWrap: extractedJson.fragile ? true : false,
      seal: false,
      billOfLading: false,
      afterHours: extractedJson.urgent ? "weekday" : null,
      heightInches: null,
      storageDays: null,
      workers: extractedJson.urgent ? 2 : 1,
      extraHours: extractedJson.urgent ? 1 : 0,
    };

    await addLog("normalization", JSON.stringify(normalized, null, 2));

    const serviceType = determineServiceType(extractedJson, email.body);
    const drayageInput = buildDrayageInput(extractedJson, normalized);
    normalized.serviceType = serviceType;
    normalized.drayage = drayageInput;

    const existingInferred =
      email.inferredJson && typeof email.inferredJson === "object"
        ? { ...(email.inferredJson as Record<string, any>) }
        : {};
    const contactDetails =
      existingInferred.contactDetails ||
      deriveSenderContactDetails({
        emailText: email.body,
        senderEmail: email.senderEmail,
        extractedContact: extractedJson,
      });

    const missing =
      serviceType === "drayage"
        ? validateDrayageInput(drayageInput)
        : ["containerSize", "palletized", "pieces"].filter(
            (k) => !normalized[k]
          );

    if (missing.length > 0) {
      const clarificationEmail = `
Dear Customer,

Thank you for your inquiry.

Before we can prepare your detailed ${
        serviceType === "drayage" ? "drayage" : "transloading"
      } quotation, could you please confirm the following information:

Missing: ${missing.join(", ")}

Once received, we will prepare your updated quote immediately.

Warm regards,
Logistics Team
LithiumQ
`.trim();

      const clarificationWithContact = `${clarificationEmail}\n\n${formatSenderContactBlock(
        contactDetails
      )}`;

      await prisma.email.update({
        where: { id: email.id },
        data: {
          status: "needs_clarification",
          extractedJson,
          normalizedJson: normalized,
          inferredJson: {
            ...existingInferred,
            contactDetails,
            drayage: drayageInput,
          },
          aiResponse: clarificationWithContact,
        },
      });

      await addLog("clarification", clarificationWithContact);

      return NextResponse.json({
        status: "needs_clarification",
        missing,
        message: `Additional information required for ${serviceType} quote.`,
      });
    }

    const transloadingQuote =
      serviceType === "drayage"
        ? null
        : calculateTransloadingCost(normalized as any);
    const drayageQuote =
      serviceType === "drayage"
        ? calculateDrayagePricing(drayageInput)
        : null;

    await addLog(
      "costing",
      JSON.stringify(drayageQuote ?? transloadingQuote, null, 2)
    );

    const quoteTable = formatQuoteTable(
      serviceType === "drayage"
        ? {
            total: drayageQuote?.total,
            lineItems: drayageQuote?.lineItems,
            invoiceItems: drayageQuote?.invoiceItems,
          }
        : transloadingQuote || undefined
    );

    const quotePrompt =
      serviceType === "drayage"
        ? `
Write a professional drayage quotation email summarizing the shipment details and cost.

Shipment details:
${JSON.stringify(drayageInput, null, 2)}

Pricing:
${JSON.stringify(drayageQuote, null, 2)}
`
        : `
Write a professional logistics quotation email summarizing the shipment details and cost.

Shipment details:
${JSON.stringify(extractedJson, null, 2)}

Normalized:
${JSON.stringify(normalized, null, 2)}

Pricing:
${JSON.stringify(transloadingQuote, null, 2)}
`;

    const quoteResponse = await client.responses.create({
      model: "gpt-4.1-mini",
      input: quotePrompt,
    });
    const draftedReply =
      (quoteResponse as any).output?.[0]?.content?.[0]?.text?.trim() || "";

    const pricingFooter =
      serviceType === "drayage"
        ? buildDrayageFooter(drayageQuote || undefined)
        : buildTransloadingFooter(transloadingQuote || undefined);
    const bodyWithTable = [draftedReply, quoteTable]
      .filter(Boolean)
      .join("\n\n");
    const finalReply = `${bodyWithTable}\n\n${formatSenderContactBlock(
      contactDetails
    )}${pricingFooter}`;

    await addLog("quote", finalReply);

    const quotePayload =
      serviceType === "drayage"
        ? { serviceType: "drayage", ...drayageQuote }
        : { serviceType: "transloading", ...(transloadingQuote || {}) };

    const updatedEmail = await prisma.email.update({
      where: { id },
      data: {
        status: "quoted",
        extractedJson,
        normalizedJson: normalized,
        quoteJson: quotePayload,
        inferredJson: {
          ...existingInferred,
          contactDetails,
          drayage: drayageInput,
        },
        aiResponse: finalReply,
      },
    });

    try {
      revalidatePath("/dashboard/inbox");
      revalidatePath(`/dashboard/inbox/${id}`);
    } catch (e) {
      console.warn("revalidatePath failed", e);
    }

    return NextResponse.json({
      status: "ok",
      email: updatedEmail,
      extractedJson,
      normalized,
      ...(serviceType === "drayage"
        ? { drayageQuote }
        : { quote: transloadingQuote }),
      aiReply: finalReply,
    });
  } catch (err: any) {
    console.error("PROCESS ERROR:", err);
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
