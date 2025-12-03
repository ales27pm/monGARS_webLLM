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
    const recentHistory = messages
      .filter((msg) => msg.content)
      .slice(-3)
      .map((m) => `${m.role}: ${m.content}`)
      .join(" | ");

    const prompt = `${options.systemPrompt ?? ""}\n\n${recentHistory}\n\n${
      messages[messages.length - 1]?.content ?? ""
    }`;

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
