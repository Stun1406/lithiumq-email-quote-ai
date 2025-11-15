import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const emails = await prisma.email.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        senderEmail: true,
        senderName: true,
        subject: true,
        body: true,
        createdAt: true,
        status: true,
      },
    });

    return NextResponse.json({ status: "ok", emails });
  } catch (err: any) {
    console.error("GET /api/emails error", err);
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}

