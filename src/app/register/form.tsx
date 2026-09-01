"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { Banner, Button, Field, Input } from "@/components/ui";

export function RegisterForm() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function set(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, consent }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not create the account.");
      setBusy(false);
      return;
    }

    await signIn("credentials", {
      email: form.email,
      password: form.password,
      redirect: false,
    });

    router.push("/voice");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error ? <Banner tone="error">{error}</Banner> : null}

      <Field label="Your name">
        <Input required value={form.name} onChange={set("name")} />
      </Field>

      <Field label="Email">
        <Input type="email" required value={form.email} onChange={set("email")} />
      </Field>

      <Field label="Password" hint="At least 8 characters.">
        <Input
          type="password"
          required
          minLength={8}
          value={form.password}
          onChange={set("password")}
        />
      </Field>

      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
        <label className="flex gap-3 text-sm text-neutral-700">
          <input
            type="checkbox"
            className="mt-1"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <span>
            I consent to Ghostline generating social posts written in my voice, on
            my own accounts. I understand that every post requires my explicit
            approval before publishing, that the AI must not invent facts about
            me, and that I can revoke this consent at any time.
          </span>
        </label>
      </div>

      <Button type="submit" disabled={busy || !consent} className="w-full">
        {busy ? "Creating…" : "Create account"}
      </Button>

      <p className="text-center text-sm text-neutral-500">
        Already registered?{" "}
        <Link href="/login" className="underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
