"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card } from "@/components/ui";

type Account = {
  id: string;
  platform: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  tokenExpires: string | null;
};

export function AccountList({
  accounts,
  connectEnabled,
}: {
  accounts: Account[];
  connectEnabled: boolean;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function disconnect(id: string) {
    setBusyId(id);
    await fetch(`/api/social/accounts?id=${id}`, { method: "DELETE" });
    setBusyId(null);
    router.refresh();
  }

  return (
    <Card
      title="Connected accounts"
      footer={
        <a
          href={connectEnabled ? "/api/social/meta/connect" : undefined}
          className={`inline-flex items-center rounded-lg px-3.5 py-2 text-sm font-medium ${
            connectEnabled
              ? "bg-neutral-900 text-white hover:bg-neutral-700"
              : "pointer-events-none bg-neutral-200 text-neutral-500"
          }`}
        >
          Connect Instagram &amp; Facebook
        </a>
      }
    >
      {accounts.length === 0 ? (
        <p className="text-sm text-neutral-500">Nothing connected yet.</p>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {accounts.map((a) => (
            <li key={a.id} className="flex items-center gap-4 py-3">
              {a.avatarUrl ? (
                // Avatar URLs come from Meta's CDN on arbitrary hosts.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={a.avatarUrl}
                  alt=""
                  className="h-9 w-9 rounded-full object-cover"
                />
              ) : (
                <div className="h-9 w-9 rounded-full bg-neutral-200" />
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{a.username}</p>
                <p className="text-xs text-neutral-500">
                  {a.platform === "INSTAGRAM" ? "Instagram" : "Facebook Page"}
                  {a.tokenExpires
                    ? ` · token expires ${new Date(a.tokenExpires).toLocaleDateString()}`
                    : ""}
                </p>
              </div>

              <Button
                variant="ghost"
                disabled={busyId === a.id}
                onClick={() => disconnect(a.id)}
              >
                Disconnect
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
