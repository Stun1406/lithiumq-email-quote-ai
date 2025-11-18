import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  calculateTransloadingCost,
  calculateDrayagePricing,
} from "@/business/pricing";
import { revalidatePath } from "next/cache";
import {
  determineServiceType,
  buildDrayageInput,
  validateDrayageInput,
} from "@/lib/drayage";
import { buildDrayageFooter, buildTransloadingFooter } from "@/lib/quote-format";
import { formatSenderContactBlock } from "@/lib/contact-info";
import { applyPricingHeuristics } from "@/lib/pricing-heuristics";

export async function POST(req: Request) {
  try {
    // fetch existing emails with any stored normalized/inferred JSON
    const rows = await prisma.email.findMany({
      select: {
        id: true,
        normalizedJson: true,
        inferredJson: true,
        extractedJson: true,
        aiResponse: true,
        senderEmail: true,
        body: true,
      },
    });

    let updated = 0;

    for (const row of rows) {
      const stored = row.normalizedJson ?? row.inferredJson ?? {};
      const normalized: any = { ...stored };
      let serviceType =
        normalized.serviceType ||
        determineServiceType(row.extractedJson ?? {}, row.body || "");
      if (!serviceType || serviceType === "both") serviceType = "transloading";
      normalized.serviceType = serviceType;
      if (serviceType !== "drayage") {
        normalized.seal = normalized.seal ?? true;
        normalized.billOfLading = normalized.billOfLading ?? true;
      }

      const drayageInput = buildDrayageInput(row.extractedJson ?? {}, normalized);
      normalized.drayage = drayageInput;

      let quoteJson: any;
      if (serviceType === "drayage") {
        const missing = validateDrayageInput(drayageInput);
        if (missing.length > 0) continue;
        try {
          quoteJson = calculateDrayagePricing(drayageInput);
        } catch (e) {
          console.warn("Drayage pricing failed for", row.id, e);
          continue;
        }
      } else {
        applyPricingHeuristics(row.body || "", normalized);
        try {
          quoteJson = {
            serviceType: "transloading",
            ...calculateTransloadingCost(normalized),
          };
        } catch (e) {
          console.warn("Pricing compute failed for", row.id, e);
          continue;
        }
      }

      const footer =
        serviceType === "drayage"
          ? buildDrayageFooter(quoteJson)
          : buildTransloadingFooter(quoteJson);
      const contactBlock = formatSenderContactBlock({
        name: "Customer Contact",
        company: "LithiumQ",
        phone: "(555) 010-0000",
        email: row.senderEmail || "unknown@lithiumq.com",
      });
      const existing = row.aiResponse || "";
      const newDraft = `${existing}\n\n${contactBlock}${footer}`.trim();

      await prisma.email.update({
        where: { id: row.id },
        data: {
          normalizedJson: normalized as any,
          quoteJson,
          aiResponse: newDraft,
        },
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
