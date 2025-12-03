import {
  DEFAULT_MODEL_ID,
  MODEL_LIBRARY_BASE_URL,
  MODEL_REGISTRY,
} from "./models";

/**
 * Return the full WASM library URL for a given model ID.
 *
 * This function is intentionally thin: it delegates all model
 * metadata (including the wasmFilename) to MODEL_REGISTRY.
 *
 * If the model ID is unknown, it falls back to:
 * - DEFAULT_MODEL_ID if it looks like a Qwen model id
 * - "Llama-3.2-1B-Instruct-q4f16_1-MLC" otherwise
 */
export function getModelLibUrl(modelId: string): string {
  const metadata = MODEL_REGISTRY[modelId];

  if (!metadata) {
    const fallbackId = modelId.startsWith("Qwen")
      ? DEFAULT_MODEL_ID
      : "Llama-3.2-1B-Instruct-q4f16_1-MLC";

    const fallback = MODEL_REGISTRY[fallbackId];
    if (!fallback) {
      // Really pathological; we *should* always have the fallback
      console.warn(
        `[getModelLibUrl] Unknown model "${modelId}" and fallback "${fallbackId}" missing from registry. Falling back to DEFAULT_MODEL_ID only.`,
      );
      const defaultMeta = MODEL_REGISTRY[DEFAULT_MODEL_ID];
      if (!defaultMeta) {
        throw new Error(
          "[getModelLibUrl] DEFAULT_MODEL_ID is not present in MODEL_REGISTRY.",
        );
      }
      return `${MODEL_LIBRARY_BASE_URL}${defaultMeta.wasmFilename}`;
    }

    console.warn(
      `[getModelLibUrl] Unknown model "${modelId}". Falling back to ${fallbackId}.`,
    );
    return `${MODEL_LIBRARY_BASE_URL}${fallback.wasmFilename}`;
  }

  return `${MODEL_LIBRARY_BASE_URL}${metadata.wasmFilename}`;
}
