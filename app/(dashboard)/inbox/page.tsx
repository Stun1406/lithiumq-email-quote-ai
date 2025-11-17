import { prisma } from "@/lib/prisma";
import Link from "next/link";
// dev-only test button removed to avoid module resolution issue in typecheck
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const revalidateMode = "force-dynamic";

export default async function InboxPage() {
  const emails = await prisma.email.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="p-8 mx-auto max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Inbox</h1>
        <div className="flex gap-2">
          <Link href="/dashboard/inbox/compose">
            <Button>Compose</Button>
          </Link>
        </div>
      </div>

      <div className="space-y-4">
        {emails.length === 0 && (
          <p className="text-muted-foreground">No emails yet.</p>
        )}

        {emails.map((email) => (
          <Link href={`/dashboard/inbox/${email.id}`} key={email.id}>
            <Card className="cursor-pointer hover:bg-accent transition">
              <CardHeader className="flex flex-row justify-between items-center">
                <CardTitle className="text-xl">{email.subject || "(No Subject)"}</CardTitle>
                <Badge>{email.status}</Badge>
              </CardHeader>

              <CardContent>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {email.body}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  {new Date(email.createdAt).toLocaleString()}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
