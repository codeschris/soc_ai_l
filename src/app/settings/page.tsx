import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { availableProviders } from "@/lib/ai";
import { prisma } from "@/lib/db";
import { Card } from "@/components/ui";
import { hasActiveConsent } from "@/lib/publisher";
import { ConsentToggle } from "./consent";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [granted, logs] = await Promise.all([
    hasActiveConsent(userId),
    prisma.auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
  ]);

  const providers = availableProviders();

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Control what the AI is allowed to do on your behalf.
        </p>
      </div>

      <ConsentToggle granted={granted} />

      <Card
        title="AI providers"
        description="Configured on the server. The composer lets you pick per post."
      >
        {providers.length === 0 ? (
          <p className="text-sm text-neutral-500">
            None configured. Set OPENAI_API_KEY, ANTHROPIC_API_KEY or
            GEMINI_API_KEY.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {providers.map((p) => (
              <li
                key={p}
                className="rounded-full bg-neutral-100 px-3 py-1 text-sm text-neutral-700"
              >
                {p}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        title="Activity log"
        description="Every generation, approval and publish is recorded."
      >
        {logs.length === 0 ? (
          <p className="text-sm text-neutral-500">No activity yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-100 text-sm">
            {logs.map((l) => (
              <li key={l.id} className="flex justify-between gap-4 py-2">
                <span className="text-neutral-700">{l.action}</span>
                <span className="shrink-0 text-xs text-neutral-400">
                  {l.createdAt.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}
