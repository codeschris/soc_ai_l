import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { prisma } from "@/lib/db";

const emojiUsage = z.enum(["NONE", "LIGHT", "MODERATE", "HEAVY"]);

const createSchema = z.object({
  name: z.string().min(1).max(80),
  bio: z.string().max(4000).optional(),
  niche: z.string().max(200).optional(),
  audience: z.string().max(400).optional(),
  toneKeywords: z.array(z.string().min(1).max(40)).max(15).default([]),
  forbidden: z.array(z.string().min(1).max(200)).max(30).default([]),
  emojiUsage: emojiUsage.default("MODERATE"),
  hashtagCount: z.number().int().min(0).max(30).default(8),
  language: z.string().min(2).max(20).default("en"),
  samples: z.array(z.string().min(10).max(5000)).max(50).default([]),
  isDefault: z.boolean().default(false),
});

export async function GET() {
  try {
    const user = await requireUser();
    const profiles = await prisma.voiceProfile.findMany({
      where: { userId: user.id },
      include: { samples: { orderBy: { createdAt: "desc" } } },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
    return NextResponse.json({ profiles });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = createSchema.parse(await req.json());

    if (body.isDefault) {
      await prisma.voiceProfile.updateMany({
        where: { userId: user.id },
        data: { isDefault: false },
      });
    }

    const profile = await prisma.voiceProfile.create({
      data: {
        userId: user.id,
        name: body.name,
        bio: body.bio,
        niche: body.niche,
        audience: body.audience,
        toneKeywords: body.toneKeywords,
        forbidden: body.forbidden,
        emojiUsage: body.emojiUsage,
        hashtagCount: body.hashtagCount,
        language: body.language,
        isDefault: body.isDefault,
        samples: {
          create: body.samples.map((content) => ({ content, source: "manual" })),
        },
      },
      include: { samples: true },
    });

    await logAction({
      userId: user.id,
      action: "voice_profile.created",
      entity: "VoiceProfile",
      entityId: profile.id,
    });

    return NextResponse.json({ profile }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
