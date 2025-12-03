import type {
  GenerationRequestContext,
  WebLLMBackend,
} from "./WebLLMService.types";

const generatorCache: Map<string, Promise<TextGenerationPipeline>> = new Map();

type TextGenerationPipeline = (
  input: string,
  options?: Record<string, unknown>,
) => Promise<{ generated_text: string }[]>;

class NativeBackend implements WebLLMBackend {
  private async loadGenerator(
    modelId: string,
  ): Promise<TextGenerationPipeline> {
    if (!generatorCache.has(modelId)) {
      generatorCache.set(
        modelId,
        (async () => {
          const { pipeline } = await import("@xenova/transformers");
          const generator = (await pipeline(
            "text-generation",
            modelId,
          )) as TextGenerationPipeline;
          return generator;
        })(),
      );
    }

    return generatorCache.get(modelId)!;
  }

  async generateResponse(context: GenerationRequestContext): Promise<string> {
    const modelId = context.options?.modelId || "Xenova/gpt2";
    const maxTokens = context.options?.maxTokens ?? 80;
    const temperature = context.options?.temperature ?? 0.8;
    const generator = await this.loadGenerator(modelId);
    const prompt = `${context.prompt}\n\nHistorique: ${context.messages
      .slice(-3)
      .map((m) => `${m.role}: ${m.content}`)
      .join(" | ")}`;

    const output = await generator(prompt, {
      max_new_tokens: maxTokens,
      temperature,
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
