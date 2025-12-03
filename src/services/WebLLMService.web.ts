import type {
  GenerationRequestContext,
  WebLLMBackend,
} from "./WebLLMService.types";
import { DEFAULT_MODEL_ID } from "../../models";

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
  private enginePromise: Promise<any> | null = null;

  private async ensureEngine() {
    if (!this.enginePromise) {
      this.enginePromise = (async () => {
        const webllm = await import("@mlc-ai/web-llm");
        const { CreateMLCEngine } = webllm as any;
        const engine = await CreateMLCEngine(DEFAULT_MODEL_ID, {});
        return engine;
      })();
    }

    return this.enginePromise;
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
    const engine = await this.ensureEngine();

    const payload: ChatCompletionPayload = {
      messages: this.buildMessages(context),
      stream: false,
      temperature: 0.7,
      max_tokens: 256,
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
