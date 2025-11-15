import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import OpenAI from "openai";
import { calculateTransloadingCost } from "@/business/pricing";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

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
  "container_size": "20ft" | "40ft" | "45ft" | null,
  "fragile": boolean | null,
  "temperature_controlled": boolean | null,
  "hazmat": boolean | null,
  "urgent": boolean | null,
  "origin": string | null,
  "destination": string | null,
  "special_instructions": string | null
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

    // --------------------------------------------------
    // 4. Missing required info AFTER inference
    // --------------------------------------------------
  const required = ["containerSize", "palletized", "pieces"];
  const missing = required.filter((key) => !normalized[key]);

    if (missing.length > 0) {
      const clarificationEmail = `
Dear Customer,

Thank you for your inquiry.

Before we can prepare your detailed quotation, could you please confirm the following information:

• Missing: ${missing.join(", ")}

Once received, we will prepare your updated quote immediately.

Warm regards,
Logistics Team  
LithiumQ
`.trim();

      return NextResponse.json({
        status: "needs_clarification",
        missing,
        extracted: extractedAI,
        normalized,
        emailDraft: clarificationEmail,
      });
    }

    // --------------------------------------------------
    // 5. Calculate cost
    // --------------------------------------------------
    const cost = calculateTransloadingCost(normalized as any);

    // --------------------------------------------------
    // 6. Generate professional quote email
    // --------------------------------------------------
    const quotePrompt = `
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
${JSON.stringify(cost, null, 2)}
`;

    const quoteResponse = await client.responses.create({
      model: "gpt-4.1-mini",
      input: quotePrompt,
    });

    const emailDraft = extractTextFromResponse(quoteResponse).trim();

  // Append a deterministic pricing footer so the stored draft always reflects the computed total
  const pricingFooter = `\n\n--PRICE-FOOTER--\nPricing (computed): Total: $${cost.total}\nIncludes: Seal $5, Bill of Lading $5\n`;

  const finalDraft = `${emailDraft}\n${pricingFooter}`;

    // --------------------------------------------------
    // 7. Persist record and return
    // --------------------------------------------------
    const id = randomUUID();
    let created;
    try {
      created = await prisma.email.create({
        data: {
          id,
          senderEmail: senderEmail,
          senderName: null,
          subject: subject,
          body: emailText,
          extractedJson: extractedAI as any,
          normalizedJson: normalized as any,
          quoteJson: cost as any,
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

    return NextResponse.json({
      status: "ok",
      id: created.id,
      extracted: extractedAI,
      normalized,
      cost,
      emailDraft,
    });
  } catch (err: any) {
    console.error("AI-Mail API Error:", err);
    return NextResponse.json(
      { error: err.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
