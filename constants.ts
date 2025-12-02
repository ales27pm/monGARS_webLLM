// This function is kept from the original source to ensure model compatibility.
// It might need updates if WebLLM changes its URL structure.
export function getModelLibUrl(modelId: string): string {
  const baseUrl =
    "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_79/";

  const modelLibs: { [key: string]: string } = {
    "Llama-3.2-1B-Instruct-q4f16_1-MLC":
      "Llama-3.2-1B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm",
    "Llama-3.2-3B-Instruct-q4f16_1-MLC":
      "Llama-3.2-3B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm",
    "TinyLlama-1.1B-Chat-v0.4-q4f16_1-MLC":
      "TinyLlama-1.1B-Chat-v0.4-q4f16_1-ctx4k_cs1k-webgpu.wasm",
    "Mistral-7B-Instruct-v0.3-q4f16_1-MLC":
      "Mistral-7B-Instruct-v0.3-q4f16_1-ctx16k_cs1k-webgpu.wasm",
    "Qwen2.5-0.5B-Instruct-q4f32_1-MLC":
      "Qwen2.5-0.5B-Instruct-q4f32_1-ctx4k_cs1k-webgpu.wasm",
  };

  return (
    baseUrl +
    (modelLibs[modelId] || modelLibs["Llama-3.2-1B-Instruct-q4f16_1-MLC"])
  );
}
