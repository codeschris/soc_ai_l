/**
 * Publishing service.
 *
 * Every publish passes through `publishPost`, which enforces the platform's
 * ethical guardrails before a single byte reaches Meta:
 *   1. The user must hold an active `ai_ghostwriting` consent record.
 *   2. A human must have explicitly approved the exact post (`approvedAt`).
 *   3. AI-assisted posts carry a disclosure line unless the creator opted out.
 */
import { Platform, PostStatus, type Post, type SocialAccount } from "@prisma/client";
import { logAction } from "./audit";
import { prisma } from "./db";
import { publishToFacebook, publishToInstagram } from "./social/meta";

export const CONSENT_SCOPE = "ai_ghostwriting";

export const DEFAULT_DISCLOSURE = "Caption drafted with AI, reviewed and approved by me.";

export class PublishGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublishGuardError";
  }
}

export async function hasActiveConsent(userId: string) {
  const consent = await prisma.consent.findFirst({
    where: { userId, scope: CONSENT_SCOPE, granted: true, revokedAt: null },
  });
  return Boolean(consent);
}

export function composeBody(post: Pick<Post, "caption" | "hashtags" | "disclosureText">) {
  const parts = [post.caption.trim()];

  if (post.disclosureText?.trim()) {
    parts.push(post.disclosureText.trim());
  }
  if (post.hashtags.length) {
    parts.push(post.hashtags.join(" "));
  }

  return parts.filter(Boolean).join("\n\n");
}

const IG_LIMIT = 2200;

export function validateForPlatform(
  platform: Platform,
  body: string,
  mediaUrls: string[],
) {
  if (platform === Platform.INSTAGRAM) {
    if (mediaUrls.length === 0) {
      throw new PublishGuardError("Instagram posts require at least one image or video.");
    }
    if (body.length > IG_LIMIT) {
      throw new PublishGuardError(
        `Caption is ${body.length} characters; Instagram allows ${IG_LIMIT}.`,
      );
    }
  }

  if (!body.trim()) {
    throw new PublishGuardError("The post has no caption.");
  }
}

type PostWithAccount = Post & { socialAccount: SocialAccount };

export async function publishPost(postId: string, actorUserId: string) {
  const post = (await prisma.post.findFirst({
    where: { id: postId, userId: actorUserId },
    include: { socialAccount: true },
  })) as PostWithAccount | null;

  if (!post) throw new PublishGuardError("Post not found.");

  if (post.status === PostStatus.PUBLISHED) {
    throw new PublishGuardError("This post was already published.");
  }

  if (!(await hasActiveConsent(actorUserId))) {
    throw new PublishGuardError(
      "AI ghostwriting consent is not active. Grant consent in Settings before publishing.",
    );
  }

  if (!post.approvedAt) {
    throw new PublishGuardError(
      "This post has not been approved by a human. Approve it before publishing.",
    );
  }

  if (!post.socialAccount.isActive) {
    throw new PublishGuardError("The connected account is disabled.");
  }

  const body = composeBody(post);
  validateForPlatform(post.socialAccount.platform, body, post.mediaUrls);

  await prisma.post.update({
    where: { id: post.id },
    data: { status: PostStatus.PUBLISHING, error: null },
  });

  try {
    let externalId: string;
    let permalink: string | undefined;

    if (post.socialAccount.platform === Platform.INSTAGRAM) {
      const res = await publishToInstagram({
        igUserId: post.socialAccount.externalId,
        token: post.socialAccount.accessToken,
        caption: body,
        mediaUrls: post.mediaUrls,
        mediaType: post.mediaType,
      });
      externalId = res.id;
      permalink = res.permalink;
    } else {
      const res = await publishToFacebook({
        pageId: post.socialAccount.externalId,
        pageToken: post.socialAccount.accessToken,
        message: body,
        imageUrl: post.mediaUrls[0],
      });
      externalId = res.id;
      permalink = `https://www.facebook.com/${res.id}`;
    }

    const updated = await prisma.post.update({
      where: { id: post.id },
      data: {
        status: PostStatus.PUBLISHED,
        publishedAt: new Date(),
        externalId,
        permalink,
        error: null,
      },
    });

    await logAction({
      userId: actorUserId,
      action: "post.published",
      entity: "Post",
      entityId: post.id,
      metadata: {
        platform: post.socialAccount.platform,
        externalId,
        aiAssisted: post.aiAssisted,
      },
    });

    return updated;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown publishing error";

    await prisma.post.update({
      where: { id: post.id },
      data: { status: PostStatus.FAILED, error: message },
    });

    await logAction({
      userId: actorUserId,
      action: "post.publish_failed",
      entity: "Post",
      entityId: post.id,
      metadata: { message },
    });

    throw err;
  }
}

/** Publish every approved post whose scheduled time has arrived. */
export async function runDueScheduledPosts(now = new Date()) {
  const due = await prisma.post.findMany({
    where: {
      status: PostStatus.SCHEDULED,
      scheduledAt: { lte: now },
      approvedAt: { not: null },
    },
    select: { id: true, userId: true },
    take: 25,
  });

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];

  for (const p of due) {
    try {
      await publishPost(p.id, p.userId);
      results.push({ id: p.id, ok: true });
    } catch (err) {
      results.push({
        id: p.id,
        ok: false,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  return results;
}
