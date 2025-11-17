"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function SendTestEmailButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function send() {
    setLoading(true);

    const sample = `Hello,

We need 40 palletized units, fragile items, pickup in Houston, deliver to Los Angeles. Please quote ASAP.

Thanks,
Acme Corp`;

    try {
      const res = await fetch("/api/ai-mail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailText: sample }),
      });

      const data = await res.json();
      if (!res.ok) {
        console.error(data);
        setLoading(false);
        return;
      }

      // navigate to the new email detail page
      if (data.emailId) router.push(`/dashboard/inbox/${data.emailId}`);
    } catch (err) {
      console.error(err);
    }

    setLoading(false);
  }

  return <Button onClick={send} disabled={loading}>{loading ? "Sending..." : "Send Test Email"}</Button>;
}
