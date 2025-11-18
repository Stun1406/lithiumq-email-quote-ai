import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";
import {
  calculateTransloadingCost,
  calculateDrayagePricing,
} from "@/business/pricing";
import { revalidatePath } from "next/cache";
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

export async function POST(req: Request) {
  try {
  const { sender, subject, body } = await req.json();

    if (!body || !body.trim()) {
      return NextResponse.json(
        { error: "Email body is required." },
        { status: 400 }
      );
    }

    // --------------------------------------------------------
    // 1. Create Email (initial status = received)
    // --------------------------------------------------------
    const email = await prisma.email.create({
      data: {
        senderEmail: sender || "unknown",
        subject: subject || "(no subject)",
        body,
      },
    });

    // Helper to push logs
    const addLog = (type: string, message: string) =>
      prisma.emailLog.create({
        data: {
          emailId: email.id,
          type: type as any,
          message,
        },
      });

    await addLog("extraction", "Email received and processing started.");

    // --------------------------------------------------------
    // 2. AI Extraction
    // --------------------------------------------------------
    const extractionPrompt = `
Extract logistics shipment details from this email.

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

If any detail is missing, return null (do not guess).

Email:
${body}
`;

    const extractionResponse = await client.responses.create({
      model: "gpt-4.1-mini",
      input: extractionPrompt,
    });

    const extractedText = (extractionResponse as any).output?.[0]?.content?.[0]?.text || "";
    const cleaned = extractedText.replace(/```json/gi, "").replace(/```/g, "").trim();
    let extractedJson: any = {};
    if (cleaned) extractedJson = JSON.parse(cleaned);

    await addLog("extraction", JSON.stringify(extractedJson, null, 2));

    // --------------------------------------------------------
    // 3. Normalization
    // --------------------------------------------------------
  const normalized: Record<string, any> = {
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

    const serviceType = determineServiceType(extractedJson, body);
    const drayageInput = buildDrayageInput(extractedJson, normalized);
    normalized.serviceType = serviceType;
    normalized.drayage = drayageInput;

    const contactDetails = deriveSenderContactDetails({
      emailText: body,
      senderEmail: sender,
      extractedContact: extractedJson,
    });

    // --------------------------------------------------------
    // 4. Missing fields check
    // --------------------------------------------------------
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

To proceed with your ${
        serviceType === "drayage" ? "drayage" : "transloading"
      } quotation, could you please confirm:

Missing: ${missing.join(", ")}

We will finalize the quote immediately upon receiving these details.

Warm regards,  
LithiumQ Logistics Team
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
        contactDetails,
        clarificationEmail: clarificationWithContact,
      });
    }

    // --------------------------------------------------------
    // 5. Cost Calculation
    // --------------------------------------------------------
    const transloadingCost =
      serviceType === "drayage"
        ? null
        : calculateTransloadingCost(normalized as any);
    const drayageQuote =
      serviceType === "drayage"
        ? calculateDrayagePricing(drayageInput)
        : null;

    await addLog(
      "costing",
      JSON.stringify(drayageQuote ?? transloadingCost, null, 2)
    );

    const quoteTable = formatQuoteTable(
      serviceType === "drayage"
        ? {
            total: drayageQuote?.total,
            lineItems: drayageQuote?.lineItems,
            invoiceItems: drayageQuote?.invoiceItems,
          }
        : transloadingCost || undefined
    );

    const quotePrompt =
      serviceType === "drayage"
        ? `
Write a professional drayage quotation email summarizing container size, weight bracket, origin, destination, miles, requested ship-by date, drayage add-ons, and invoice-only services (if provided). Include the computed drayage total and invite the customer to confirm or request adjustments.

Shipment details:
${JSON.stringify(drayageInput, null, 2)}

Pricing breakdown:
${JSON.stringify(drayageQuote, null, 2)}
    `
        : `
Write a professional logistics quotation email summarizing the shipment details and including the final cost.

Shipment details:
${JSON.stringify(extractedJson, null, 2)}

Internal normalized data:
${JSON.stringify(normalized, null, 2)}

Pricing breakdown:
${JSON.stringify(transloadingCost, null, 2)}
    `;

    const quoteResponse = await client.responses.create({
      model: "gpt-4.1-mini",
      input: quotePrompt,
    });
    const aiEmailDraft =
      (quoteResponse as any).output?.[0]?.content?.[0]?.text?.trim() || "";

    const contactBlock = formatSenderContactBlock(contactDetails);
    const pricingFooter =
      serviceType === "drayage"
        ? buildDrayageFooter(drayageQuote || undefined)
        : buildTransloadingFooter(transloadingCost || undefined);
    const finalDraft = [aiEmailDraft.trim(), quoteTable]
      .filter(Boolean)
      .join("\n\n")
      .concat(`\n\n${contactBlock}${pricingFooter}`);

    await addLog("quote", finalDraft);

    // --------------------------------------------------------
    // 7. Final DB update
    // --------------------------------------------------------
    const quotePayload =
      serviceType === "drayage"
        ? { serviceType: "drayage", ...drayageQuote }
        : { serviceType: "transloading", ...(transloadingCost || {}) };

    await prisma.email.update({
      where: { id: email.id },
      data: {
        status: "quoted",
        extractedJson,
        normalizedJson: normalized,
        quoteJson: quotePayload,
        inferredJson: {
          contactDetails,
          drayage: drayageInput,
        },
        aiResponse: finalDraft,
      },
    });

    try {
      revalidatePath("/dashboard/inbox");
      revalidatePath(`/dashboard/inbox/${email.id}`);
    } catch (e) {
      console.warn("revalidatePath failed", e);
    }

    return NextResponse.json({
      status: "ok",
      emailId: email.id,
      extractedJson,
      normalized,
      ...(serviceType === "drayage"
        ? { drayageQuote }
        : { cost: transloadingCost }),
      contactDetails,
      aiEmailDraft: finalDraft,
    });
  } catch (err: any) {
    console.error("ERROR INGESTING EMAIL:", err);
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
