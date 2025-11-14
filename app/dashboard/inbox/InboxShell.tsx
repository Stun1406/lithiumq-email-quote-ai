"use client";

import { useState } from "react";
import EmailList from "./EmailList";
import EmailViewer from "./EmailViewer";
import ComposeSheet from "./ComposeSheet";

type EmailRow = {
  id: string;
  from: string;
  subject: string;
  body: string;
  date: string;
};

export default function InboxShell({ emails }: { emails: EmailRow[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedEmail = emails.find((e) => e.id === selectedId) || null;

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
