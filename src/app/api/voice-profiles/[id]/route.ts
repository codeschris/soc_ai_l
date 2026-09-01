import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  bio: z.string().max(4000).nullable().optional(),
  niche: z.string().max(200).nullable().optional(),
  audience: z.string().max(400).nullable().optional(),
  toneKeywords: z.array(z.string().min(1).max(40)).max(15).optional(),
  forbidden: z.array(z.string().min(1).max(200)).max(30).optional(),
  emojiUsage: z.enum(["NONE", "LIGHT", "MODERATE", "HEAVY"]).optional(),
  hashtagCount: z.number().int().min(0).max(30).optional(),
  language: z.string().min(2).max(20).optional(),
  isDefault: z.boolean().optional(),
  /** Replaces the full sample corpus when supplied. */
  samples: z.array(z.string().min(10).max(5000)).max(50).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

async function ownedProfile(userId: string, id: string) {
  const profile = await prisma.voiceProfile.findFirst({
    where: { id, userId },
    include: { samples: true },
  });
  if (!profile) throw new Error("Voice profile not found.");
  return profile;
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    return NextResponse.json({ profile: await ownedProfile(user.id, id) });
  } catch (err) {
    return apiError(err);
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    await ownedProfile(user.id, id);

    const body = patchSchema.parse(await req.json());
    const { samples, ...rest } = body;

    if (rest.isDefault) {
      await prisma.voiceProfile.updateMany({
        where: { userId: user.id },
        data: { isDefault: false },
      });
    }

    if (samples) {
      await prisma.writingSample.deleteMany({ where: { voiceProfileId: id } });
      await prisma.writingSample.createMany({
        data: samples.map((content) => ({
          voiceProfileId: id,
          content,
          source: "manual",
        })),
      });
    }

    const profile = await prisma.voiceProfile.update({
      where: { id },
      data: {
        ...rest,
        // Samples changed, so the learned fingerprint is stale.
        ...(samples ? { styleGuide: null, styleGuideAt: null } : {}),
      },
      include: { samples: true },
    });

    return NextResponse.json({ profile });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    await ownedProfile(user.id, id);
    await prisma.voiceProfile.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
