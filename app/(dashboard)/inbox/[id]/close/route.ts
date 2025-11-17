import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;

    const email = await prisma.email.update({
      where: { id },
      data: {
        status: "closed",
      },
    });

    // Add log entry
    await prisma.emailLog.create({
      data: {
        emailId: id,
        type: "update",
        message: "Email has been closed.",
      },
    });

    return NextResponse.json({
      status: "ok",
      message: "Email closed.",
      email,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
