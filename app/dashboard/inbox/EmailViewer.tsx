"use client";

import Link from "next/link";
import { Email } from "./data";

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

  return (
    <div className="flex-1 p-8 overflow-y-auto">
      <h2 className="text-xl font-bold">{email.subject}</h2>
      <p className="text-sm text-gray-500 mt-1">{email.from}</p>
      <hr className="my-4" />
      <p className="text-gray-800 whitespace-pre-wrap">{email.body}</p>

      <div className="mt-6">
        <Link
          href={`/dashboard/ai-inspector?id=${encodeURIComponent(email.id)}`}
          className="inline-block px-3 py-1 text-sm bg-blue-600 text-white rounded"
        >
          View AI Breakdown
        </Link>
      </div>

      {"aiResponse" in email && email.aiResponse && (
        <div className="mt-6 p-4 bg-gray-50 border rounded">
          <div className="font-medium mb-2">AI generated quote</div>
          <div className="whitespace-pre-wrap text-sm text-gray-800">{email.aiResponse}</div>
        </div>
      )}
    </div>
  );
}
