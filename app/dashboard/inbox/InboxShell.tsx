"use client";

import { useEffect, useState } from "react";
import EmailList from "./EmailList";
import dynamic from "next/dynamic";
const EmailViewer = dynamic(() => import("./EmailViewer"), { ssr: false });
import ComposeSheet from "./ComposeSheet";

type EmailRow = {
  id: string;
  from: string;
  subject: string;
  body: string;
  date: string;
  aiResponse?: string | null;
};

export default function InboxShell({ emails: initialEmails }: { emails?: EmailRow[] }) {
  const [emails, setEmails] = useState<EmailRow[]>(initialEmails || []);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedEmail = emails.find((e) => e.id === selectedId) || null;

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/emails');
      const json = await res.json();
      if (json?.status === 'ok' && Array.isArray(json.emails)) {
        const mapped = json.emails.map((r: any) => ({
          id: String(r.id),
          from: r.senderEmail || r.senderName || 'unknown',
          subject: r.subject || '(no subject)',
          body: r.body || '',
          date: new Date(r.createdAt).toLocaleString(),
          aiResponse: r.aiResponse || null,
        }));
        setEmails(mapped);
      }
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // load on mount
    load();
    // reload on external signal and optionally select created id
    const handler = (e: any) => {
      load().then(() => {
        const createdId = e?.detail?.id;
        if (createdId) setSelectedId(String(createdId));
      });
    };
    window.addEventListener("emails:updated", handler as EventListener);
    return () => window.removeEventListener("emails:updated", handler as EventListener);
  }, []);

  return (
    <div className="flex h-full">
      <EmailList emails={emails} selected={selectedId} onSelect={setSelectedId} />

      <div className="flex flex-col flex-1">
        <ComposeSheet />
        <EmailViewer email={selectedEmail} />
      </div>
    </div>
  );
}
