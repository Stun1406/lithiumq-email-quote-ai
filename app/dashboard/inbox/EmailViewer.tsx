"use client";

import Link from "next/link";
import { Email } from "./data";
import { useState, useEffect } from "react";
import PricingBreakdownTable, {
  PricingQuote,
} from "@/components/PricingBreakdownTable";
import { splitAiQuoteResponse } from "@/lib/aiResponse";
import { Badge } from "@/components/ui/badge";

interface Props {
  email: (Email & { aiResponse?: string | null }) | null;
}

export default function EmailViewer({ email }: Props) {
  if (!email) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        Select an email to view.
      </div>
    );
  }

  const [logs, setLogs] = useState<any[] | null>(null);
  const [details, setDetails] = useState<any | null>(null);

  async function loadDetails() {
    if (!email?.id) {
      setLogs(null);
      setDetails(null);
      return;
    }

    try {
      const res = await fetch(`/api/emails/${encodeURIComponent(email.id)}`);
      const json = await res.json();
      if (json?.status === "ok" && json.email) {
        setLogs(json.email.logs || []);
        setDetails(json.email);
      } else {
        setLogs([]);
        setDetails(null);
      }
    } catch (e) {
      setLogs([]);
      setDetails(null);
    }
  }

  useEffect(() => {
    loadDetails();
  }, [email?.id]);

  const aiResponse = details?.aiResponse ?? email.aiResponse;
  const quote = (details?.quoteJson ?? null) as PricingQuote | null;
  const normalized = details?.normalizedJson ?? null;
  const inferred = details?.inferredJson ?? null;
  const serviceType =
    normalized?.serviceType ||
    (quote as any)?.serviceType ||
    "transloading";
  const drayageMeta =
    normalized?.drayage ||
    (quote as any)?.metadata ||
    inferred?.drayage ||
    null;
  const { body: aiQuoteBody, pricingNote } = splitAiQuoteResponse(aiResponse);

  return (
    <div className="flex-1 p-8 overflow-y-auto">
      <h2 className="text-xl font-bold">{email.subject}</h2>
      <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
        <span>{email.from}</span>
        <Badge variant={serviceType === "drayage" ? "default" : "outline"}>
          {serviceType === "drayage" ? "Drayage" : "Transloading"}
        </Badge>
      </div>
      <hr className="my-4" />
      <p className="text-gray-800 whitespace-pre-wrap">{email.body}</p>

      {serviceType === "drayage" && drayageMeta && (
        <div className="mt-4 bg-blue-50 border border-blue-100 rounded p-4 text-sm text-blue-900">
          <div className="font-semibold text-xs uppercase tracking-wide mb-2">
            Drayage Summary
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <InfoRow label="Container">
              {drayageMeta.containerSize || drayageMeta.container_size || "—"}
            </InfoRow>
            <InfoRow label="Weight">
              {drayageMeta.containerWeightLbs ||
                drayageMeta.container_weight_lbs ||
                "—"}
            </InfoRow>
            <InfoRow label="Miles">
              {drayageMeta.miles || drayageMeta.miles_to_travel || "—"}
            </InfoRow>
            <InfoRow label="Ship by">
              {drayageMeta.shipByDate ||
                drayageMeta.ship_by_date ||
                drayageMeta.requested_ship_by ||
                "—"}
            </InfoRow>
            <InfoRow label="Origin">
              {drayageMeta.origin || drayageMeta.origin_city || "—"}
            </InfoRow>
            <InfoRow label="Destination">
              {drayageMeta.destination ||
                drayageMeta.destination_city ||
                "—"}
            </InfoRow>
          </div>
        </div>
      )}

      <div className="mt-6">
        <Link
          href={`/dashboard/ai-inspector?id=${encodeURIComponent(email.id)}`}
          className="inline-block px-3 py-1 text-sm bg-blue-600 text-white rounded"
        >
          View AI Breakdown
        </Link>
      </div>

      {"aiResponse" in email && (
        <div className="mt-6 p-4 bg-gray-50 border rounded">
          <div className="font-medium mb-2">AI generated quote</div>
          <div className="whitespace-pre-wrap text-sm text-gray-800 max-h-60 overflow-auto">
            {aiQuoteBody || "(no draft)"}
          </div>
          <div className="mt-4">
            <PricingBreakdownTable quote={quote} note={pricingNote} />
          </div>

          {/* reply UI */}
          <div className="mt-4">
            <ReplyBox
              emailId={email.id}
              onAppend={(newText) => {
                const updated =
                  (aiResponse || "") + "\n\n[AI reply]\n" + (newText || "");
                (email as any).aiResponse = updated;
                setDetails((prev) =>
                  prev ? { ...prev, aiResponse: updated } : prev
                );
                loadDetails();
              }}
              onSent={() => loadDetails()}
            />
          </div>
        </div>
      )}

      {/* Logs / history panel */}
      <div className="mt-6">
        <div className="font-medium mb-2">History / Logs</div>
        <div className="bg-white border rounded p-3">
          {logs === null && (
            <div className="text-sm text-gray-500">Loading...</div>
          )}
          {logs && logs.length === 0 && (
            <div className="text-sm text-gray-500">No logs.</div>
          )}
          {logs && logs.length > 0 && (
            <ul className="space-y-3 text-sm">
              {logs.map((l: any) => (
                <li key={l.id} className="border-b pb-2 last:border-b-0">
                  <div className="text-xs text-gray-400">
                    {new Date(l.createdAt).toLocaleString()} �?� {l.type}
                  </div>
                  <div className="mt-1 text-gray-800 whitespace-pre-wrap">
                    {l.message}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-xs uppercase text-blue-700 font-medium">
        {label}
      </span>
      <span className="text-sm text-blue-900">{children}</span>
    </div>
  );
}

function ReplyBox({
  emailId,
  onAppend,
  onSent,
}: {
  emailId: string;
  onAppend?: (s: string) => void;
  onSent?: () => void;
}) {
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function send() {
    if (!msg.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/emails/${encodeURIComponent(emailId)}/reply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: msg }),
        }
      );
      const json = await res.json();
      if (json?.status === "ok") {
        onAppend?.(json.aiReply || "(no reply)");
        setMsg("");
        onSent?.();
      } else {
        alert("Reply failed: " + (json?.error || "unknown"));
      }
    } catch (e) {
      alert("Reply failed: " + String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3">
      <textarea
        value={msg}
        onChange={(e) => setMsg(e.target.value)}
        placeholder="Ask the AI for clarification or details..."
        className="w-full border rounded p-2 text-sm"
        rows={3}
      />
      <div className="mt-2 flex gap-2">
        <button
          onClick={send}
          disabled={loading}
          className="px-3 py-1 bg-blue-600 text-white rounded text-sm"
        >
          {loading ? "Sending..." : "Send to AI"}
        </button>
        <button
          onClick={() => setMsg("")}
          className="px-3 py-1 bg-gray-200 rounded text-sm"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
