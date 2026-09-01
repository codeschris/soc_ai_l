/**
 * The impersonation engine.
 *
 * Two capabilities:
 *   1. `synthesiseStyleGuide` — reads the creator's real writing samples and
 *      distils a reusable style guide (the "voice fingerprint").
 *   2. `generatePost` — writes a caption + hashtags AS the creator, grounded in
 *      that fingerprint and, where supported, in the actual media.
 *
 * Ethics: the model is instructed to never invent facts, claims, endorsements,
 * or lived experiences the creator did not supply. Output is always a draft
 * that a human must approve before it can be published.
 */
import type { EmojiUsage, MediaType, Platform } from "@prisma/client";
import { getProvider } from "./index";
import type { CompletionResult } from "./types";

export type VoiceContext = {
  name: string;
  bio?: string | null;
  niche?: string | null;
  audience?: string | null;
  toneKeywords: string[];
  forbidden: string[];
  emojiUsage: EmojiUsage;
  hashtagCount: number;
  language: string;
  styleGuide?: string | null;
  samples: string[];
};

const EMOJI_RULES: Record<EmojiUsage, string> = {
  NONE: "Use absolutely no emoji.",
  LIGHT: "Use at most one emoji, and only if it genuinely fits.",
  MODERATE: "Use two to four emoji, placed naturally.",
  HEAVY: "Use emoji liberally, the way an expressive creator would.",
};

const PLATFORM_RULES: Record<Platform, string> = {
  INSTAGRAM: [
    "Instagram caption. Hard limit 2,200 characters.",
    "Open with a scroll-stopping first line — it is the only line shown before the fold.",
    "Short paragraphs separated by blank lines. Close with a question or a clear call to action.",
    "Hashtags are returned separately, never inline in the caption body.",
  ].join(" "),
  FACEBOOK: [
    "Facebook page post. Aim for 40–160 words; conversational and shareable.",
    "Facebook rewards plain, human language over hashtag stuffing — keep hashtags few.",
    "No hard character limit, but front-load the value.",
  ].join(" "),
};

const ETHICS_CLAUSE = [
  "You are a ghostwriting assistant operating with the creator's explicit, revocable consent.",
  "Hard rules you must never break:",
  "- Never state a fact, statistic, price, date, partnership, endorsement or personal experience that is not present in the creator's brief or style context. If a detail is missing, write around it rather than inventing it.",
  "- Never impersonate anyone other than the account owner who granted consent.",
  "- Never write medical, legal, or financial advice as if it were professional counsel.",
  "- Never produce content that is deceptive, defamatory, or that would violate platform policy.",
  "- If the brief asks for something that breaks these rules, return your refusal in the caption field and explain why.",
].join("\n");

function voiceBlock(v: VoiceContext) {
  const lines: string[] = [`Creator voice profile: ${v.name}`];

  if (v.bio) lines.push(`About them: ${v.bio}`);
  if (v.niche) lines.push(`Niche: ${v.niche}`);
  if (v.audience) lines.push(`Audience: ${v.audience}`);
  if (v.toneKeywords.length) lines.push(`Tone: ${v.toneKeywords.join(", ")}`);
  if (v.forbidden.length) {
    lines.push(
      `Never say or do these (absolute): ${v.forbidden.join("; ")}`,
    );
  }

  lines.push(`Language: write in ${v.language}.`);
  lines.push(EMOJI_RULES[v.emojiUsage]);

  if (v.styleGuide) {
    lines.push(`\nStyle fingerprint derived from their real posts:\n${v.styleGuide}`);
  }

  if (v.samples.length) {
    lines.push(
      "\nAuthentic samples the creator actually wrote. Match this rhythm, vocabulary and punctuation — do not copy them:",
    );
    v.samples.slice(0, 8).forEach((s, i) => {
      lines.push(`--- sample ${i + 1} ---\n${s.slice(0, 800)}`);
    });
  }

  return lines.join("\n");
}

export type StyleGuideResult = {
  styleGuide: string;
  raw: CompletionResult;
};

export async function synthesiseStyleGuide(
  samples: string[],
  opts: { provider?: string | null; hints?: string | null } = {},
): Promise<StyleGuideResult> {
  if (samples.length === 0) {
    throw new Error("At least one writing sample is required to learn a voice.");
  }

  const provider = getProvider(opts.provider);

  const system = [
    "You are a forensic writing analyst. You reverse-engineer an author's voice from their own text.",
    "Produce a compact, concrete style guide another writer could follow to be mistaken for this author.",
    "Cover: sentence length and rhythm, punctuation habits, capitalisation quirks, favourite words and phrases,",
    "emoji habits, how they open a post, how they close it, how they address the reader, humour, and what they never do.",
    "Be specific and quote short fragments as evidence. No preamble, no headings deeper than one level. Max 400 words.",
  ].join(" ");

  const corpus = samples
    .map((s, i) => `--- post ${i + 1} ---\n${s.slice(0, 1500)}`)
    .join("\n\n");

  const raw = await provider.complete({
    system,
    temperature: 0.3,
    maxTokens: 900,
    messages: [
      {
        role: "user",
        content: `${opts.hints ? `Context from the creator: ${opts.hints}\n\n` : ""}Analyse these posts by one author:\n\n${corpus}`,
      },
    ],
  });

  return { styleGuide: raw.text.trim(), raw };
}

