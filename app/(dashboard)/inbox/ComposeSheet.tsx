"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function ComposeSheet() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="p-4 border-b flex justify-between items-center">
        <h2 className="text-lg font-semibold">Inbox</h2>
        <Button onClick={() => setOpen(true)}>Compose</Button>
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white w-[500px] p-6 rounded shadow-lg">
            <h3 className="text-lg font-semibold mb-4">New Email</h3>

            <div className="space-y-4">
              <Input placeholder="To:" />
              <Input placeholder="Subject:" />
              <Textarea placeholder="Write your message..." rows={6} />
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button>Send</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
