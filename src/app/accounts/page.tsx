import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Banner, Card } from "@/components/ui";
import { AccountList } from "./list";

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const params = await searchParams;
  const configured = Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);

  const accounts = await prisma.socialAccount.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
  });

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Connect the Instagram Business and Facebook Page accounts you own.
        </p>
      </div>

      {params.connected ? <Banner tone="success">{params.connected}</Banner> : null}
      {params.error ? <Banner tone="error">{params.error}</Banner> : null}

      {!configured ? (
        <Banner tone="warning">
          Meta app credentials are not set on the server. Add{" "}
          <code>META_APP_ID</code> and <code>META_APP_SECRET</code> to your
          environment to enable connecting.
        </Banner>
      ) : null}

      <AccountList
        connectEnabled={configured}
        accounts={accounts.map((a) => ({
          id: a.id,
          platform: a.platform,
          username: a.username,
          displayName: a.displayName,
          avatarUrl: a.avatarUrl,
          isActive: a.isActive,
          tokenExpires: a.tokenExpires?.toISOString() ?? null,
        }))}
      />

      <Card title="What Ghostline can do with these accounts">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-neutral-600">
          <li>Publish posts that you have personally approved.</li>
          <li>Read your Page and Instagram profile details to label the account.</li>
          <li>
            Nothing else. Ghostline never messages your followers, never follows
            or unfollows, and never posts without your approval.
          </li>
        </ul>
      </Card>
    </main>
  );
}
