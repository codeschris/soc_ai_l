"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Banner,
  Button,
  Card,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";

type Profile = {
  id: string;
  name: string;
  bio: string;
  niche: string;
  audience: string;
  toneKeywords: string[];
  forbidden: string[];
  emojiUsage: string;
  hashtagCount: number;
  language: string;
  isDefault: boolean;
  styleGuide: string | null;
  styleGuideAt: string | null;
  samples: string[];
};

const SAMPLE_SEPARATOR = "\n---\n";

export function VoiceEditor({
  profiles,
  providers,
}: {
  profiles: Profile[];
  providers: string[];
}) {
  const router = useRouter();
  const [activeId, setActiveId] = useState(profiles[0]?.id ?? "");
  const active = profiles.find((p) => p.id === activeId) ?? profiles[0];

  const [form, setForm] = useState(() => toForm(active));
  const [busy, setBusy] = useState<null | "save" | "train">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [styleGuide, setStyleGuide] = useState(active?.styleGuide ?? null);

  function toForm(p?: Profile) {
    return {
      name: p?.name ?? "My voice",
      bio: p?.bio ?? "",
      niche: p?.niche ?? "",
      audience: p?.audience ?? "",
      toneKeywords: (p?.toneKeywords ?? []).join(", "),
      forbidden: (p?.forbidden ?? []).join("\n"),
      emojiUsage: p?.emojiUsage ?? "MODERATE",
      hashtagCount: p?.hashtagCount ?? 8,
      language: p?.language ?? "en",
      samples: (p?.samples ?? []).join(SAMPLE_SEPARATOR),
    };
  }

  function switchProfile(id: string) {
    const p = profiles.find((x) => x.id === id);
    setActiveId(id);
    setForm(toForm(p));
    setStyleGuide(p?.styleGuide ?? null);
    setNotice(null);
    setError(null);
  }

  const sampleList = form.samples
    .split(SAMPLE_SEPARATOR)
    .map((s) => s.trim())
    .filter((s) => s.length >= 10);

  async function onSave() {
    setBusy("save");
    setError(null);
    setNotice(null);

    const payload = {
      name: form.name,
      bio: form.bio || null,
      niche: form.niche || null,
      audience: form.audience || null,
      toneKeywords: form.toneKeywords
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      forbidden: form.forbidden
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      emojiUsage: form.emojiUsage,
      hashtagCount: Number(form.hashtagCount),
      language: form.language,
      samples: sampleList,
    };

    try {
      const res = await fetch(
        active ? `/api/voice-profiles/${active.id}` : "/api/voice-profiles",
        {
          method: active ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(active ? payload : { ...payload, isDefault: true }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not save.");

      setStyleGuide(null);
      setNotice("Saved. Retrain the voice so the fingerprint matches your samples.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(null);
    }
  }

  async function onTrain() {
    if (!active) return;
    setBusy("train");
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/voice-profiles/${active.id}/learn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: providers[0] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Training failed.");

      setStyleGuide(data.styleGuide);
      setNotice(`Voice learned using ${data.provider}.`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Training failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        {error ? <Banner tone="error">{error}</Banner> : null}
        {notice ? <Banner tone="success">{notice}</Banner> : null}

        {profiles.length > 1 ? (
          <Field label="Profile">
            <Select value={activeId} onChange={(e) => switchProfile(e.target.value)}>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <Card title="Who you are" description="Context the AI uses to stay accurate.">
          <div className="space-y-4">
            <Field label="Profile name">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>

            <Field label="About you">
              <Textarea
                rows={3}
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
                placeholder="Nairobi-based film photographer. Ten years shooting street and portraits."
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Niche">
                <Input
                  value={form.niche}
                  onChange={(e) => setForm({ ...form, niche: e.target.value })}
                  placeholder="Film photography"
                />
              </Field>
              <Field label="Audience">
                <Input
                  value={form.audience}
                  onChange={(e) => setForm({ ...form, audience: e.target.value })}
                  placeholder="Emerging photographers, 20–35"
                />
              </Field>
            </div>

            <Field label="Tone" hint="Comma separated.">
              <Input
                value={form.toneKeywords}
                onChange={(e) => setForm({ ...form, toneKeywords: e.target.value })}
                placeholder="warm, dry humour, direct"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Emoji">
                <Select
                  value={form.emojiUsage}
                  onChange={(e) => setForm({ ...form, emojiUsage: e.target.value })}
                >
                  <option value="NONE">None</option>
                  <option value="LIGHT">Light</option>
                  <option value="MODERATE">Moderate</option>
                  <option value="HEAVY">Heavy</option>
                </Select>
              </Field>
              <Field label="Hashtags">
                <Input
                  type="number"
                  min={0}
                  max={30}
                  value={form.hashtagCount}
                  onChange={(e) =>
                    setForm({ ...form, hashtagCount: Number(e.target.value) })
                  }
                />
              </Field>
              <Field label="Language">
                <Input
                  value={form.language}
                  onChange={(e) => setForm({ ...form, language: e.target.value })}
                />
              </Field>
            </div>

            <Field
              label="Never say or do"
              hint="One rule per line. These are absolute."
            >
              <Textarea
                rows={3}
                value={form.forbidden}
                onChange={(e) => setForm({ ...form, forbidden: e.target.value })}
                placeholder={"Never claim awards I have not won\nNever use the word 'guys'"}
              />
            </Field>
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        <Card
          title="Your writing samples"
          description={`Separate each post with a line containing only ---. ${sampleList.length} sample(s) detected.`}
        >
          <Textarea
            rows={14}
            value={form.samples}
            onChange={(e) => setForm({ ...form, samples: e.target.value })}
            placeholder={"Paste a real caption you wrote…\n---\nAnd another one…"}
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={onSave} disabled={busy !== null}>
              {busy === "save" ? "Saving…" : "Save profile"}
            </Button>
            <Button
              variant="secondary"
              onClick={onTrain}
              disabled={busy !== null || !active || providers.length === 0}
            >
              {busy === "train" ? "Studying your writing…" : "Learn my voice"}
            </Button>
          </div>
        </Card>

        <Card
          title="Learned voice fingerprint"
          description="What the AI believes makes your writing yours. Review it — you can edit your samples and retrain."
        >
          {styleGuide ? (
            <p className="whitespace-pre-wrap text-sm text-neutral-700">
              {styleGuide}
            </p>
          ) : (
            <p className="text-sm text-neutral-500">
              Not trained yet. Add samples and click “Learn my voice”.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
