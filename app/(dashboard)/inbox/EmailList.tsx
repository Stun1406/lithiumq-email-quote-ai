"use client";

import { Email } from "./data";

interface Props {
  emails: Email[];
  selected: string | null;
  onSelect: (id: string) => void;
}

export default function EmailList({ emails, selected, onSelect }: Props) {
  return (
    <div className="w-80 border-r bg-gray-50 overflow-y-auto">
      <div className="p-4 text-lg font-semibold">Inbox</div>
      {emails.map((email) => (
        <div
          key={email.id}
          onClick={() => onSelect(email.id)}
          className={`p-4 border-b cursor-pointer ${
            selected === email.id ? "bg-white" : "hover:bg-gray-200"
          }`}
        >
          <div className="font-medium">{email.from}</div>
          <div className="text-sm text-gray-700">{email.subject}</div>
          <div className="text-xs text-gray-500 mt-1">{email.date}</div>
        </div>
      ))}
    </div>
  );
}
