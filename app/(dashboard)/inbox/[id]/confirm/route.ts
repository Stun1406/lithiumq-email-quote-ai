import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;

    const email = await prisma.email.update({
      where: { id },
      data: {
        status: "confirmed",
      },
    });

    // Add log entry
    await prisma.emailLog.create({
      data: {
        emailId: id,
        type: "confirmation",
        message: "Email marked as confirmed by user.",
      },
    });

    return NextResponse.json({
      status: "ok",
      message: "Email confirmed.",
      email,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
