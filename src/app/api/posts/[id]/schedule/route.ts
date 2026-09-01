import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { prisma } from "@/lib/db";

const schema = z.object({
  scheduledAt: z.coerce.date().nullable(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const { scheduledAt } = schema.parse(await req.json());

    const existing = await prisma.post.findFirst({ where: { id, userId: user.id } });
    if (!existing) return NextResponse.json({ error: "Post not found." }, { status: 404 });

    if (scheduledAt && scheduledAt.getTime() < Date.now()) {
      return NextResponse.json(
        { error: "Pick a time in the future." },
        { status: 422 },
      );
    }

    if (scheduledAt && !existing.approvedAt) {
      return NextResponse.json(
        { error: "Approve the post before scheduling it." },
        { status: 409 },
      );
    }

    const post = await prisma.post.update({
      where: { id },
      data: {
        scheduledAt,
        status: scheduledAt ? "SCHEDULED" : existing.approvedAt ? "APPROVED" : "PENDING_APPROVAL",
      },
      include: { socialAccount: true },
    });

    await logAction({
      userId: user.id,
      action: scheduledAt ? "post.scheduled" : "post.unscheduled",
      entity: "Post",
      entityId: id,
      metadata: { scheduledAt: scheduledAt?.toISOString() },
    });

    return NextResponse.json({ post });
  } catch (err) {
    return apiError(err);
  }
}
