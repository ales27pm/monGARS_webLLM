import type {
  ChatMessage,
  CompletionOptions,
  CompletionResult,
  InitOptions,
  MonGarsEngine,
} from "./WebLLMService.types";
import { MODEL_REGISTRY } from "../../models";

type TransformersInstance = {
  model: any;
  tokenizer: any;
  TextStreamer: any;
};

type GenerationInput = Record<string, any>;

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
    await this.setModel(options?.modelId, options);
  }

  private async setModel(
    modelId?: string,
    options?: InitOptions,
  ): Promise<void> {
    const requested = normalizeModelId(modelId ?? this.currentModelId);
    if (requested === this.currentModelId && this.instancePromise) {
      return;
    }

    await this.reset();
    this.currentModelId = requested;
    const nextPromise = this.createInstance(options).catch((err: unknown) => {
      if (this.instancePromise === nextPromise) {
        this.instancePromise = null;
      }
      throw err;
    });
    this.instancePromise = nextPromise;
  }

  private async createInstance(
    options?: InitOptions,
  ): Promise<TransformersInstance> {
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

    const tokenizer = await AutoTokenizer.from_pretrained(this.currentModelId, {
      progress_callback: progressCallback,
    });

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
  }

  private async getInstance(
    options?: InitOptions,
  ): Promise<TransformersInstance> {
    if (!this.instancePromise) {
      await this.setModel(this.currentModelId, options);
    }
    return this.instancePromise as Promise<TransformersInstance>;
  }

  private createTextStream(
    model: any,
    tokenizer: any,
    TextStreamer: any,
    input: GenerationInput,
    options: CompletionOptions,
  ): AsyncIterable<string> {
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
        abort_signal: options.signal,
      })
      .then(() => {
        done = true;
      })
      .catch((err: unknown) => {
        streamError = err;
        done = true;
      });

    return (async function* () {
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
  }

  async completeChat(
    messages: ChatMessage[],
    options: CompletionOptions,
  ): Promise<CompletionResult> {
    if (options.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    const { model, tokenizer, TextStreamer } = await this.getInstance();

    const input = tokenizer.apply_chat_template(buildMessages(messages), {
      add_generation_prompt: true,
      return_dict: true,
    }) as GenerationInput;

    if (options.stream) {
      return {
        stream: this.createTextStream(
          model,
          tokenizer,
          TextStreamer,
          input,
          options,
        ),
      };
    }

    const output = await model.generate({
      ...input,
      max_new_tokens: options.maxTokens,
      temperature: options.temperature,
      do_sample: options.temperature > 0,
      return_dict_in_generate: true,
      abort_signal: options.signal,
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
    const pendingInstance = this.instancePromise;
    this.instancePromise = null;
    const instance = await pendingInstance;
    if (!instance) return;

    const maybeDispose = instance.model?.dispose;
    if (typeof maybeDispose === "function") {
      await maybeDispose.call(instance.model);
    }
  }

  getCurrentEngine = async () => this.instancePromise;
}

export const isLiquidTransformersModel = (modelId?: string): boolean => {
  if (!modelId) return false;
  const normalized = normalizeModelId(modelId);
  const metadata = MODEL_REGISTRY[normalized];
  if (metadata) {
    return metadata.backend === "transformers";
  }
  return (
    normalized.startsWith("onnx-community/LFM2-") ||
    normalized.startsWith("onnx-community/LFM2.5-")
  );
};
