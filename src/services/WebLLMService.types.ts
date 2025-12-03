import type { Message } from "../context/ChatContext";

export interface GenerationRequestContext {
  messages: Message[];
  prompt: string;
}

export interface WebLLMBackend {
  generateResponse: (context: GenerationRequestContext) => Promise<string>;
}
