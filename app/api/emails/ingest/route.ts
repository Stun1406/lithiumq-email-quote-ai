import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";
import { calculateTransloadingCost } from "@/business/pricing";
import { revalidatePath } from "next/cache";

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
            const created = await prisma.email.create({
              data: {
                senderEmail: sender || "unknown",
                subject,
                body: content,
              },
            });
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

If any detail is not in the email, set it to null. Do NOT make up values.

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

    // --------------------------------------------------------
    // 4. Missing fields check
    // --------------------------------------------------------
    const required = ["containerSize", "palletized", "pieces"];
    const missing = required.filter((k) => !normalized[k]);

    if (missing.length > 0) {
      const clarificationEmail = `
Dear Customer,

Thank you for your inquiry.

To proceed with your quotation, could you please confirm:

Missing: ${missing.join(", ")}

We will finalize the quote immediately upon receiving these details.

Warm regards,  
LithiumQ Logistics Team
`.trim();

      await prisma.email.update({
        where: { id: email.id },
        data: {
          status: "needs_clarification",
          extractedJson,
          normalizedJson: normalized,
          aiResponse: clarificationEmail,
        },
      });

      await addLog("clarification", clarificationEmail);

      return NextResponse.json({
        status: "needs_clarification",
        missing,
        clarificationEmail,
      });
    }

    // --------------------------------------------------------
    // 5. Cost Calculation
    // --------------------------------------------------------
    const cost = calculateTransloadingCost(normalized as any);

    await addLog("costing", JSON.stringify(cost, null, 2));

    // --------------------------------------------------------
    // 6. Generate Quote Email
    // --------------------------------------------------------
    const quotePrompt = `
Write a professional logistics quotation email summarizing the shipment details and including the final cost.

Shipment details:
${JSON.stringify(extractedJson, null, 2)}

Internal normalized data:
${JSON.stringify(normalized, null, 2)}

Pricing breakdown:
${JSON.stringify(cost, null, 2)}
    `;

  const quoteResponse = await client.responses.create({
      model: "gpt-4.1-mini",
      input: quotePrompt,
    });
  const aiEmailDraft = (quoteResponse as any).output?.[0]?.content?.[0]?.text?.trim() || "";

    await addLog("quote", aiEmailDraft);

    // --------------------------------------------------------
    // 7. Final DB update
    // --------------------------------------------------------
    await prisma.email.update({
      where: { id: email.id },
      data: {
        status: "quoted",
        extractedJson,
        normalizedJson: normalized,
        quoteJson: cost,
        aiResponse: aiEmailDraft,
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
      cost,
      aiEmailDraft,
    });
  } catch (err: any) {
    console.error("ERROR INGESTING EMAIL:", err);
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
