import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { metaOAuthUrl } from "@/lib/social/meta";

export async function GET() {
  try {
    await requireUser();

    if (!process.env.META_APP_ID || !process.env.META_APP_SECRET) {
      return NextResponse.json(
        { error: "Meta app credentials are not configured on the server." },
        { status: 503 },
      );
    }

    const state = randomBytes(16).toString("hex");
    const jar = await cookies();
    jar.set("meta_oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 600,
      path: "/",
    });

    return NextResponse.redirect(metaOAuthUrl(state));
  } catch (err) {
    return apiError(err);
  }
}
