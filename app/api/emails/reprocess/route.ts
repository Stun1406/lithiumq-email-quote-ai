import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateTransloadingCost } from "@/business/pricing";
import { revalidatePath } from "next/cache";

export async function POST(req: Request) {
  try {
    // fetch existing emails with any stored normalized/inferred JSON
    const rows = await prisma.email.findMany({
      select: { id: true, normalizedJson: true, inferredJson: true },
    });

    let updated = 0;

    for (const row of rows) {
      const stored = (row.normalizedJson ?? row.inferredJson) as any;

      // ensure seal and billOfLading are true per product rule
      const normalized = {
        ...stored,
        seal: stored?.seal ?? true,
        billOfLading: stored?.billOfLading ?? true,
      };

      // compute cost (pricing function expects the normalized shape)
      let cost: any = null;
      try {
        cost = calculateTransloadingCost(normalized as any);
      } catch (e) {
        console.warn("Pricing compute failed for", row.id, e);
        // skip updating this one
        continue;
      }

      // also append a deterministic pricing footer to existing aiResponse or create a minimal draft
      const footer = `\n\n--PRICE-FOOTER--\nPricing (computed): Total: $${cost.total}\nIncludes: Seal $5, Bill of Lading $5\n`;
      const existing = (row as any).aiResponse || '';
      const newDraft = existing ? `${existing}\n${footer}` : `Automated quote generated.\n${footer}`;

      await prisma.email.update({
        where: { id: row.id },
        data: { normalizedJson: normalized as any, quoteJson: cost as any, aiResponse: newDraft },
      });

      updated++;
    }

    // revalidate pages that display emails
    try {
      revalidatePath("/dashboard/inbox");
      revalidatePath("/dashboard/ai-inspector");
    } catch (e) {
      console.warn("revalidatePath failed", e);
    }

    return NextResponse.json({ status: "ok", updated });
  } catch (err: any) {
    console.error("Batch reprocess failed", err);
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
