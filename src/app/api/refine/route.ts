import { NextResponse } from "next/server";
import { z } from "zod";
import { refineCaption, type VoiceContext } from "@/lib/ai/voice";
import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

const schema = z.object({
  caption: z.string().min(1).max(6000),
  instruction: z.string().min(2).max(500),
  socialAccountId: z.string().min(1),
  voiceProfileId: z.string().min(1).optional(),
  provider: z.enum(["openai", "anthropic", "gemini"]).optional(),
});

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = schema.parse(await req.json());

    const account = await prisma.socialAccount.findFirst({
      where: { id: body.socialAccountId, userId: user.id },
    });
    if (!account) {
      return NextResponse.json({ error: "Connected account not found." }, { status: 404 });
    }

    const profile = await prisma.voiceProfile.findFirst({
      where: body.voiceProfileId
        ? { id: body.voiceProfileId, userId: user.id }
        : { userId: user.id, isDefault: true },
      include: { samples: { orderBy: { createdAt: "desc" }, take: 6 } },
    });
    if (!profile) {
      return NextResponse.json({ error: "Voice profile not found." }, { status: 404 });
    }

    const voice: VoiceContext = {
      name: profile.name,
      bio: profile.bio,
      niche: profile.niche,
      audience: profile.audience,
      toneKeywords: profile.toneKeywords,
      forbidden: profile.forbidden,
      emojiUsage: profile.emojiUsage,
      hashtagCount: profile.hashtagCount,
      language: profile.language,
      styleGuide: profile.styleGuide,
      samples: profile.samples.map((s) => s.content),
    };

    const { caption, raw } = await refineCaption({
      caption: body.caption,
      instruction: body.instruction,
      voice,
      platform: account.platform,
      provider: body.provider,
    });

    return NextResponse.json({ caption, provider: raw.provider, model: raw.model });
  } catch (err) {
    return apiError(err);
  }
}
