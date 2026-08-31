import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { prisma } from "@/lib/db";
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  listManagedPages,
} from "@/lib/social/meta";

function back(message: string, ok = false) {
  const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const url = new URL("/accounts", base);
  url.searchParams.set(ok ? "connected" : "error", message);
  return NextResponse.redirect(url);
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const params = new URL(req.url).searchParams;

    if (params.get("error")) {
      return back(params.get("error_description") ?? "Authorization was cancelled.");
    }

    const code = params.get("code");
    const state = params.get("state");
    const jar = await cookies();
    const expected = jar.get("meta_oauth_state")?.value;
    jar.delete("meta_oauth_state");

    if (!code) return back("Meta did not return an authorization code.");
    if (!state || state !== expected) return back("Invalid OAuth state. Try again.");

    const short = await exchangeCodeForToken(code);
    const long = await exchangeForLongLivedToken(short.access_token);
    const expires = long.expires_in
      ? new Date(Date.now() + long.expires_in * 1000)
      : null;

    const pages = await listManagedPages(long.access_token);
    if (pages.length === 0) {
      return back("No Facebook Pages found on this account.");
    }

    let connected = 0;

    for (const page of pages) {
      await prisma.socialAccount.upsert({
        where: {
          userId_platform_externalId: {
            userId: user.id,
            platform: "FACEBOOK",
            externalId: page.id,
          },
        },
        create: {
          userId: user.id,
          platform: "FACEBOOK",
          externalId: page.id,
          username: page.name,
          displayName: page.name,
          avatarUrl: page.picture?.data?.url,
          accessToken: page.access_token,
          tokenExpires: expires,
          pageId: page.id,
        },
        update: {
          username: page.name,
          displayName: page.name,
          avatarUrl: page.picture?.data?.url,
          accessToken: page.access_token,
          tokenExpires: expires,
          isActive: true,
        },
      });
      connected++;

      const ig = page.instagram_business_account;
      if (ig?.id) {
        await prisma.socialAccount.upsert({
          where: {
            userId_platform_externalId: {
              userId: user.id,
              platform: "INSTAGRAM",
              externalId: ig.id,
            },
          },
          create: {
            userId: user.id,
            platform: "INSTAGRAM",
            externalId: ig.id,
            username: ig.username ?? page.name,
            displayName: page.name,
            avatarUrl: ig.profile_picture_url,
            // IG publishing uses the owning Page's token.
            accessToken: page.access_token,
            tokenExpires: expires,
            pageId: page.id,
          },
          update: {
            username: ig.username ?? page.name,
            avatarUrl: ig.profile_picture_url,
            accessToken: page.access_token,
            tokenExpires: expires,
            pageId: page.id,
            isActive: true,
          },
        });
        connected++;
      }
    }

    await logAction({
      userId: user.id,
      action: "social.connected",
      metadata: { provider: "meta", accounts: connected },
    });

    return back(`${connected} account(s) connected.`, true);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection failed.";
    return back(message);
  }
}
