import Anthropic from "@anthropic-ai/sdk";
import type {
  AIProvider,
  CompletionRequest,
  CompletionResult,
} from "./types";

async function fetchAsBase64(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch image: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const mediaType = res.headers.get("content-type") ?? "image/jpeg";
  return { data: buf.toString("base64"), mediaType };
}

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  readonly supportsVision = true;
  readonly model: string;
  private client: Anthropic;

  constructor(
    apiKey: string,
    model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5",
  ) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const started = Date.now();

    const messages: Anthropic.MessageParam[] = [];
    for (let i = 0; i < req.messages.length; i++) {
      const m = req.messages[i];
      const isLastUser = i === req.messages.length - 1 && m.role === "user";

      if (isLastUser && req.imageUrls?.length) {
        const images = await Promise.all(req.imageUrls.map(fetchAsBase64));
        messages.push({
          role: "user",
          content: [
            ...images.map((img) => ({
              type: "image" as const,
              source: {
                type: "base64" as const,
                media_type: img.mediaType as "image/jpeg",
                data: img.data,
              },
            })),
            { type: "text" as const, text: m.content },
          ],
        });
      } else {
        messages.push({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        });
      }
    }

    const system = req.json
      ? `${req.system}\n\nRespond with a single valid JSON object and nothing else.`
      : req.system;

    const res = await this.client.messages.create({
      model: this.model,
      system,
      messages,
      temperature: req.temperature ?? 0.8,
      max_tokens: req.maxTokens ?? 1200,
    });

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    return {
      text,
      provider: this.name,
      model: this.model,
      tokensIn: res.usage?.input_tokens,
      tokensOut: res.usage?.output_tokens,
      latencyMs: Date.now() - started,
    };
  }
}
