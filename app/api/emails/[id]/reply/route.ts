import { NextResponse, NextRequest } from "next/server";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const userMessage: string = (body?.message || "").toString();

    if (!userMessage.trim()) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    const email = await prisma.email.findUnique({ where: { id } });
    if (!email) return NextResponse.json({ error: "not_found" }, { status: 404 });

    // Build prompt: include original email, prior AI draft, and the user follow-up
    const prompt = `
You are a logistics quoting assistant. A customer sent this inquiry:

${email.body}

The assistant previously generated this quote/draft:

${email.aiResponse || "(no prior draft)"}

A user (internal) asks the assistant to clarify or expand on the draft with the following message:

${userMessage}

Reply concisely and professionally, focusing only on the requested clarification or additional details. Return only the plain text reply.
`;

    const response = await client.responses.create({ model: "gpt-4.1-mini", input: prompt });

    // Helper to extract text (similar to other routes)
    function extractTextFromResponse(res: any): string {
      try {
        if (!res || !Array.isArray(res.output)) return "";
        for (const out of res.output) {
          if (out.content && Array.isArray(out.content)) {
            for (const chunk of out.content) {
              if (typeof chunk.text === "string") return chunk.text;
              if (typeof chunk === "string") return chunk;
              if (chunk.type === "output_text" && typeof chunk.text === "string") return chunk.text;
            }
          }
          if (typeof out.text === "string") return out.text;
        }
      } catch (e) {
        // ignore
      }
      return "";
    }

    const aiReply = extractTextFromResponse(response).trim();

    // Persist: append to aiResponse and create logs
    const appended = `${email.aiResponse || ""}\n\n[User follow-up]\n${userMessage}\n\n[AI reply]\n${aiReply}`;

    await prisma.email.update({
      where: { id },
      data: {
        aiResponse: appended,
        logs: {
          create: [
            { id: crypto.randomUUID(), type: "clarification", message: userMessage },
            { id: crypto.randomUUID(), type: "quote", message: aiReply },
          ],
        },
      },
    });

    try {
      revalidatePath("/dashboard/inbox");
      revalidatePath("/dashboard/ai-inspector");
    } catch (e) {
      console.warn("revalidatePath failed", e);
    }

    return NextResponse.json({ status: "ok", aiReply });
  } catch (err: any) {
    console.error("POST /api/emails/[id]/reply error", err);
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
