export type ModelMetadata = {
  id: string;
  label: string;
  wasmFilename: string;
  description?: string;
  shortLabel?: string;
};

export const MODEL_LIBRARY_VERSION = "v0_2_79";

export const MODEL_LIBRARY_BASE_URL = `https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/${MODEL_LIBRARY_VERSION}/`;

// Smallest Llama-3 variant (≈1 B params, q4f32_1) – quick to download, fits mobile VRAM
export const DEFAULT_MODEL_ID = "Llama-3.2-1B-Instruct-q4f32_1-MLC";

export const MODEL_REGISTRY: Record<string, ModelMetadata> = {
  "Qwen2.5-0.5B-Instruct-q4f32_1-MLC": {
    id: "Qwen2.5-0.5B-Instruct-q4f32_1-MLC",
    label: "Qwen2.5 0.5B q4f32_1 (Qualité & réactivité)",
    shortLabel: "Qwen2.5 0.5B",
    wasmFilename: "Qwen2.5-0.5B-Instruct-q4f32_1-ctx4k_cs1k-webgpu.wasm",
    description:
      "Optimisé pour l'exécution locale avec une quantification q4f32_1 stable et réactive.",
  },

  // ✅ New q4f32_1 Llama 1B entry (default)
  "Llama-3.2-1B-Instruct-q4f32_1-MLC": {
    id: "Llama-3.2-1B-Instruct-q4f32_1-MLC",
    label: "Llama 3.2 1B q4f32_1 (fastest)",
    shortLabel: "Llama-3 1B",
    wasmFilename: "Llama-3.2-1B-Instruct-q4f32_1-ctx4k_cs1k-webgpu.wasm",
    description:
      "Small Llama-3 decoder-only model with 1 B parameters, quantisé q4f32_1 pour les GPU mobiles.",
  },

  // Old q4f16_1 variant kept as an alternative
  "Llama-3.2-1B-Instruct-q4f16_1-MLC": {
    id: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    label: "Llama 3.2 1B q4f16_1",
    wasmFilename: "Llama-3.2-1B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm",
  },

  "Llama-3.2-3B-Instruct-q4f16_1-MLC": {
    id: "Llama-3.2-3B-Instruct-q4f16_1-MLC",
    label: "Llama 3.2 3B q4f16_1",
    wasmFilename: "Llama-3.2-3B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm",
  },

  "TinyLlama-1.1B-Chat-v0.4-q4f16_1-MLC": {
    id: "TinyLlama-1.1B-Chat-v0.4-q4f16_1-MLC",
    label: "TinyLlama 1.1B Chat q4f16_1",
    wasmFilename: "TinyLlama-1.1B-Chat-v0.4-q4f16_1-ctx4k_cs1k-webgpu.wasm",
  },

  "Mistral-7B-Instruct-v0.3-q4f16_1-MLC": {
    id: "Mistral-7B-Instruct-v0.3-q4f16_1-MLC",
    label: "Mistral 7B Instruct q4f16_1",
    wasmFilename: "Mistral-7B-Instruct-v0.3-q4f16_1-ctx16k_cs1k-webgpu.wasm",
  },
};

export const getModelMetadata = (modelId: string): ModelMetadata | undefined =>
  MODEL_REGISTRY[modelId];

export const getModelLabel = (modelId: string): string =>
  MODEL_REGISTRY[modelId]?.label || modelId;

export const getModelShortLabel = (modelId: string): string =>
  MODEL_REGISTRY[modelId]?.shortLabel ||
  MODEL_REGISTRY[modelId]?.label ||
  modelId;
