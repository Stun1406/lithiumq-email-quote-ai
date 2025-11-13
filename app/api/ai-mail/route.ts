import { NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: Request) {
  const { emailText } = await req.json();

  const prompt = `
You are a logistics AI assistant. Extract the following details from the email text:
- quantity (number)
- whether the cargo is fragile
- whether the request is urgent
- whether it's large or small cargo
- if temperature-controlled storage is needed
Return your output as a valid JSON object.
Email: """${emailText}"""
`;

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  });

  const parsed = JSON.parse(completion.choices[0].message.content);

  // simple pricing logic
  let baseRate = 100;
  if (parsed.fragile) baseRate += 50;
  if (parsed.urgent) baseRate += 70;
  if (parsed.large) baseRate += 80;
  if (parsed.refrigerated) baseRate += 40;

  const total = baseRate * (parsed.quantity || 1);

  return NextResponse.json({
    extracted: parsed,
    cost: {
      baseRate,
      total,
    },
    message: `Estimated cost: ₹${total}`,
  });
}
