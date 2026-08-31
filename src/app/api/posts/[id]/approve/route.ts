import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { prisma } from "@/lib/db";

const schema = z.object({
  approve: z.boolean().default(true),
  reason: z.string().max(500).optional(),
});

/**
 * The human-in-the-loop gate. Publishing is impossible without this call —
 * see `publishPost` in src/lib/publisher.ts.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = schema.parse(await req.json().catch(() => ({})));

    const existing = await prisma.post.findFirst({ where: { id, userId: user.id } });
    if (!existing) return NextResponse.json({ error: "Post not found." }, { status: 404 });

    if (existing.status === "PUBLISHED" || existing.status === "PUBLISHING") {
      return NextResponse.json(
        { error: "This post is already publishing or published." },
        { status: 409 },
      );
    }

    const post = await prisma.post.update({
      where: { id },
      data: body.approve
        ? {
            approvedAt: new Date(),
            approvedBy: user.id,
            status: existing.scheduledAt ? "SCHEDULED" : "APPROVED",
            error: null,
          }
        : {
            approvedAt: null,
            approvedBy: null,
            status: "REJECTED",
            error: body.reason ?? null,
          },
      include: { socialAccount: true },
    });

    await logAction({
      userId: user.id,
      action: body.approve ? "post.approved" : "post.rejected",
      entity: "Post",
      entityId: id,
      metadata: { reason: body.reason },
    });

    return NextResponse.json({ post });
  } catch (err) {
    return apiError(err);
  }
}
