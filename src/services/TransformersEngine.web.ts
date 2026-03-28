import type {
  ChatMessage,
  CompletionOptions,
  CompletionResult,
  InitOptions,
  MonGarsEngine,
} from "./WebLLMService.types";

type TransformersInstance = {
  model: any;
  tokenizer: any;
  TextStreamer: any;
};

const DEFAULT_LIQUID_MODEL_ID = "onnx-community/LFM2-1.2B-ONNX";

function normalizeModelId(modelId?: string): string {
  if (!modelId) return DEFAULT_LIQUID_MODEL_ID;

  if (/^\d+(\.\d+)?[BM]$/i.test(modelId)) {
    return `onnx-community/LFM2-${modelId.toUpperCase()}-ONNX`;
  }

  if (modelId.startsWith("LFM2-")) {
    return `onnx-community/${modelId}-ONNX`;
  }

  return modelId;
}

function buildMessages(messages: ChatMessage[]) {
  return messages
    .filter((msg) => msg.content !== null)
    .map((message) => ({
      role: message.role,
      content: (message.content ?? "").toString(),
    }));
}

export class TransformersEngine implements MonGarsEngine {
  private instancePromise: Promise<TransformersInstance> | null = null;
  private currentModelId = DEFAULT_LIQUID_MODEL_ID;

  async init(options?: InitOptions): Promise<void> {
    this.currentModelId = normalizeModelId(options?.modelId);
    await this.ensureInstance(options);
  }

  private async ensureInstance(
    options?: InitOptions,
  ): Promise<TransformersInstance> {
    const requested = normalizeModelId(options?.modelId ?? this.currentModelId);
    if (requested !== this.currentModelId) {
      await this.reset();
      this.currentModelId = requested;
    }

    if (!this.instancePromise) {
      this.instancePromise = (async () => {
        const transformers = await import("@xenova/transformers");
        const { AutoModelForCausalLM, AutoTokenizer, TextStreamer } =
          transformers as any;

        const progressCallback = (progress: any) => {
          if (!options?.onProgress) return;
          if (progress?.status === "progress") {
            const ratio =
              typeof progress.loaded === "number" &&
              typeof progress.total === "number" &&
              progress.total > 0
                ? progress.loaded / progress.total
                : 0;
            options.onProgress({
              progress: Math.min(1, Math.max(0, ratio)),
              text: `Téléchargement ${progress.file ?? "du modèle"}`,
            });
          }
        };

        const tokenizer = await AutoTokenizer.from_pretrained(
          this.currentModelId,
          {
            progress_callback: progressCallback,
          },
        );

        const model = await AutoModelForCausalLM.from_pretrained(
          this.currentModelId,
          {
            dtype: "q4f16",
            device: "webgpu",
            progress_callback: progressCallback,
          },
        );

        options?.onProgress?.({ progress: 1, text: "Modèle Liquid prêt" });
        return { model, tokenizer, TextStreamer };
      })();
    }

    return this.instancePromise;
  }

  async completeChat(
    messages: ChatMessage[],
    options: CompletionOptions,
  ): Promise<CompletionResult> {
    if (options.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    const { model, tokenizer, TextStreamer } = await this.ensureInstance();

    const input = tokenizer.apply_chat_template(buildMessages(messages), {
      add_generation_prompt: true,
      return_dict: true,
    });

    if (options.stream) {
      const queue: string[] = [];
      let done = false;
      let streamError: unknown = null;

      const streamer = new TextStreamer(tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: (tokenText: string) => {
          if (typeof tokenText === "string" && tokenText.length > 0) {
            queue.push(tokenText);
          }
        },
      });

      const generatePromise = model
        .generate({
          ...input,
          max_new_tokens: options.maxTokens,
          temperature: options.temperature,
          do_sample: options.temperature > 0,
          streamer,
        })
        .then(() => {
          done = true;
        })
        .catch((err: unknown) => {
          streamError = err;
          done = true;
        });

      const stream = (async function* () {
        while (!done || queue.length > 0) {
          if (options.signal?.aborted) {
            throw new DOMException("Aborted", "AbortError");
          }
          if (queue.length > 0) {
            yield queue.shift() as string;
            continue;
          }
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        await generatePromise;
        if (streamError) throw streamError;
      })();

      return { stream };
    }

    const output = await model.generate({
      ...input,
      max_new_tokens: options.maxTokens,
      temperature: options.temperature,
      do_sample: options.temperature > 0,
      return_dict_in_generate: true,
    });

    const inputLength = input?.input_ids?.dims?.[1] ?? 0;
    const generatedTokens =
      output?.sequences?.slice(null, [inputLength, null]) ?? output;
    const decoded = tokenizer.batch_decode(generatedTokens, {
      skip_special_tokens: true,
    })?.[0];

    if (!decoded || !decoded.trim()) {
      throw new Error("Réponse vide reçue du modèle Liquid.");
    }

    return { text: decoded.trim() };
  }

  async reset(): Promise<void> {
    const instance = await this.instancePromise;
    this.instancePromise = null;
    if (!instance) return;

    const maybeDispose = instance.model?.dispose;
    if (typeof maybeDispose === "function") {
      await maybeDispose.call(instance.model);
    }
  }

  getCurrentEngine = async (): Promise<unknown | null> => this.instancePromise;
}

export const isLiquidTransformersModel = (modelId?: string): boolean => {
  if (!modelId) return false;
  return (
    modelId.startsWith("onnx-community/LFM2-") ||
    modelId.startsWith("onnx-community/LFM2.5-") ||
    modelId.startsWith("LFM2-") ||
    modelId === "350M" ||
    modelId === "700M" ||
    modelId === "1.2B"
  );
};
