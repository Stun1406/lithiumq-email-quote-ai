"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function EmailActions({ emailId }: { emailId: string }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function doAction(action: string, endpoint: string, successText: string) {
    setLoading(action);
    setMessage("");

    try {
      const res = await fetch(endpoint, { method: "POST" });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error);

      setMessage(successText);

      // reload page automatically
      setTimeout(() => window.location.reload(), 800);
    } catch (err: any) {
      setMessage("Error: " + err.message);
    }

    setLoading(null);
  }

  return (
    <div className="space-y-3 border p-4 rounded-lg bg-gray-50">
      <h2 className="font-semibold text-lg">Actions</h2>

      <div className="flex flex-wrap gap-3">

        <Button
          disabled={loading !== null}
          onClick={() =>
            doAction(
              "reprocess",
              `/api/emails/${emailId}/process`,
              "Email reprocessed successfully!"
            )
          }
        >
          {loading === "reprocess" ? "Processing..." : "Reprocess AI"}
        </Button>

        <Button
          disabled={loading !== null}
          onClick={() =>
            doAction(
              "confirm",
              `/api/emails/${emailId}/confirm`,
              "Email marked as confirmed."
            )
          }
          className="bg-green-600 hover:bg-green-700"
        >
          {loading === "confirm" ? "Updating..." : "Mark Confirmed"}
        </Button>

        <Button
          disabled={loading !== null}
          onClick={() =>
            doAction(
              "close",
              `/api/emails/${emailId}/close`,
              "Email closed."
            )
          }
          className="bg-red-600 hover:bg-red-700"
        >
          {loading === "close" ? "Updating..." : "Close Email"}
        </Button>
      </div>

      {message && <p className="text-sm text-blue-600">{message}</p>}
    </div>
  );
}
