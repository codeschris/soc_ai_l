import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { availableProviders } from "@/lib/ai";
import { prisma } from "@/lib/db";
import { VoiceEditor } from "./editor";

export default async function VoicePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const profiles = await prisma.voiceProfile.findMany({
    where: { userId: session.user.id },
    include: { samples: { orderBy: { createdAt: "asc" } } },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Your voice</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Paste posts you actually wrote. Ghostline studies them and learns to
          sound like you — never like anyone else.
        </p>
      </div>

      <VoiceEditor
        providers={availableProviders()}
        profiles={profiles.map((p) => ({
          id: p.id,
          name: p.name,
          bio: p.bio ?? "",
          niche: p.niche ?? "",
          audience: p.audience ?? "",
          toneKeywords: p.toneKeywords,
          forbidden: p.forbidden,
          emojiUsage: p.emojiUsage,
          hashtagCount: p.hashtagCount,
          language: p.language,
          isDefault: p.isDefault,
          styleGuide: p.styleGuide,
          styleGuideAt: p.styleGuideAt?.toISOString() ?? null,
          samples: p.samples.map((s) => s.content),
        }))}
      />
    </main>
  );
}
