import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { availableProviders } from "@/lib/ai";
import { hasActiveConsent } from "@/lib/publisher";
import { Composer } from "./composer";

export default async function ComposePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [accounts, profiles, consent] = await Promise.all([
    prisma.socialAccount.findMany({
      where: { userId, isActive: true },
      select: { id: true, platform: true, username: true },
      orderBy: { platform: "asc" },
    }),
    prisma.voiceProfile.findMany({
      where: { userId },
      select: { id: true, name: true, isDefault: true, styleGuide: true },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    }),
    hasActiveConsent(userId),
  ]);

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Compose</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Give a rough idea. Ghostline writes it the way you would.
        </p>
      </div>

      <Composer
        accounts={accounts.map((a) => ({
          id: a.id,
          label: `${a.platform === "INSTAGRAM" ? "Instagram" : "Facebook"} · ${a.username}`,
          platform: a.platform,
        }))}
        profiles={profiles.map((p) => ({
          id: p.id,
          name: p.name,
          trained: Boolean(p.styleGuide),
        }))}
        providers={availableProviders()}
        consentGranted={consent}
      />
    </main>
  );
}
