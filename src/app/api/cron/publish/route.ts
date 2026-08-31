import { NextResponse } from "next/server";
import { runDueScheduledPosts } from "@/lib/publisher";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Scheduler entrypoint. Point a cron (Vercel Cron, GitHub Actions, systemd
 * timer) at this route. Protected by a shared secret.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not set." }, { status: 503 });
  }

  const auth = req.headers.get("authorization");
  const provided =
    auth?.replace(/^Bearer\s+/i, "") ??
    new URL(req.url).searchParams.get("secret");

  if (provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await runDueScheduledPosts();
  return NextResponse.json({ processed: results.length, results });
}
