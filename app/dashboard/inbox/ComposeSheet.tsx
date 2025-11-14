"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type AiMailResponse = {
  status: "ok" | "needs_clarification" | string;
  extracted?: any;
  normalized?: any;
  cost?: any;
  emailDraft?: string;
  missing?: string[];
  error?: string;
};

export default function ComposeSheet() {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AiMailResponse | null>(null);

  async function sendEmail() {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const payload = {
        emailText: `To: ${to}\nSubject: ${subject}\n\n${body}`,
      };

      const res = await fetch(`/api/ai-mail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

  const json: AiMailResponse = await res.json();

      if (!res.ok) {
        setError((json as any)?.error || `Request failed: ${res.status}`);
      } else {
        setResult(json);

        // fetch latest saved emails so inbox list can be refreshed elsewhere
        try {
          await fetch(`/api/emails`);
        } catch (e) {
          // ignore
        }
      }
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  function resetAndClose() {
    setTo("");
    setSubject("");
    setBody("");
    setResult(null);
    setError(null);
    setOpen(false);
  }

  return (
    <>
      <div className="p-4 border-b flex justify-between items-center">
        <h2 className="text-lg font-semibold">Inbox</h2>
        <Button onClick={() => setOpen(true)}>Compose</Button>
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white w-[720px] max-w-[95%] p-6 rounded shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-lg font-semibold">New Email</h3>
              <div className="text-sm text-gray-500">AI will extract shipment details and generate a professional quote.</div>
            </div>

            {!result ? (
              <div className="mt-4 space-y-4">
                <Input value={to} onChange={(e) => setTo((e.target as HTMLInputElement).value)} placeholder="To: customer@example.com" />
                <Input value={subject} onChange={(e) => setSubject((e.target as HTMLInputElement).value)} placeholder="Subject: Request for Quote" />
                <Textarea value={body} onChange={(e) => setBody((e.target as HTMLTextAreaElement).value)} placeholder="Write your message..." rows={8} />

                {error && <div className="text-sm text-red-600">{error}</div>}

                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="ghost" onClick={resetAndClose} disabled={loading}>
                    Cancel
                  </Button>
                  <Button onClick={sendEmail} disabled={loading}>
                    {loading ? "Sending…" : "Send"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <div className="mb-4">
                  <div className="text-sm text-gray-600">Result status: <strong>{result.status}</strong></div>
                </div>

                {result.missing && result.missing.length > 0 && (
                  <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
                    <div className="font-medium">Missing information:</div>
                    <ul className="list-disc ml-5 mt-2 text-sm text-gray-700">
                      {result.missing.map((m) => (
                        <li key={m}>{m}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {result.cost && (
                  <div className="mb-4 p-4 bg-gray-50 border rounded">
                    <div className="font-medium mb-2">Pricing Summary</div>
                    <pre className="text-sm text-gray-800 overflow-auto max-h-40">{JSON.stringify(result.cost, null, 2)}</pre>
                  </div>
                )}

                {result.emailDraft && (
                  <div className="mb-4">
                    <div className="font-medium mb-2">Generated Quote Email</div>
                    <div className="p-4 bg-white border rounded whitespace-pre-wrap text-sm text-gray-800">{result.emailDraft}</div>
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setResult(null)}>
                    Back
                  </Button>
                  <Button onClick={resetAndClose}>Done</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
