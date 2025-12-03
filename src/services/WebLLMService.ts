import { nativeBackend } from "./WebLLMService.native";
import { webBackend } from "./WebLLMService.web";
import type {
  GenerationOptions,
  GenerationRequestContext,
} from "./WebLLMService.types";

const isWebRuntime =
  typeof document !== "undefined" || typeof window !== "undefined";

class WebLLMService {
  async generateResponse(
    prompt: string,
    history: GenerationRequestContext["messages"],
    options?: GenerationOptions,
  ): Promise<string> {
    const backend = isWebRuntime ? webBackend : nativeBackend;
    return backend.generateResponse({ messages: history, prompt, options });
  }
}

export const webLLMService = new WebLLMService();
