import { GoogleGenerativeAI } from "@google/generative-ai";
import type {
  AIProvider,
  CompletionRequest,
  CompletionResult,
} from "./types";

async function fetchInlineImage(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch image: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    inlineData: {
      data: buf.toString("base64"),
      mimeType: res.headers.get("content-type") ?? "image/jpeg",
    },
  };
}

export class GeminiProvider implements AIProvider {
  readonly name = "gemini";
  readonly supportsVision = true;
  readonly model: string;
  private client: GoogleGenerativeAI;

  constructor(
    apiKey: string,
    model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash",
  ) {
    this.client = new GoogleGenerativeAI(apiKey);
    this.model = model;
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const started = Date.now();

    const model = this.client.getGenerativeModel({
      model: this.model,
      systemInstruction: req.system,
      generationConfig: {
        temperature: req.temperature ?? 0.8,
        maxOutputTokens: req.maxTokens ?? 1200,
        ...(req.json ? { responseMimeType: "application/json" } : {}),
      },
    });

    const history = req.messages.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? ("model" as const) : ("user" as const),
      parts: [{ text: m.content }],
    }));

    const last = req.messages[req.messages.length - 1];
    const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [
      { text: last?.content ?? "" },
    ];

    if (req.imageUrls?.length) {
      const images = await Promise.all(req.imageUrls.map(fetchInlineImage));
      parts.push(...images);
    }

    const chat = model.startChat({ history });
    const res = await chat.sendMessage(parts);

    return {
      text: res.response.text(),
      provider: this.name,
      model: this.model,
      tokensIn: res.response.usageMetadata?.promptTokenCount,
      tokensOut: res.response.usageMetadata?.candidatesTokenCount,
      latencyMs: Date.now() - started,
    };
  }
}
