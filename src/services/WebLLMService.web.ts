import type {
  GenerationRequestContext,
  WebLLMBackend,
} from "./WebLLMService.types";
import { DEFAULT_MODEL_ID } from "../../models";

const ENGINE_CACHE: Map<string, Promise<any>> = new Map();

type ChatCompletionMessageParam = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatCompletionPayload = {
  messages: ChatCompletionMessageParam[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
};

class WebBackend implements WebLLMBackend {
  private async ensureEngine(modelId: string) {
    if (!ENGINE_CACHE.has(modelId)) {
      ENGINE_CACHE.set(
        modelId,
        (async () => {
          const webllm = await import("@mlc-ai/web-llm");
          const { CreateMLCEngine } = webllm as any;
          const engine = await CreateMLCEngine(modelId, {});
          return engine;
        })(),
      );
    }

    return ENGINE_CACHE.get(modelId)!;
  }

  private buildMessages(
    context: GenerationRequestContext,
  ): ChatCompletionMessageParam[] {
    const history = context.messages.slice(-10).map((message) => ({
      role: message.role,
      content: message.content,
    })) as ChatCompletionMessageParam[];

    return [
      {
        role: "system",
        content:
          "Tu es Mon Gars, un assistant qui tourne en local. Réponds de façon concise et utile.",
      },
      ...history,
      { role: "user", content: context.prompt },
    ];
  }

  async generateResponse(context: GenerationRequestContext): Promise<string> {
    const modelId = context.options?.modelId || DEFAULT_MODEL_ID;
    const maxTokens = context.options?.maxTokens ?? 256;
    const temperature = context.options?.temperature ?? 0.7;
    const engine = await this.ensureEngine(modelId);

    const payload: ChatCompletionPayload = {
      messages: this.buildMessages(context),
      stream: false,
      temperature,
      max_tokens: maxTokens,
    };

    const completion = await engine.chat.completions.create(payload);
    const result = completion?.choices?.[0]?.message?.content;
    if (typeof result === "string" && result.trim().length > 0) {
      return result.trim();
    }
    throw new Error("Réponse vide reçue du modèle WebLLM.");
  }
}

export const webBackend: WebLLMBackend = new WebBackend();
