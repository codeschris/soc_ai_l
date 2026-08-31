/**
 * Meta Graph API client for Instagram Business + Facebook Pages.
 *
 * Publishing flow:
 *   Instagram — create a media container, poll until FINISHED, then publish.
 *   Facebook  — single call to /{page-id}/photos or /{page-id}/feed.
 */
const GRAPH_VERSION = process.env.META_GRAPH_VERSION ?? "v21.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

export class MetaApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: number,
    readonly subcode?: number,
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}

async function graph<T>(
  path: string,
  init: { method?: "GET" | "POST"; params?: Record<string, string | undefined> },
): Promise<T> {
  const url = new URL(`${GRAPH}${path}`);
  const body = new URLSearchParams();

  for (const [k, v] of Object.entries(init.params ?? {})) {
    if (v === undefined) continue;
    if (init.method === "POST") body.set(k, v);
    else url.searchParams.set(k, v);
  }

  const res = await fetch(url, {
    method: init.method ?? "GET",
    ...(init.method === "POST"
      ? {
          body,
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        }
      : {}),
    cache: "no-store",
  });

  const json = (await res.json().catch(() => ({}))) as {
    error?: { message: string; code?: number; error_subcode?: number };
  };

  if (!res.ok || json.error) {
    throw new MetaApiError(
      json.error?.message ?? `Meta API request failed (${res.status})`,
      res.status,
      json.error?.code,
      json.error?.error_subcode,
    );
  }

  return json as T;
}

export function metaOAuthUrl(state: string) {
  const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  url.searchParams.set("client_id", process.env.META_APP_ID ?? "");
  url.searchParams.set("redirect_uri", metaRedirectUri());
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set(
    "scope",
    [
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_posts",
      "instagram_basic",
      "instagram_content_publish",
      "business_management",
    ].join(","),
  );
  return url.toString();
}

export function metaRedirectUri() {
  const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/social/meta/callback`;
}

export async function exchangeCodeForToken(code: string) {
  const res = await graph<{ access_token: string; expires_in?: number }>(
    "/oauth/access_token",
    {
      params: {
        client_id: process.env.META_APP_ID,
        client_secret: process.env.META_APP_SECRET,
        redirect_uri: metaRedirectUri(),
        code,
      },
    },
  );
  return res;
}

/** Short-lived user token -> ~60 day long-lived token. */
export async function exchangeForLongLivedToken(shortToken: string) {
  return graph<{ access_token: string; expires_in?: number }>(
    "/oauth/access_token",
    {
      params: {
        grant_type: "fb_exchange_token",
        client_id: process.env.META_APP_ID,
        client_secret: process.env.META_APP_SECRET,
        fb_exchange_token: shortToken,
      },
    },
  );
}

export type MetaPage = {
  id: string;
  name: string;
  access_token: string;
  picture?: { data?: { url?: string } };
  instagram_business_account?: { id: string; username?: string; profile_picture_url?: string };
};

/** Every Page the user administers, plus any linked IG business account. */
export async function listManagedPages(userToken: string) {
  const res = await graph<{ data: MetaPage[] }>("/me/accounts", {
    params: {
      access_token: userToken,
      fields:
        "id,name,access_token,picture{url},instagram_business_account{id,username,profile_picture_url}",
      limit: "100",
    },
  });
  return res.data ?? [];
}

export async function publishToFacebook(args: {
  pageId: string;
  pageToken: string;
  message: string;
  imageUrl?: string;
  linkUrl?: string;
}) {
  if (args.imageUrl) {
    const res = await graph<{ id: string; post_id?: string }>(
      `/${args.pageId}/photos`,
      {
        method: "POST",
        params: {
          access_token: args.pageToken,
          url: args.imageUrl,
          caption: args.message,
        },
      },
    );
    return { id: res.post_id ?? res.id };
  }

  const res = await graph<{ id: string }>(`/${args.pageId}/feed`, {
    method: "POST",
    params: {
      access_token: args.pageToken,
      message: args.message,
      link: args.linkUrl,
    },
  });
  return { id: res.id };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForContainer(
  containerId: string,
  token: string,
  { attempts = 20, delayMs = 3000 } = {},
) {
  for (let i = 0; i < attempts; i++) {
    const res = await graph<{ status_code?: string; status?: string }>(
      `/${containerId}`,
      { params: { access_token: token, fields: "status_code,status" } },
    );

    if (res.status_code === "FINISHED") return;
    if (res.status_code === "ERROR" || res.status_code === "EXPIRED") {
      throw new MetaApiError(
        `Instagram rejected the media: ${res.status ?? res.status_code}`,
        400,
      );
    }
    await sleep(delayMs);
  }
  throw new MetaApiError("Timed out waiting for Instagram to process the media.", 504);
}

export async function publishToInstagram(args: {
  igUserId: string;
  token: string;
  caption: string;
  mediaUrls: string[];
  mediaType: "IMAGE" | "VIDEO" | "CAROUSEL";
}) {
  const { igUserId, token, caption, mediaUrls, mediaType } = args;

  if (mediaUrls.length === 0) {
    throw new MetaApiError("Instagram requires at least one image or video.", 400);
  }

  let creationId: string;

  if (mediaType === "CAROUSEL" && mediaUrls.length > 1) {
    const children: string[] = [];
    for (const url of mediaUrls.slice(0, 10)) {
      const child = await graph<{ id: string }>(`/${igUserId}/media`, {
        method: "POST",
        params: {
          access_token: token,
          image_url: url,
          is_carousel_item: "true",
        },
      });
      await waitForContainer(child.id, token, { attempts: 10 });
      children.push(child.id);
    }

    const parent = await graph<{ id: string }>(`/${igUserId}/media`, {
      method: "POST",
      params: {
        access_token: token,
        media_type: "CAROUSEL",
        children: children.join(","),
        caption,
      },
    });
    creationId = parent.id;
  } else if (mediaType === "VIDEO") {
    const container = await graph<{ id: string }>(`/${igUserId}/media`, {
      method: "POST",
      params: {
        access_token: token,
        media_type: "REELS",
        video_url: mediaUrls[0],
        caption,
      },
    });
    creationId = container.id;
  } else {
    const container = await graph<{ id: string }>(`/${igUserId}/media`, {
      method: "POST",
      params: {
        access_token: token,
        image_url: mediaUrls[0],
        caption,
      },
    });
    creationId = container.id;
  }

  await waitForContainer(creationId, token);

  const published = await graph<{ id: string }>(`/${igUserId}/media_publish`, {
    method: "POST",
    params: { access_token: token, creation_id: creationId },
  });

  const detail = await graph<{ permalink?: string }>(`/${published.id}`, {
    params: { access_token: token, fields: "permalink" },
  }).catch(() => ({ permalink: undefined }));

  return { id: published.id, permalink: detail.permalink };
}
