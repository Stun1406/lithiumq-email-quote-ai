import { NextResponse, NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";
import { calculateTransloadingCost } from "@/business/pricing";

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
  "container_size": "20ft" | "40ft" | "45ft" | null,
  "fragile": boolean | null,
  "temperature_controlled": boolean | null,
  "hazmat": boolean | null,
  "urgent": boolean | null,
  "origin": string | null,
  "destination": string | null,
  "special_instructions": string | null
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

    // --------------------------------------------------------
    // 3. Calculate Transloading Cost
    // --------------------------------------------------------
    const quote = calculateTransloadingCost(normalized as any);

    await addLog("costing", JSON.stringify(quote, null, 2));

    // --------------------------------------------------------
    // 4. Generate Quote Email
    // --------------------------------------------------------
    const quotePrompt = `
Write a professional logistics quotation email summarizing the shipment details and cost.

Shipment details:
${JSON.stringify(extractedJson, null, 2)}

Normalized:
${JSON.stringify(normalized, null, 2)}

Pricing:
${JSON.stringify(quote, null, 2)}
`;

  const quoteResponse = await client.responses.create({
      model: "gpt-4.1-mini",
      input: quotePrompt,
    });
  const aiReply = (quoteResponse as any).output?.[0]?.content?.[0]?.text?.trim() || "";

    await addLog("quote", aiReply);

    // --------------------------------------------------------
    // 5. Save all updates
    // --------------------------------------------------------
    const updatedEmail = await prisma.email.update({
      where: { id },
      data: {
        status: "quoted",
        extractedJson,
        normalizedJson: normalized,
        quoteJson: quote,
        aiResponse: aiReply,
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
      quote,
      aiReply,
    });
  } catch (err: any) {
    console.error("PROCESS ERROR:", err);
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
