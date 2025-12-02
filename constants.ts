import {
  DEFAULT_MODEL_ID,
  MODEL_LIBRARY_BASE_URL,
  MODEL_REGISTRY,
} from "./models";

// This function is kept from the original source to ensure model compatibility.
// It might need updates if WebLLM changes its URL structure.
export function getModelLibUrl(modelId: string): string {
  const metadata = MODEL_REGISTRY[modelId];
  if (!metadata) {
    const fallbackId = modelId.startsWith("Qwen")
      ? DEFAULT_MODEL_ID
      : "Llama-3.2-1B-Instruct-q4f16_1-MLC";
    const fallback = MODEL_REGISTRY[fallbackId];
    console.warn(
      `[getModelLibUrl] Unknown model "${modelId}". Falling back to ${fallbackId}.`,
    );
    return `${MODEL_LIBRARY_BASE_URL}${fallback.wasmFilename}`;
  }

  return `${MODEL_LIBRARY_BASE_URL}${metadata.wasmFilename}`;
}
