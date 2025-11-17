"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ComposeEmailPage() {
  const router = useRouter();
  const [sender, setSender] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function sendEmail() {
    if (!body.trim()) {
      setMessage("Email body cannot be empty.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
  const res = await fetch("/api/emails/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender, subject, body }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage("Error: " + data.error);
      } else {
        setMessage("Email processed successfully!");
        setTimeout(() => router.push("/dashboard/inbox"), 1200);
      }
    } catch (err: any) {
      setMessage("Something went wrong.");
    }

    setLoading(false);
  }

  return (
    <div className="p-8 mx-auto max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle>Compose Email</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <Input
            placeholder="Sender email"
            value={sender}
            onChange={(e) => setSender(e.target.value)}
          />

          <Input
            placeholder="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />

          <Textarea
            placeholder="Write your message here..."
            rows={10}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />

          <Button onClick={sendEmail} disabled={loading} className="w-full">
            {loading ? "Sending..." : "Send Email"}
          </Button>

          {message && (
            <p className="text-sm text-center text-muted-foreground">{message}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
