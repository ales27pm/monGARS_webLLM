import type { Message } from "../context/ChatContext";

export interface GenerationOptions {
  modelId?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface GenerationRequestContext {
  messages: Message[];
  prompt: string;
  options?: GenerationOptions;
}

export interface WebLLMBackend {
  generateResponse: (context: GenerationRequestContext) => Promise<string>;
}
