import { NextResponse } from "next/server";
import { z } from "zod";
import { synthesiseStyleGuide } from "@/lib/ai/voice";
import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { prisma } from "@/lib/db";

const schema = z.object({
  provider: z.enum(["openai", "anthropic", "gemini"]).optional(),
});

export const maxDuration = 60;

/** Learn (or relearn) the creator's voice fingerprint from their samples. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = schema.parse(await req.json().catch(() => ({})));

    const profile = await prisma.voiceProfile.findFirst({
      where: { id, userId: user.id },
      include: { samples: true },
    });
    if (!profile) {
      return NextResponse.json({ error: "Voice profile not found." }, { status: 404 });
    }
    if (profile.samples.length === 0) {
      return NextResponse.json(
        { error: "Add at least one of your own posts before training the voice." },
        { status: 422 },
      );
    }

    const { styleGuide, raw } = await synthesiseStyleGuide(
      profile.samples.map((s) => s.content),
      { provider: body.provider, hints: profile.bio },
    );

    const updated = await prisma.voiceProfile.update({
      where: { id },
      data: { styleGuide, styleGuideAt: new Date() },
    });

    await prisma.generation.create({
      data: {
        provider: raw.provider,
        model: raw.model,
        prompt: `style-guide:${id}`,
        output: styleGuide,
        tokensIn: raw.tokensIn,
        tokensOut: raw.tokensOut,
        latencyMs: raw.latencyMs,
      },
    });

    await logAction({
      userId: user.id,
      action: "voice_profile.trained",
      entity: "VoiceProfile",
      entityId: id,
      metadata: { provider: raw.provider, samples: profile.samples.length },
    });

    return NextResponse.json({
      styleGuide: updated.styleGuide,
      styleGuideAt: updated.styleGuideAt,
      provider: raw.provider,
      model: raw.model,
    });
  } catch (err) {
    return apiError(err);
  }
}
