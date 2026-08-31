import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DEFAULT_DISCLOSURE } from "@/lib/publisher";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  caption: z.string().min(1).max(6000).optional(),
  hashtags: z.array(z.string().min(1).max(80)).max(30).optional(),
  mediaUrls: z.array(z.string().url()).max(10).optional(),
  mediaType: z.enum(["IMAGE", "VIDEO", "CAROUSEL"]).optional(),
  scheduledAt: z.coerce.date().nullable().optional(),
  discloseAi: z.boolean().optional(),
});

const LOCKED = new Set(["PUBLISHING", "PUBLISHED"]);

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;

    const post = await prisma.post.findFirst({
      where: { id, userId: user.id },
      include: { socialAccount: true, generations: true },
    });
    if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });

    return NextResponse.json({ post });
  } catch (err) {
    return apiError(err);
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = patchSchema.parse(await req.json());

    const existing = await prisma.post.findFirst({ where: { id, userId: user.id } });
    if (!existing) return NextResponse.json({ error: "Post not found." }, { status: 404 });
    if (LOCKED.has(existing.status)) {
      return NextResponse.json(
        { error: "A published post can no longer be edited here." },
        { status: 409 },
      );
    }

    const { discloseAi, hashtags, ...rest } = body;
    const contentChanged =
      rest.caption !== undefined ||
      hashtags !== undefined ||
      rest.mediaUrls !== undefined;

    const post = await prisma.post.update({
      where: { id },
      data: {
        ...rest,
        ...(hashtags
          ? {
              hashtags: hashtags.map(
                (t) => `#${t.trim().replace(/^#+/, "").replace(/\s+/g, "")}`,
              ),
            }
          : {}),
        ...(discloseAi !== undefined
          ? {
              disclosureText:
                discloseAi && existing.aiAssisted ? DEFAULT_DISCLOSURE : null,
            }
          : {}),
        // Editing content revokes the previous human approval.
        ...(contentChanged
          ? {
              approvedAt: null,
              approvedBy: null,
              status: "PENDING_APPROVAL" as const,
            }
          : {}),
      },
      include: { socialAccount: true },
    });

    return NextResponse.json({ post });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;

    const existing = await prisma.post.findFirst({ where: { id, userId: user.id } });
    if (!existing) return NextResponse.json({ error: "Post not found." }, { status: 404 });

    await prisma.post.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
