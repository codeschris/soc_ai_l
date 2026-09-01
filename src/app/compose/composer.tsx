"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Banner,
  Button,
  Card,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";

type Account = { id: string; label: string; platform: "INSTAGRAM" | "FACEBOOK" };
type Profile = { id: string; name: string; trained: boolean };

type Variant = {
  caption: string;
  hashtags: string[];
  altText?: string;
  rationale?: string;
};

const IG_LIMIT = 2200;

export function Composer({
  accounts,
  profiles,
  providers,
  consentGranted,
}: {
  accounts: Account[];
  profiles: Profile[];
  providers: string[];
  consentGranted: boolean;
}) {
  const router = useRouter();

  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? "");
  const [provider, setProvider] = useState(providers[0] ?? "");
  const [brief, setBrief] = useState("");
  const [mediaInput, setMediaInput] = useState("");
  const [mediaType, setMediaType] = useState<"IMAGE" | "VIDEO" | "CAROUSEL">("IMAGE");

  const [variants, setVariants] = useState<Variant[]>([]);
  const [selected, setSelected] = useState(0);
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [discloseAi, setDiscloseAi] = useState(true);
  const [scheduledAt, setScheduledAt] = useState("");
  const [refineNote, setRefineNote] = useState("");

  const [busy, setBusy] = useState<null | "generate" | "refine" | "save">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const account = accounts.find((a) => a.id === accountId);

  const mediaUrls = useMemo(
    () =>
      mediaInput
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    [mediaInput],
  );

  const tagList = useMemo(
    () =>
      hashtags
        .split(/[\s,]+/)
        .map((t) => t.replace(/^#+/, "").trim())
        .filter(Boolean),
    [hashtags],
  );

  const previewLength =
    caption.length + (tagList.length ? tagList.join(" #").length + 2 : 0);

  const overLimit = account?.platform === "INSTAGRAM" && previewLength > IG_LIMIT;

  function applyVariant(v: Variant, index: number) {
    setSelected(index);
    setCaption(v.caption);
    setHashtags(v.hashtags.join(" "));
  }

  async function call(url: string, body: unknown) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Request failed.");
    return data;
  }

  async function onGenerate() {
    setBusy("generate");
    setError(null);
    setNotice(null);
    try {
      const data = await call("/api/generate", {
        brief,
        socialAccountId: accountId,
        voiceProfileId: profileId || undefined,
        mediaUrls,
        mediaType,
        provider: provider || undefined,
        variants: 2,
      });
      setVariants(data.variants);
      if (data.variants?.[0]) applyVariant(data.variants[0], 0);
      setNotice(`Drafted by ${data.provider} (${data.model}). Review before posting.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      setBusy(null);
    }
  }

  async function onRefine() {
    if (!refineNote.trim()) return;
    setBusy("refine");
    setError(null);
    try {
      const data = await call("/api/refine", {
        caption,
        instruction: refineNote,
        socialAccountId: accountId,
        voiceProfileId: profileId || undefined,
        provider: provider || undefined,
      });
      setCaption(data.caption);
      setRefineNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refinement failed.");
    } finally {
      setBusy(null);
    }
  }

  async function onSave(approveNow: boolean) {
    setBusy("save");
    setError(null);
    setNotice(null);
    try {
      const { post } = await call("/api/posts", {
        socialAccountId: accountId,
        voiceProfileId: profileId || undefined,
        brief,
        caption,
        hashtags: tagList,
        mediaUrls,
        mediaType,
        aiAssisted: variants.length > 0,
        discloseAi,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
      });

      if (approveNow) {
        await call(`/api/posts/${post.id}/approve`, { approve: true });
      }

      router.push("/queue");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the post.");
      setBusy(null);
    }
  }

  if (accounts.length === 0) {
    return (
      <Banner tone="info">
        Connect an Instagram or Facebook account first.{" "}
        <Link href="/accounts" className="underline">
          Go to Accounts
        </Link>
        .
      </Banner>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        {!consentGranted ? (
          <Banner tone="warning">
            Consent is revoked, so generation is disabled. Re-enable it in{" "}
            <Link href="/settings" className="underline">
              Settings
            </Link>
            .
          </Banner>
        ) : null}

        {providers.length === 0 ? (
          <Banner tone="error">
            No AI provider is configured. Add an OpenAI, Anthropic or Gemini API
            key to the server environment.
          </Banner>
        ) : null}

        <Card title="Your brief" description="Rough notes are fine — that is the point.">
          <div className="space-y-4">
            <Field label="Post to">
              <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Voice profile">
                <Select value={profileId} onChange={(e) => setProfileId(e.target.value)}>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.trained ? " (trained)" : " (untrained)"}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="AI model">
                <Select value={provider} onChange={(e) => setProvider(e.target.value)}>
                  {providers.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field
              label="What is this post about?"
              hint="Only facts you put here can appear in the caption. The AI will not invent details."
            >
              <Textarea
                rows={5}
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="Behind the scenes of today's shoot in Karura Forest. Shot on the 35mm. Talk about the early start and the light."
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <Field label="Media URLs" hint="Public URLs, space separated.">
                  <Textarea
                    rows={2}
                    value={mediaInput}
                    onChange={(e) => setMediaInput(e.target.value)}
                    placeholder="https://cdn.example.com/shot-01.jpg"
                  />
                </Field>
              </div>
              <Field label="Type">
                <Select
                  value={mediaType}
                  onChange={(e) =>
                    setMediaType(e.target.value as "IMAGE" | "VIDEO" | "CAROUSEL")
                  }
                >
                  <option value="IMAGE">Image</option>
                  <option value="CAROUSEL">Carousel</option>
                  <option value="VIDEO">Video / Reel</option>
                </Select>
              </Field>
            </div>

            <Button
              onClick={onGenerate}
              disabled={
                busy !== null ||
                !consentGranted ||
                providers.length === 0 ||
                brief.trim().length < 3
              }
            >
              {busy === "generate" ? "Writing in your voice…" : "Generate drafts"}
            </Button>
          </div>
        </Card>

        {variants.length > 1 ? (
          <Card title="Alternatives">
            <div className="space-y-3">
              {variants.map((v, i) => (
                <button
                  key={i}
                  onClick={() => applyVariant(v, i)}
                  className={`w-full rounded-lg border p-3 text-left text-sm transition ${
                    selected === i
                      ? "border-neutral-900 bg-neutral-50"
                      : "border-neutral-200 hover:border-neutral-400"
                  }`}
                >
                  <p className="line-clamp-3 text-neutral-800">{v.caption}</p>
                  {v.rationale ? (
                    <p className="mt-2 text-xs text-neutral-500">{v.rationale}</p>
                  ) : null}
                </button>
              ))}
            </div>
          </Card>
        ) : null}
      </div>

      <div className="space-y-6">
        {error ? <Banner tone="error">{error}</Banner> : null}
        {notice ? <Banner tone="success">{notice}</Banner> : null}

        <Card
          title="Your post"
          description="Edit anything. Nothing publishes until you approve it."
        >
          <div className="space-y-4">
            <Field
              label="Caption"
              hint={
                account?.platform === "INSTAGRAM"
                  ? `${previewLength} / ${IG_LIMIT} characters including hashtags`
                  : `${previewLength} characters`
              }
            >
              <Textarea
                rows={10}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Your caption will appear here."
              />
            </Field>

            {overLimit ? (
              <Banner tone="error">
                This exceeds Instagram&apos;s 2,200 character limit.
              </Banner>
            ) : null}

            <Field label="Hashtags" hint={`${tagList.length} tags`}>
              <Textarea
                rows={3}
                value={hashtags}
                onChange={(e) => setHashtags(e.target.value)}
                placeholder="nairobi filmphotography behindthescenes"
              />
            </Field>

            {caption ? (
              <Field label="Ask for a tweak" hint="Keeps your voice, changes only what you ask.">
                <div className="flex gap-2">
                  <Input
                    value={refineNote}
                    onChange={(e) => setRefineNote(e.target.value)}
                    placeholder="Make the hook punchier"
                  />
                  <Button
                    variant="secondary"
                    onClick={onRefine}
                    disabled={busy !== null || !refineNote.trim()}
                  >
                    {busy === "refine" ? "…" : "Refine"}
                  </Button>
                </div>
              </Field>
            ) : null}

            <Field label="Schedule (optional)" hint="Leave empty to publish manually.">
              <Input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </Field>

            <label className="flex items-start gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700">
              <input
                type="checkbox"
                className="mt-1"
                checked={discloseAi}
                onChange={(e) => setDiscloseAi(e.target.checked)}
              />
              <span>
                Append an AI-assistance disclosure to the post. Recommended, and
                required in some jurisdictions and brand agreements.
              </span>
            </label>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => onSave(true)}
                disabled={busy !== null || !caption.trim() || overLimit}
              >
                {busy === "save" ? "Saving…" : "Approve & send to queue"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => onSave(false)}
                disabled={busy !== null || !caption.trim()}
              >
                Save for later
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
