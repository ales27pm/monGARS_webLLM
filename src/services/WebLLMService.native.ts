import type {
  GenerationRequestContext,
  WebLLMBackend,
} from "./WebLLMService.types";

type TextGenerationPipeline = (
  input: string,
  options?: Record<string, unknown>,
) => Promise<{ generated_text: string }[]>;

class NativeBackend implements WebLLMBackend {
  private generatorPromise: Promise<TextGenerationPipeline> | null = null;

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

  async generateResponse(context: GenerationRequestContext): Promise<string> {
    const generator = await this.loadGenerator();
    const prompt = `${context.prompt}\n\nHistorique: ${context.messages
      .slice(-3)
      .map((m) => `${m.role}: ${m.content}`)
      .join(" | ")}`;

    const output = await generator(prompt, {
      max_new_tokens: 80,
      temperature: 0.8,
      top_p: 0.95,
    });

    const text = output?.[0]?.generated_text;
    if (typeof text === "string" && text.trim().length > 0) {
      return text.trim();
    }

    throw new Error("Le moteur natif n'a pas fourni de réponse exploitable.");
  }
}

export const nativeBackend: WebLLMBackend = new NativeBackend();