export type GenerateInput = {
  brief: string;
  platform: Platform;
  mediaType: MediaType;
  mediaUrls?: string[];
  voice: VoiceContext;
  provider?: string | null;
  /** Number of alternative captions to return. */
  variants?: number;
};

export type GeneratedPost = {
  caption: string;
  hashtags: string[];
  altText?: string;
  rationale?: string;
};

export type GenerateResult = {
  variants: GeneratedPost[];
  raw: CompletionResult;
  prompt: string;
};

function normaliseHashtags(input: unknown, max: number): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];

  for (const item of input) {
    if (typeof item !== "string") continue;
    const tag = item
      .trim()
      .replace(/^#+/, "")
      .replace(/\s+/g, "")
      .replace(/[^\p{L}\p{N}_]/gu, "");
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(`#${tag}`);
    if (out.length >= max) break;
  }

  return out;
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw new Error("The model did not return valid JSON.");
  }
}

export async function generatePost(
  input: GenerateInput,
): Promise<GenerateResult> {
  const provider = getProvider(input.provider);
  const variants = Math.min(Math.max(input.variants ?? 2, 1), 4);
  const maxTags = Math.min(
    input.platform === "FACEBOOK" ? 5 : input.voice.hashtagCount,
    30,
  );

  const system = [
    ETHICS_CLAUSE,
    "",
    "Your task: write social posts in the first person AS the creator described below.",
    "You are not an assistant talking about them — you are their voice.",
    "",
    PLATFORM_RULES[input.platform],
    "",
    voiceBlock(input.voice),
    "",
    "Hashtag strategy: mix three tiers — a few broad high-volume tags, several mid-size niche tags,",
    "and one or two specific community tags the creator's audience actually follows.",
    `Return at most ${maxTags} hashtags. No banned, spammy, or irrelevant tags.`,
    "",
    "Return JSON exactly in this shape:",
    `{"variants":[{"caption":"...","hashtags":["tag"],"altText":"...","rationale":"one sentence on the hook"}]}`,
    `Return exactly ${variants} variant(s). Hashtags must be plain words without the # symbol.`,
    "altText is a literal accessibility description of the media.",
  ].join("\n");

  const userParts = [`Brief from the creator:\n${input.brief.trim()}`];
  userParts.push(`\nMedia type: ${input.mediaType}.`);

  if (input.mediaUrls?.length && provider.supportsVision) {
    userParts.push(
      "Look at the attached media and ground the caption in what is actually shown. Do not describe anything you cannot see.",
    );
  } else if (input.mediaUrls?.length) {
    userParts.push(
      "Media is attached but you cannot view it. Write from the brief only and keep visual claims generic.",
    );
  }

  const prompt = userParts.join("\n");

  const raw = await provider.complete({
    system,
    json: true,
    temperature: 0.85,
    maxTokens: 1600,
    imageUrls: provider.supportsVision ? input.mediaUrls : undefined,
    messages: [{ role: "user", content: prompt }],
  });

  const parsed = extractJson(raw.text) as {
    variants?: Array<Record<string, unknown>>;
  };

  const list = Array.isArray(parsed.variants) ? parsed.variants : [];
  if (list.length === 0) {
    throw new Error("The model returned no usable variants.");
  }

  return {
    prompt,
    raw,
    variants: list.map((v) => ({
      caption: String(v.caption ?? "").trim(),
      hashtags: normaliseHashtags(v.hashtags, maxTags),
      altText: typeof v.altText === "string" ? v.altText : undefined,
      rationale: typeof v.rationale === "string" ? v.rationale : undefined,
    })),
  };
}

/** Rewrite an existing caption with a short instruction, keeping the voice. */
export async function refineCaption(args: {
  caption: string;
  instruction: string;
  voice: VoiceContext;
  platform: Platform;
  provider?: string | null;
}): Promise<{ caption: string; raw: CompletionResult }> {
  const provider = getProvider(args.provider);

  const raw = await provider.complete({
    system: [
      ETHICS_CLAUSE,
      "",
      "Revise the caption below. Keep the creator's voice intact and change only what the instruction asks for.",
      "Return the revised caption as plain text with no commentary and no hashtags.",
      "",
      PLATFORM_RULES[args.platform],
      "",
      voiceBlock(args.voice),
    ].join("\n"),
    temperature: 0.7,
    maxTokens: 1000,
    messages: [
      {
        role: "user",
        content: `Instruction: ${args.instruction}\n\nCurrent caption:\n${args.caption}`,
      },
    ],
  });

  return { caption: raw.text.trim(), raw };
}
