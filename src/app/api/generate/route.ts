import { NextResponse } from "next/server";
import { z } from "zod";
import { generatePost, type VoiceContext } from "@/lib/ai/voice";
import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { hasActiveConsent } from "@/lib/publisher";

const schema = z.object({
  brief: z.string().min(3).max(6000),
  socialAccountId: z.string().min(1),
  voiceProfileId: z.string().min(1).optional(),
  mediaUrls: z.array(z.string().url()).max(10).default([]),
  mediaType: z.enum(["IMAGE", "VIDEO", "CAROUSEL"]).default("IMAGE"),
  provider: z.enum(["openai", "anthropic", "gemini"]).optional(),
  variants: z.number().int().min(1).max(4).default(2),
});

export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = schema.parse(await req.json());

    if (!(await hasActiveConsent(user.id))) {
      return NextResponse.json(
        {
          error:
            "AI ghostwriting consent is not active. Grant consent in Settings to let the AI write as you.",
        },
        { status: 403 },
      );
    }

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
      include: { samples: { orderBy: { createdAt: "desc" }, take: 8 } },
    });
    if (!profile) {
      return NextResponse.json(
        { error: "Set up a voice profile first so the AI knows how you write." },
        { status: 404 },
      );
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

    const result = await generatePost({
      brief: body.brief,
      platform: account.platform,
      mediaType: body.mediaType,
      mediaUrls: body.mediaUrls,
      voice,
      provider: body.provider,
      variants: body.variants,
    });

    await prisma.generation.create({
      data: {
        provider: result.raw.provider,
        model: result.raw.model,
        prompt: result.prompt,
        output: result.raw.text,
        tokensIn: result.raw.tokensIn,
        tokensOut: result.raw.tokensOut,
        latencyMs: result.raw.latencyMs,
      },
    });

    await logAction({
      userId: user.id,
      action: "content.generated",
      metadata: {
        provider: result.raw.provider,
        model: result.raw.model,
        platform: account.platform,
      },
    });

    return NextResponse.json({
      variants: result.variants,
      provider: result.raw.provider,
      model: result.raw.model,
      voiceProfileId: profile.id,
      /** Transparency: the UI shows this so the creator always knows AI wrote it. */
      aiAssisted: true,
    });
  } catch (err) {
    return apiError(err);
  }
}
