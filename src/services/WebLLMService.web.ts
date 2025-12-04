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

  /**
   * Build a messages array compatible with MLC:
   * - At most one `system` message.
   * - If present, it is always the very first element.
   */
  private buildMessages(
    messages: ChatMessage[],
    systemPrompt?: string,
  ): ChatCompletionMessageParam[] {
    const normalized = messages
      .filter((msg) => msg.content !== null)
      .map((message) => ({
        role: message.role as ChatCompletionMessageParam["role"],
        content: (message.content ?? "").toString(),
      }));

    let systemMsg: ChatCompletionMessageParam | null = null;
    const nonSystem: ChatCompletionMessageParam[] = [];

    for (const msg of normalized) {
      if (msg.role === "system") {
        if (!systemMsg) {
          systemMsg = { role: "system", content: msg.content };
        } else {
          systemMsg.content += "\n\n" + msg.content;
        }
      } else {
        nonSystem.push(msg);
      }
    }

    if (systemPrompt) {
      if (systemMsg) {
        systemMsg.content = systemPrompt;
      } else {
        systemMsg = { role: "system", content: systemPrompt };
      }
    }

    if (!systemMsg) {
      return nonSystem;
    }

    return [systemMsg, ...nonSystem];
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
      const isAsyncIterable =
        chunks != null &&
        (typeof (chunks as any)[Symbol.asyncIterator] === "function");

      if (!isAsyncIterable) {
        throw new Error(
          "Le moteur n'a pas renvoyé un flux async pour le mode streaming.",
        );
      }

      const signal = options.signal;
      const stream = (async function* () {
        let aborted = signal?.aborted ?? false;

        const closeIterator = async () => {
          if (typeof (chunks as any)?.return === "function") {
            try {
              await (chunks as any).return();
            } catch {
              // ignore
            }
          }
        };

        const onAbort = () => {
          aborted = true;
        };

        if (signal) signal.addEventListener("abort", onAbort, { once: true });
        try {
          if (aborted) {
            await closeIterator();
            throw new DOMException("Aborted", "AbortError");
          }
          for await (const chunk of chunks as AsyncIterable<any>) {
            if (aborted) {
              await closeIterator();
              throw new DOMException("Aborted", "AbortError");
            }
            const content = chunk?.choices?.[0]?.delta?.content ?? "";
            if (content) {
              yield content;
            }
          }
        } finally {
          if (signal) signal.removeEventListener("abort", onAbort);
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
    const pendingPromise = this.enginePromise;
    this.enginePromise = null;
    this.currentEngine = null;
    const engine = await pendingPromise;
    if (engine && typeof engine.dispose === "function") {
      try {
        await engine.dispose();
      } catch (err) {
        console.warn("Erreur lors de la libération de WebLLM:", err);
      }
    }
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
