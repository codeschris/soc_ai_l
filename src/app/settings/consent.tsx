"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Banner, Button, Card } from "@/components/ui";

export function ConsentToggle({ granted }: { granted: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    await fetch("/api/consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ granted: !granted }),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <Card
      title="AI ghostwriting consent"
      description="Ghostline may only write as you while this is on."
    >
      <div className="space-y-4">
        {granted ? (
          <Banner tone="success">
            Consent is active. The AI can draft posts in your voice, and you
            approve each one before it publishes.
          </Banner>
        ) : (
          <Banner tone="warning">
            Consent is revoked. Generation and publishing are disabled, and any
            approved or scheduled posts were returned to your review queue.
          </Banner>
        )}

        <ul className="list-disc space-y-1.5 pl-5 text-sm text-neutral-600">
          <li>The AI writes only for accounts you personally connected.</li>
          <li>It may not invent facts, endorsements or experiences about you.</li>
          <li>Every post needs your explicit approval before publishing.</li>
          <li>Editing an approved post automatically withdraws that approval.</li>
          <li>You can revoke this at any time, and it takes effect immediately.</li>
        </ul>

        <Button variant={granted ? "danger" : "primary"} disabled={busy} onClick={toggle}>
          {busy ? "Updating…" : granted ? "Revoke consent" : "Grant consent"}
        </Button>
      </div>
    </Card>
  );
}
