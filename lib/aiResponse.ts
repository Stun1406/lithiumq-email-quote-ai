export function splitAiQuoteResponse(aiResponse?: string | null) {
  if (!aiResponse) {
    return { body: "", pricingNote: null };
  }

  const marker = "--PRICE-FOOTER--";
  if (!aiResponse.includes(marker)) {
    return { body: aiResponse.trim(), pricingNote: null };
  }

  const [body, footer] = aiResponse.split(marker);
  const note = footer?.replace(/^[-\s]+/, "").trim() || null;
  return {
    body: body.trim(),
    pricingNote: note,
  };
}
