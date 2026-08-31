import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";
import { OpenAIProvider } from "./openai";
import type { AIProvider, ProviderName } from "./types";

export class MissingProviderError extends Error {
  constructor(name: string) {
    super(
      `AI provider "${name}" is not configured. Set the matching API key in your environment.`,
    );
    this.name = "MissingProviderError";
  }
}

function build(name: ProviderName): AIProvider | null {
  switch (name) {
    case "openai": {
      const key = process.env.OPENAI_API_KEY;
      return key ? new OpenAIProvider(key) : null;
    }
    case "anthropic": {
      const key = process.env.ANTHROPIC_API_KEY;
      return key ? new AnthropicProvider(key) : null;
    }
    case "gemini": {
      const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
      return key ? new GeminiProvider(key) : null;
    }
  }
}

export function availableProviders(): ProviderName[] {
  return (["openai", "anthropic", "gemini"] as ProviderName[]).filter(
    (n) => build(n) !== null,
  );
}

/**
 * Resolve a provider. Falls back to the first configured provider so the app
 * keeps working when a preferred key is missing.
 */
export function getProvider(preferred?: string | null): AIProvider {
  const order: ProviderName[] = [];

  const requested = preferred as ProviderName | undefined;
  if (requested && ["openai", "anthropic", "gemini"].includes(requested)) {
    order.push(requested);
  }

  const envDefault = process.env.AI_PROVIDER as ProviderName | undefined;
  if (envDefault && !order.includes(envDefault)) order.push(envDefault);

  for (const n of ["openai", "anthropic", "gemini"] as ProviderName[]) {
    if (!order.includes(n)) order.push(n);
  }

  for (const name of order) {
    const p = build(name);
    if (p) return p;
  }

  throw new MissingProviderError(preferred ?? envDefault ?? "any");
}

export * from "./types";
