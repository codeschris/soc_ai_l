import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { DEFAULT_DISCLOSURE } from "@/lib/publisher";

const createSchema = z.object({
  socialAccountId: z.string().min(1),
  voiceProfileId: z.string().min(1).optional(),
  brief: z.string().max(6000).optional(),
  caption: z.string().min(1).max(6000),
  hashtags: z.array(z.string().min(1).max(80)).max(30).default([]),
  mediaUrls: z.array(z.string().url()).max(10).default([]),
  mediaType: z.enum(["IMAGE", "VIDEO", "CAROUSEL"]).default("IMAGE"),
  aiAssisted: z.boolean().default(true),
  /** Creators may disclose AI assistance in the post body. */
  discloseAi: z.boolean().default(false),
  scheduledAt: z.coerce.date().optional(),
});

function normaliseTags(tags: string[]) {
  return tags
    .map((t) => `#${t.trim().replace(/^#+/, "").replace(/\s+/g, "")}`)
    .filter((t) => t.length > 1);
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const status = new URL(req.url).searchParams.get("status");

    const posts = await prisma.post.findMany({
      where: {
        userId: user.id,
        ...(status ? { status: status as never } : {}),
      },
      include: { socialAccount: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json({ posts });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = createSchema.parse(await req.json());

    const account = await prisma.socialAccount.findFirst({
      where: { id: body.socialAccountId, userId: user.id },
    });
    if (!account) {
      return NextResponse.json({ error: "Connected account not found." }, { status: 404 });
    }

    const post = await prisma.post.create({
      data: {
        userId: user.id,
        socialAccountId: account.id,
        voiceProfileId: body.voiceProfileId,
        brief: body.brief,
        caption: body.caption,
        hashtags: normaliseTags(body.hashtags),
        mediaUrls: body.mediaUrls,
        mediaType: body.mediaType,
        aiAssisted: body.aiAssisted,
        disclosureText:
          body.aiAssisted && body.discloseAi ? DEFAULT_DISCLOSURE : null,
        scheduledAt: body.scheduledAt,
        // Everything starts unapproved. A human must sign off before publishing.
        status: "PENDING_APPROVAL",
      },
      include: { socialAccount: true },
    });

    await logAction({
      userId: user.id,
      action: "post.created",
      entity: "Post",
      entityId: post.id,
      metadata: { aiAssisted: body.aiAssisted },
    });

    return NextResponse.json({ post }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
