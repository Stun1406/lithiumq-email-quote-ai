import { prisma } from "@/lib/prisma";
import InboxShell from "./InboxShell";

export const revalidate = 0;

export default async function InboxPage() {
  // fetch persisted emails from DB
  const rows = await prisma.email.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      senderEmail: true,
      senderName: true,
      subject: true,
  aiResponse: true,
      body: true,
      createdAt: true,
      status: true,
    },
  });

  const emails = rows.map((r) => ({
    id: String(r.id),
    from: r.senderEmail || r.senderName || "unknown",
    subject: r.subject || "(no subject)",
    body: r.body || "",
  date: r.createdAt.toLocaleString(),
  aiResponse: r.aiResponse || null,
  }));

  return <InboxShell emails={emails} />;
}
