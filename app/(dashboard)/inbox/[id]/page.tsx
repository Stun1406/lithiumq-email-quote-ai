// app/dashboard/inbox/[id]/page.tsx

import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import JsonView from "@/components/JsonView"; // we'll create this next
import Link from "next/link";
import PricingBreakdownTable, {
  PricingQuote,
} from "@/components/PricingBreakdownTable";
import { splitAiQuoteResponse } from "@/lib/aiResponse";

export default async function EmailDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const email = await prisma.email.findUnique({
    where: { id: params.id },
    include: { logs: { orderBy: { createdAt: "desc" } } },
  });

  if (!email) return notFound();
  const quote = (email.quoteJson ?? null) as PricingQuote | null;
  const { body: aiQuoteBody, pricingNote } = splitAiQuoteResponse(
    email.aiResponse
  );

  return (
    <div className="space-y-6 p-8">
      {/* Back Button */}
      <Link
        href="/dashboard/inbox"
        className="text-sm text-blue-600 hover:underline"
      >
        ← Back to Inbox
      </Link>

      {/* Email Header */}
      <Card>
        <CardHeader>
          <CardTitle>{email.subject || "No Subject"}</CardTitle>
          <p className="text-sm text-gray-500">From: {email.senderName || email.senderEmail}</p>
          <Badge className="mt-2 capitalize">{email.status}</Badge>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap">{email.body}</p>
        </CardContent>
      </Card>

      <Separator />

      {/* Extracted AI Data */}
      <Card>
        <CardHeader>
          <CardTitle>Extracted Data (AI)</CardTitle>
        </CardHeader>
        <CardContent>
          {email.extractedJson ? (
            <JsonView data={email.extractedJson} />
          ) : (
            <p className="text-sm text-gray-500">Not processed yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Normalized Data */}
      <Card>
        <CardHeader>
          <CardTitle>Normalized Data (Internal)</CardTitle>
        </CardHeader>
        <CardContent>
          {email.normalizedJson ? (
            <JsonView data={email.normalizedJson} />
          ) : (
            <p className="text-sm text-gray-500">Not processed yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Quote */}
      <Card>
        <CardHeader>
          <CardTitle>Quote</CardTitle>
        </CardHeader>
        <CardContent>
          {email.quoteJson ? (
            <JsonView data={email.quoteJson} />
          ) : (
            <p className="text-sm text-gray-500">Not generated yet.</p>
          )}
        </CardContent>
      </Card>

      {/* AI Response Email */}
      <Card>
        <CardHeader>
          <CardTitle>AI Response Email</CardTitle>
        </CardHeader>
        <CardContent>
          {email.aiResponse ? (
            <div className="space-y-4">
              <p className="whitespace-pre-wrap">{aiQuoteBody}</p>
              <PricingBreakdownTable quote={quote} note={pricingNote} />
            </div>
          ) : (
            <p className="text-sm text-gray-500">No response generated.</p>
          )}
        </CardContent>
      </Card>

      {/* Logs */}
      <Card>
        <CardHeader>
          <CardTitle>Processing Logs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {email.logs.length === 0 && (
            <p className="text-sm text-gray-500">No logs available.</p>
          )}

          {email.logs.map((log) => (
            <div
              key={log.id}
              className="border p-3 rounded-lg bg-gray-50 text-sm"
            >
              <div className="flex items-center justify-between">
                <Badge className="capitalize" variant="outline">
                  {log.type}
                </Badge>
                <span className="text-xs text-gray-400">
                  {new Date(log.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap">{log.message}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
