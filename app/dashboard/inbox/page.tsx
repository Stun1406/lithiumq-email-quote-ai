"use client";

import { useState } from "react";
import { inboxData } from "./data";
import EmailList from "./EmailList";
import EmailViewer from "./EmailViewer";
import ComposeSheet from "./ComposeSheet";

export default function InboxPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedEmail = inboxData.find((e) => e.id === selectedId) || null;

  return (
    <div className="flex h-full">
      <EmailList
        emails={inboxData}
        selected={selectedId}
        onSelect={setSelectedId}
      />

      <div className="flex flex-col flex-1">
        <ComposeSheet />
        <EmailViewer email={selectedEmail} />
      </div>
    </div>
  );
}
