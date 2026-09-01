import OpenAI from "openai";
import type {
  AIProvider,
  CompletionRequest,
  CompletionResult,
} from "./types";

export class OpenAIProvider implements AIProvider {
  readonly name = "openai";
  readonly supportsVision = true;
  readonly model: string;
  private client: OpenAI;

  constructor(apiKey: string, model = process.env.OPENAI_MODEL ?? "gpt-4o") {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const started = Date.now();

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: req.system },
    ];

    req.messages.forEach((m, i) => {
      const isLastUser = i === req.messages.length - 1 && m.role === "user";
      if (isLastUser && req.imageUrls?.length) {
        messages.push({
          role: "user",
          content: [
            { type: "text", text: m.content },
            ...req.imageUrls.map((url) => ({
              type: "image_url" as const,
              image_url: { url },
            })),
          ],
        });
      } else {
        messages.push({ role: m.role, content: m.content });
      }
    });

    const res = await this.client.chat.completions.create({
      model: this.model,
      messages,
      temperature: req.temperature ?? 0.8,
      max_tokens: req.maxTokens ?? 1200,
      ...(req.json ? { response_format: { type: "json_object" as const } } : {}),
    });

    return {
      text: res.choices[0]?.message?.content ?? "",
      provider: this.name,
      model: this.model,
      tokensIn: res.usage?.prompt_tokens,
      tokensOut: res.usage?.completion_tokens,
      latencyMs: Date.now() - started,
    };
  }
}
