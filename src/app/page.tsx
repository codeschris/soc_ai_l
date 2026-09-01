import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Banner, Card, StatusBadge } from "@/components/ui";
import { hasActiveConsent } from "@/lib/publisher";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const userId = session.user.id;

  const [accounts, profiles, pending, scheduled, published, consent] =
    await Promise.all([
      prisma.socialAccount.count({ where: { userId, isActive: true } }),
      prisma.voiceProfile.count({ where: { userId } }),
      prisma.post.count({ where: { userId, status: "PENDING_APPROVAL" } }),
      prisma.post.count({ where: { userId, status: "SCHEDULED" } }),
      prisma.post.count({ where: { userId, status: "PUBLISHED" } }),
      hasActiveConsent(userId),
    ]);

  const recent = await prisma.post.findMany({
    where: { userId },
    include: { socialAccount: true },
    orderBy: { updatedAt: "desc" },
    take: 5,
  });

  const stats = [
    { label: "Connected accounts", value: accounts, href: "/accounts" },
    { label: "Voice profiles", value: profiles, href: "/voice" },
    { label: "Awaiting your approval", value: pending, href: "/queue" },
    { label: "Scheduled", value: scheduled, href: "/queue" },
    { label: "Published", value: published, href: "/queue" },
  ];

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome back{session.user.name ? `, ${session.user.name}` : ""}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Ghostline writes in your voice. You always approve before anything goes
          out.
        </p>
      </div>

      {!consent ? (
        <Banner tone="warning">
          AI ghostwriting consent is currently revoked. Generation and publishing
          are disabled until you re-enable it in{" "}
          <Link href="/settings" className="underline">
            Settings
          </Link>
          .
        </Banner>
      ) : null}

      {accounts === 0 ? (
        <Banner tone="info">
          Connect an Instagram or Facebook account to start publishing.{" "}
          <Link href="/accounts" className="underline">
            Connect now
          </Link>
          .
        </Banner>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-neutral-400"
          >
            <div className="text-2xl font-semibold">{s.value}</div>
            <div className="mt-1 text-xs text-neutral-500">{s.label}</div>
          </Link>
        ))}
      </div>

      <Card title="Recent activity">
        {recent.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Nothing yet.{" "}
            <Link href="/compose" className="underline">
              Draft your first post
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {recent.map((p) => (
              <li key={p.id} className="flex items-start gap-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-neutral-800">
                    {p.caption.slice(0, 120) || "(no caption)"}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {p.socialAccount.platform.toLowerCase()} ·{" "}
                    {p.socialAccount.username}
                    {p.aiAssisted ? " · AI-assisted" : ""}
                  </p>
                </div>
                <StatusBadge status={p.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}
