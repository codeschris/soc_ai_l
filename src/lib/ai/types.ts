export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type CompletionRequest = {
  system: string;
  messages: ChatMessage[];
  /** Image URLs the model should look at when writing the caption. */
  imageUrls?: string[];
  temperature?: number;
  maxTokens?: number;
  /** Ask the provider to return strict JSON. */
  json?: boolean;
};

export type CompletionResult = {
  text: string;
  provider: string;
  model: string;
  tokensIn?: number;
  tokensOut?: number;
  latencyMs: number;
};

export interface AIProvider {
  readonly name: string;
  readonly model: string;
  /** Whether this provider/model can read the supplied images. */
  readonly supportsVision: boolean;
  complete(req: CompletionRequest): Promise<CompletionResult>;
}

export type ProviderName = "openai" | "anthropic" | "gemini";
