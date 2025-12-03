import type {
  ChatMessage,
  CompletionOptions,
  CompletionResult,
  InitOptions,
  MonGarsEngine,
} from "./WebLLMService.types";
import { DEFAULT_MODEL_ID } from "../../models";
import type { MLCEngine } from "../../types";

type ChatCompletionMessageParam = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
};

type ChatCompletionPayload = {
  messages: ChatCompletionMessageParam[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  signal?: AbortSignal;
};

class WebBackend implements MonGarsEngine {
  private enginePromise: Promise<MLCEngine> | null = null;
  private currentEngine: MLCEngine | null = null;

  async init(options?: InitOptions): Promise<void> {
    await this.ensureEngine(options);
  }

  private async ensureEngine(options?: InitOptions): Promise<MLCEngine> {
    if (!this.enginePromise) {
      this.enginePromise = (async () => {
        const webllm = await import("@mlc-ai/web-llm");
        const { CreateMLCEngine } = webllm as any;
        const engine = (await CreateMLCEngine(
          options?.modelId ?? DEFAULT_MODEL_ID,
          {
            initProgressCallback: options?.onProgress,
          },
        )) as MLCEngine;
        this.currentEngine = engine;
        return engine;
      })();
    }

    const engine = await this.enginePromise;
    if (options?.onProgress) {
      options.onProgress({ progress: 1, text: "Modèle prêt" });
    }
    return engine;
  }

  private buildMessages(
    messages: ChatMessage[],
    systemPrompt?: string,
  ): ChatCompletionMessageParam[] {
    const normalizedHistory = messages
      .filter((msg) => msg.content !== null)
      .map((message) => ({
        role: message.role as ChatCompletionMessageParam["role"],
        content: (message.content ?? "").toString(),
      }));

    let finalHistory = normalizedHistory;
    if (systemPrompt) {
      if (finalHistory.length > 0 && finalHistory[0].role === "system") {
        // Replace existing system prompt if a new one is provided
        finalHistory[0].content = systemPrompt;
      } else {
        // Prepend system prompt if none exists
        finalHistory.unshift({ role: "system", content: systemPrompt });
      }
    }
    return finalHistory;
  }

  async completeChat(
    messages: ChatMessage[],
    options: CompletionOptions,
  ): Promise<CompletionResult> {
    const engine = await this.ensureEngine();

    const payload: ChatCompletionPayload = {
      messages: this.buildMessages(messages, options.systemPrompt),
      stream: options.stream ?? false,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      signal: options.signal,
    };

    if (payload.stream) {
      const chunks = await engine.chat.completions.create(payload);
      const stream = (async function* () {
        for await (const chunk of chunks) {
          const content = chunk?.choices?.[0]?.delta?.content ?? "";
          if (content) {
            yield content;
          }
        }
      })();
      return { stream };
    }

    const completion = await engine.chat.completions.create(payload);
    const result = completion?.choices?.[0]?.message?.content;
    if (typeof result === "string" && result.trim().length > 0) {
      return { text: result.trim() };
    }
    throw new Error("Réponse vide reçue du modèle WebLLM.");
  }

  async reset(): Promise<void> {
    const engine = await this.enginePromise;
    if (engine && typeof engine.dispose === "function") {
      try {
        await engine.dispose();
      } catch (err) {
        console.warn("Erreur lors de la libération de WebLLM:", err);
      }
    }
    this.enginePromise = null;
    this.currentEngine = null;
  }

  getRuntimeStatsText = async (): Promise<string> => {
    if (!this.currentEngine) {
      return "Moteur non initialisé";
    }
    const engine = this.currentEngine;
    if (typeof engine.runtimeStatsText === "function") {
      return engine.runtimeStatsText();
    }
    return "Statistiques indisponibles";
  };

  getCurrentEngine = async (): Promise<MLCEngine | null> => {
    if (!this.enginePromise) return null;
    return this.enginePromise;
  };
}

export const webBackend: MonGarsEngine = new WebBackend();
