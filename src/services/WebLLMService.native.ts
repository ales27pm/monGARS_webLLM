import type {
  ChatMessage,
  CompletionOptions,
  CompletionResult,
  MonGarsEngine,
} from "./WebLLMService.types";

type TextGenerationPipeline = (
  input: string,
  options?: Record<string, unknown>,
) => Promise<{ generated_text: string }[]>;

class NativeBackend implements MonGarsEngine {
  private generatorPromise: Promise<TextGenerationPipeline> | null = null;

  async init(): Promise<void> {
    await this.loadGenerator();
  }

  private async loadGenerator(): Promise<TextGenerationPipeline> {
    if (!this.generatorPromise) {
      this.generatorPromise = (async () => {
        const { pipeline } = await import("@xenova/transformers");
        const generator = (await pipeline(
          "text-generation",
          "Xenova/gpt2",
        )) as TextGenerationPipeline;
        return generator;
      })();
    }

    return this.generatorPromise;
  }

  async completeChat(
    messages: ChatMessage[],
    options: CompletionOptions,
  ): Promise<CompletionResult> {
    const generator = await this.loadGenerator();
    const normalizedMessages = messages.filter((msg) => msg.content !== null);
    const systemContent = normalizedMessages.find((msg) => msg.role === "system")?.content ?? "";
    const nonSystem = normalizedMessages.filter((msg) => msg.role !== "system");

    const lastNonSystem = nonSystem[nonSystem.length - 1];
    const historyWithoutLast = nonSystem.slice(0, -1);

    const recentHistory = historyWithoutLast
      .slice(-3)
      .map((m) => `${m.role}: ${m.content}`)
      .join(" | ");

    const lastNonSystemContent = lastNonSystem?.content ?? "";

    const prompt = `${systemContent}\n\n${recentHistory}\n\n${lastNonSystemContent}`.trim();

    const prompt = `${systemContent ?? ""}\n\n${recentHistory}\n\n${lastNonSystemContent}`;

    const output = await generator(prompt, {
      max_new_tokens: options.maxTokens,
      temperature: options.temperature,
      top_p: 0.95,
    });

    const generatedText = output?.[0]?.generated_text;
    if (typeof generatedText === "string" && generatedText.startsWith(prompt)) {
      const text = generatedText.substring(prompt.length).trim();
      if (text.length > 0) {
        return { text };
      }
    }

    throw new Error("Le moteur natif n'a pas fourni de réponse exploitable.");
  }

  async reset(): Promise<void> {
    this.generatorPromise = null;
  }

  getCurrentEngine = async (): Promise<null> => null;
}

export const nativeBackend: MonGarsEngine = new NativeBackend();
