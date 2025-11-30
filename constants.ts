import { ModelConfig } from './types';

// WebLLM Binary Library Configuration
// Using v0_2_80 as requested
const LIB_VERSION = "v0_2_80"; 
const LIB_BASE_URL = `https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/${LIB_VERSION}/`;

export const MODELS: ModelConfig[] = [
    {
        id: "wasmdashai-llama-3.2-1b-v1",
        name: "Llama 3.2 1B v1",
        size: "1.1 GB",
        description: "High-performance Llama 3.2 1B model provided by WasmDashAI.",
        params: "1B",
        quantization: "Q4_K_M",
        badge: "FEATURED",
        recommended: true,
        // Weights come from the user's HF repo, but we use the official MLC v0_2_80 WASM for engine compatibility
        modelUrl: "https://huggingface.co/wasmdashai/Llama-3.2-1B-v1/resolve/main/",
        modelLibUrl: `${LIB_BASE_URL}Llama-3.2-1B-Instruct-q4f16_1-ctx128k_cs1k-webgpu.wasm`
    },
    {
        id: "dolphin-3.0-llama-3.2-3b",
        name: "Dolphin 3.0 (Llama 3.2 3B)",
        size: "2.3 GB",
        description: "Uncensored instruction model architecture. Balanced performance and quality.",
        params: "3B",
        quantization: "Q4_K_M",
        badge: "NEW",
        recommended: false,
        modelUrl: "https://huggingface.co/mlc-ai/Llama-3.2-3B-Instruct-q4f16_1-MLC/resolve/main/",
        modelLibUrl: `${LIB_BASE_URL}Llama-3.2-3B-Instruct-q4f16_1-ctx128k_cs1k-webgpu.wasm`
    },
    {
        id: "dolphin-3.0-llama-3.2-1b",
        name: "Dolphin 3.0 (Llama 3.2 1B)",
        size: "1.1 GB",
        description: "Uncensored instruction model architecture. Extremely fast and lightweight.",
        params: "1B",
        quantization: "Q4_K_M",
        badge: "NEW",
        modelUrl: "https://huggingface.co/mlc-ai/Llama-3.2-1B-Instruct-q4f16_1-MLC/resolve/main/",
        modelLibUrl: `${LIB_BASE_URL}Llama-3.2-1B-Instruct-q4f16_1-ctx128k_cs1k-webgpu.wasm`
    },
    {
        id: "dolphin-3.0-qwen-2.5-3b",
        name: "Dolphin 3.0 (Qwen 2.5 3B)",
        size: "2.3 GB",
        description: "High performance Qwen 2.5 architecture. Great for reasoning.",
        params: "3B",
        quantization: "Q4_K_M",
        badge: "NEW",
        modelUrl: "https://huggingface.co/mlc-ai/Qwen2.5-3B-Instruct-q4f16_1-MLC/resolve/main/",
        modelLibUrl: `${LIB_BASE_URL}Qwen2.5-3B-Instruct-q4f16_1-ctx32k_cs1k-webgpu.wasm`
    },
    {
        id: "dolphin-3.0-qwen-2.5-1.5b",
        name: "Dolphin 3.0 (Qwen 2.5 1.5B)",
        size: "1.3 GB",
        description: "Efficient Qwen 2.5 architecture. Balanced speed and intelligence.",
        params: "1.5B",
        quantization: "Q4_K_M",
        badge: "NEW",
        modelUrl: "https://huggingface.co/mlc-ai/Qwen2.5-1.5B-Instruct-q4f16_1-MLC/resolve/main/",
        modelLibUrl: `${LIB_BASE_URL}Qwen2.5-1.5B-Instruct-q4f16_1-ctx32k_cs1k-webgpu.wasm`
    },
    {
        id: "dolphin-x1-8b",
        name: "Dolphin X1 (Llama 3.1 8B)",
        size: "5.2 GB",
        description: "Llama 3.1 8B architecture. Requires high VRAM (6GB+ recommended).",
        params: "8B",
        quantization: "Q4_K_M",
        badge: "NEW",
        modelUrl: "https://huggingface.co/mlc-ai/Llama-3.1-8B-Instruct-q4f16_1-MLC/resolve/main/",
        modelLibUrl: `${LIB_BASE_URL}Llama-3.1-8B-Instruct-q4f16_1-ctx128k_cs1k-webgpu.wasm`
    },
    {
        id: "phi-3-mini-4k-instruct-q4",
        name: "Phi-3 Mini 4K Instruct",
        size: "2.2 GB",
        description: "Microsoft's compact but powerful model. Great for general tasks and reasoning.",
        params: "3.8B",
        quantization: "Q4_K_M",
        modelUrl: "https://huggingface.co/mlc-ai/Phi-3-mini-4k-instruct-q4f16_1-MLC/resolve/main/",
        modelLibUrl: `${LIB_BASE_URL}Phi-3-mini-4k-instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm`
    },
    {
        id: "qwen2-1.5b-instruct-q4",
        name: "Qwen2 1.5B Instruct",
        size: "1.0 GB",
        description: "Alibaba's efficient model with excellent multilingual support.",
        params: "1.5B",
        quantization: "Q4_K_M",
        modelUrl: "https://huggingface.co/mlc-ai/Qwen2-1.5B-Instruct-q4f16_1-MLC/resolve/main/",
        modelLibUrl: `${LIB_BASE_URL}Qwen2-1.5B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm`
    },
    {
        id: "gemma-2b-it-q4",
        name: "Gemma 2B Instruct",
        size: "1.4 GB",
        description: "Google's lightweight model optimized for instruction following.",
        params: "2.0B",
        quantization: "Q4_K_M",
        modelUrl: "https://huggingface.co/mlc-ai/gemma-2b-it-q4f16_1-MLC/resolve/main/",
        modelLibUrl: `${LIB_BASE_URL}gemma-2b-it-q4f16_1-ctx4k_cs1k-webgpu.wasm`
    }
];

export const StorageKeys = {
    CHAT_HISTORY: 'mon_gars_chat_history',
    SELECTED_MODEL: 'mon_gars_selected_model',
    SETTINGS: 'mon_gars_settings',
    MESSAGES_COUNT: 'mon_gars_messages_count'
};