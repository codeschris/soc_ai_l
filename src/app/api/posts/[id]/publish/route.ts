import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { publishPost } from "@/lib/publisher";

export const maxDuration = 120;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const post = await publishPost(id, user.id);
    return NextResponse.json({ post });
  } catch (err) {
    return apiError(err);
  }
}
