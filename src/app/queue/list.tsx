"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Banner, Button, Card, StatusBadge } from "@/components/ui";

type QueuePost = {
  id: string;
  caption: string;
  hashtags: string[];
  status: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  approvedAt: string | null;
  permalink: string | null;
  error: string | null;
  aiAssisted: boolean;
  disclosureText: string | null;
  mediaUrls: string[];
  account: string;
};

const FILTERS = [
  { key: "ALL", label: "All" },
  { key: "PENDING_APPROVAL", label: "Needs approval" },
  { key: "APPROVED", label: "Approved" },
  { key: "SCHEDULED", label: "Scheduled" },
  { key: "PUBLISHED", label: "Published" },
  { key: "FAILED", label: "Failed" },
];

export function QueueList({ posts }: { posts: QueuePost[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState("ALL");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visible =
    filter === "ALL" ? posts : posts.filter((p) => p.status === filter);

  async function act(id: string, path: string, body: unknown) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/posts/${id}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Action failed.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    setBusyId(id);
    await fetch(`/api/posts/${id}`, { method: "DELETE" });
    setBusyId(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {error ? <Banner tone="error">{error}</Banner> : null}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1 text-sm transition ${
              filter === f.key
                ? "bg-neutral-900 text-white"
                : "border border-neutral-300 bg-white text-neutral-600 hover:border-neutral-500"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <Card>
          <p className="text-sm text-neutral-500">Nothing here.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {visible.map((p) => (
            <Card key={p.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="text-xs text-neutral-500">
                  {p.account}
                  {p.aiAssisted ? " · AI-assisted" : " · written by you"}
                  {p.scheduledAt
                    ? ` · scheduled ${new Date(p.scheduledAt).toLocaleString()}`
                    : ""}
                  {p.publishedAt
                    ? ` · published ${new Date(p.publishedAt).toLocaleString()}`
                    : ""}
                </div>
                <StatusBadge status={p.status} />
              </div>

              <p className="mt-3 whitespace-pre-wrap text-sm text-neutral-800">
                {p.caption}
              </p>

              {p.disclosureText ? (
                <p className="mt-2 text-sm italic text-neutral-500">
                  {p.disclosureText}
                </p>
              ) : null}

              {p.hashtags.length ? (
                <p className="mt-2 text-sm text-blue-700">{p.hashtags.join(" ")}</p>
              ) : null}

              {p.mediaUrls.length ? (
                <p className="mt-2 text-xs text-neutral-400">
                  {p.mediaUrls.length} media attachment(s)
                </p>
              ) : null}

              {p.error ? (
                <div className="mt-3">
                  <Banner tone="error">{p.error}</Banner>
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                {!p.approvedAt && p.status !== "PUBLISHED" ? (
                  <Button
                    disabled={busyId === p.id}
                    onClick={() => act(p.id, "/approve", { approve: true })}
                  >
                    Approve
                  </Button>
                ) : null}

                {p.approvedAt && p.status !== "PUBLISHED" ? (
                  <Button
                    disabled={busyId === p.id}
                    onClick={() => act(p.id, "/publish", {})}
                  >
                    {busyId === p.id ? "Publishing…" : "Publish now"}
                  </Button>
                ) : null}

                {p.approvedAt && p.status !== "PUBLISHED" ? (
                  <Button
                    variant="secondary"
                    disabled={busyId === p.id}
                    onClick={() => act(p.id, "/approve", { approve: false })}
                  >
                    Withdraw approval
                  </Button>
                ) : null}

                {p.permalink ? (
                  <a
                    href={p.permalink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center rounded-lg border border-neutral-300 px-3.5 py-2 text-sm hover:bg-neutral-100"
                  >
                    View post
                  </a>
                ) : null}

                {p.status !== "PUBLISHED" ? (
                  <Button
                    variant="ghost"
                    disabled={busyId === p.id}
                    onClick={() => remove(p.id)}
                  >
                    Delete
                  </Button>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
