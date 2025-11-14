import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;

    const email = await prisma.email.findUnique({
      where: { id: Number(id) },
      include: { logs: { orderBy: { createdAt: "asc" } } },
    });

    if (!email) return NextResponse.json({ error: "not_found" }, { status: 404 });

    return NextResponse.json({ status: "ok", email });
  } catch (err: any) {
    console.error("GET /api/emails/[id] error", err);
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const data = await req.json();

    const updated = await prisma.email.update({
      where: { id: Number(id) },
      data,
    });

    return NextResponse.json({ status: "ok", email: updated });
  } catch (err: any) {
    console.error("PATCH /api/emails/[id] error", err);
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
