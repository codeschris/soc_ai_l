import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { QueueList } from "./list";

export default async function QueuePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const posts = await prisma.post.findMany({
    where: { userId: session.user.id },
    include: { socialAccount: true },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
    take: 100,
  });

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Queue</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Approve, schedule and publish. Nothing leaves here without your sign-off.
        </p>
      </div>

      <QueueList
        posts={posts.map((p) => ({
          id: p.id,
          caption: p.caption,
          hashtags: p.hashtags,
          status: p.status,
          scheduledAt: p.scheduledAt?.toISOString() ?? null,
          publishedAt: p.publishedAt?.toISOString() ?? null,
          approvedAt: p.approvedAt?.toISOString() ?? null,
          permalink: p.permalink,
          error: p.error,
          aiAssisted: p.aiAssisted,
          disclosureText: p.disclosureText,
          mediaUrls: p.mediaUrls,
          account: `${p.socialAccount.platform === "INSTAGRAM" ? "Instagram" : "Facebook"} · ${p.socialAccount.username}`,
        }))}
      />
    </main>
  );
}
