import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import OpenAI from "openai";
import {
  calculateTransloadingCost,
  calculateDrayagePricing,
} from "@/business/pricing";
import {
  buildPricingTermsText,
  PRICING_TERMS,
} from "@/business/pricing-data";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { applyPricingHeuristics } from "@/lib/pricing-heuristics";
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
  const body = await req.json();
  const emailText: string = body.emailText || "";
  const senderEmail: string | null = body.senderEmail || null;
  const subject: string | null = body.subject || null;

    if (!emailText.trim()) {
      return NextResponse.json(
        { error: "emailText is required" },
        { status: 400 }
      );
    }

    // --------------------------------------------------
    // 1. Extract data using OpenAI
    // --------------------------------------------------
    const extractionPrompt = `
Extract logistics shipment details from the email.

Return ONLY valid JSON with this structure:

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

If any detail is not provided in the email, set it to null. Do not hallucinate.

Email content:
${emailText}
`;

    const extractionResponse = await client.responses.create({
      model: "gpt-4.1-mini",
      input: extractionPrompt,
    });

    // Helper: robustly pull the first text-like output from the Responses API
    function extractTextFromResponse(res: any): string {
      try {
        if (!res || !Array.isArray(res.output)) return "";
        for (const out of res.output) {
          if (out.content && Array.isArray(out.content)) {
            for (const chunk of out.content) {
              if (typeof chunk.text === "string") return chunk.text;
              if (typeof chunk === "string") return chunk;
              // Some SDK shapes wrap text differently
              if (chunk.type === "output_text" && typeof chunk.text === "string") return chunk.text;
            }
          }
          // older shapes
          if (typeof out.text === "string") return out.text;
        }
      } catch (e) {
        // fallthrough
      }
      return "";
    }

    const extractedRaw = extractTextFromResponse(extractionResponse);

    // Clean up Markdown fences
    const cleaned = extractedRaw.replace(/```json/gi, "").replace(/```/g, "").trim();

    let extractedAI;
    try {
      extractedAI = JSON.parse(cleaned);
    } catch (err) {
      console.error("JSON parse failed. Raw output:", extractedRaw);
      throw err;
    }

    // --------------------------------------------------
    // 2. Normalize AI output into your PricingInput format
    // --------------------------------------------------
  const normalized: Record<string, any> = {
      containerSize: extractedAI.container_size?.replace("ft", "") || null,
      palletized: extractedAI.palletized ?? null,
      pieces: extractedAI.quantity ?? null,
      pallets: extractedAI.quantity ? Math.ceil(extractedAI.quantity / 40) : null,
  shrinkWrap: extractedAI.fragile ? true : false,
  // per product requirement: always true
  seal: true,
  billOfLading: true,
      afterHours: extractedAI.urgent ? "weekday" : null,
      heightInches: null,
      storageDays: null,
      workers: extractedAI.urgent ? 2 : 1,
      extraHours: extractedAI.urgent ? 1 : 0,
    };

    // --------------------------------------------------
    // 3. Smart inference logic (reduces missing data)
    // --------------------------------------------------

    // Infer container size
    if (!normalized.containerSize) {
      if (extractedAI.pallet_size === "40x48") normalized.containerSize = "40";
      else if (normalized.pieces && normalized.pieces < 20)
        normalized.containerSize = "20";
      else normalized.containerSize = "40"; // default safe fallback
    }

    // If palletized but pallets missing → assume 40 units per pallet
    if (normalized.palletized && !normalized.pallets && normalized.pieces) {
      normalized.pallets = Math.ceil(normalized.pieces / 40);
    }

    applyPricingHeuristics(emailText, normalized);

    const serviceType = determineServiceType(extractedAI, emailText);
    const drayageInput = buildDrayageInput(extractedAI, normalized);
    normalized.serviceType = serviceType;
    normalized.drayage = drayageInput;

    const contactDetails = deriveSenderContactDetails({
      emailText,
      senderEmail,
      extractedContact: extractedAI,
    });

    // --------------------------------------------------
    // 4. Missing required info AFTER inference
    // --------------------------------------------------
    let missing: string[] = [];
    if (serviceType === "drayage") {
      missing = validateDrayageInput(drayageInput);
    } else {
      const required = ["containerSize", "palletized", "pieces"];
      missing = required.filter((key) => !normalized[key]);
    }

    if (missing.length > 0) {
      const clarificationEmail = `
Dear Customer,

Thank you for your inquiry.

Before we can prepare your detailed ${
        serviceType === "drayage" ? "drayage" : "transloading"
      } quotation, could you please confirm the following information:

• Missing: ${missing.join(", ")}

Once received, we will prepare your updated quote immediately.

Warm regards,
Logistics Team  
LithiumQ
`.trim();

      const clarificationWithContact = `${clarificationEmail}\n\n${formatSenderContactBlock(
        contactDetails
      )}`;

      return NextResponse.json({
        status: "needs_clarification",
        missing,
        extracted: extractedAI,
        normalized,
        contactDetails,
        emailDraft: clarificationWithContact,
      });
    }

    // --------------------------------------------------
    // 5. Calculate cost
    // --------------------------------------------------
    const transloadingCost =
      serviceType === "drayage"
        ? null
        : calculateTransloadingCost(normalized as any);
    const drayageQuote =
      serviceType === "drayage"
        ? calculateDrayagePricing(drayageInput)
        : null;

    const quoteTable = formatQuoteTable(
      serviceType === "drayage"
        ? {
            total: drayageQuote?.total,
            lineItems: drayageQuote?.lineItems,
            invoiceItems: drayageQuote?.invoiceItems,
          }
        : transloadingCost || undefined
    );

    // --------------------------------------------------
    // 6. Generate professional quote email
    // --------------------------------------------------
    const quotePrompt =
      serviceType === "drayage"
        ? `
Write a professional drayage quotation email.
Tone: clear, confident, concise, formal.

Include:
- Container size, weight, origin, destination, miles, and requested ship-by date.
- Line items for each quoted drayage charge (base run, weight surcharge, rush fee, extra stops, empty storage, storage, chassis split, prepull, pier pass, etc.).
- Mention any invoice-only items provided (terminal waiting, chassis rental, live unload, exam fees, replug, DO cancellation, on-time service).
- Total drayage price with a short summary and invite the customer to confirm or request revisions.

Drayage input:
${JSON.stringify(drayageInput, null, 2)}

Pricing:
${JSON.stringify(drayageQuote, null, 2)}
`
        : `
Write a professional corporate logistics quotation email.  
Tone: clear, confident, concise, formal.

Include:
- Summary of extracted shipment details
- Pricing total + short breakdown
- Invite customer to confirm or request revisions

Shipment details:
${JSON.stringify(extractedAI, null, 2)}

Normalized (internal calculation input):
${JSON.stringify(normalized, null, 2)}

Pricing:
${JSON.stringify(transloadingCost, null, 2)}
`;

    const pricingTerms =
      serviceType === "drayage" ? null : buildPricingTermsText();

    const quoteResponse = await client.responses.create({
      model: "gpt-4.1-mini",
      input:
        serviceType === "drayage"
          ? quotePrompt
          : `${quotePrompt}\n\n${pricingTerms}\n\nNote to assistant: use the authoritative pricing rules internally (do not append the entire pricing terms block to the customer-facing email).`,
    });

    const emailDraft = extractTextFromResponse(quoteResponse).trim();

    const bodyWithTable = [emailDraft, quoteTable]
      .filter(Boolean)
      .join("\n\n");
    const contactBlock = formatSenderContactBlock(contactDetails);
    const pricingFooter =
      serviceType === "drayage"
        ? buildDrayageFooter(drayageQuote || undefined)
        : buildTransloadingFooter(transloadingCost || undefined);
    const finalDraft = `${bodyWithTable}\n\n${contactBlock}${pricingFooter}`;

    // --------------------------------------------------
    // 7. Persist record and return
    // --------------------------------------------------
    const id = randomUUID();
    let created;
    try {
      const quotePayload =
        serviceType === "drayage"
          ? { serviceType: "drayage", ...drayageQuote }
          : {
              serviceType: "transloading",
              ...(transloadingCost || {}),
              pricingTerms,
            };

      created = await prisma.email.create({
        data: {
          id,
          senderEmail: senderEmail,
          senderName: null,
          subject: subject,
          body: emailText,
          extractedJson: extractedAI as any,
          normalizedJson: normalized as any,
          inferredJson: {
            contactDetails,
            drayage: drayageInput,
          } as any,
          quoteJson: quotePayload as any,
          aiResponse: finalDraft,
        },
      });

      console.log("AI-Mail: created email id=", created.id);

      // revalidate server routes that show emails
      try {
        revalidatePath("/dashboard/inbox");
        revalidatePath("/dashboard/ai-inspector");
      } catch (e) {
        console.warn("revalidatePath failed", e);
      }
    } catch (e) {
      console.error("Prisma create failed:", e);
      throw e;
    }

    const responsePayload: Record<string, any> = {
      status: "ok",
      id: created.id,
      extracted: extractedAI,
      normalized,
      contactDetails,
      emailDraft,
    };
    if (serviceType === "drayage") {
      responsePayload.drayageQuote = drayageQuote;
    } else {
      responsePayload.cost = transloadingCost;
    }

    return NextResponse.json(responsePayload);
  } catch (err: any) {
    console.error("AI-Mail API Error:", err);
    return NextResponse.json(
      { error: err.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
