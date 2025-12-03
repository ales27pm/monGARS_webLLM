import { nativeBackend } from "./WebLLMService.native";
import { webBackend } from "./WebLLMService.web";
import type {
  ChatMessage,
  CompletionOptions,
  CompletionResult,
  InitOptions,
  MonGarsEngine,
} from "./WebLLMService.types";

const isWebRuntime =
  typeof document !== "undefined" || typeof window !== "undefined";

class WebLLMService implements MonGarsEngine {
  private get backend(): MonGarsEngine {
    return isWebRuntime ? webBackend : nativeBackend;
  }

  init(options?: InitOptions): Promise<void> {
    return this.backend.init(options);
  }

  completeChat(
    messages: ChatMessage[],
    options: CompletionOptions,
  ): Promise<CompletionResult> {
    return this.backend.completeChat(messages, options);
  }

  reset(): Promise<void> {
    return this.backend.reset();
  }

  getRuntimeStatsText(): Promise<string> {
    if (typeof this.backend.getRuntimeStatsText === "function") {
      return this.backend.getRuntimeStatsText();
    }
    return Promise.resolve("Statistiques indisponibles");
  }

  getCurrentEngine(): Promise<unknown | null> {
    if (typeof this.backend.getCurrentEngine === "function") {
      return this.backend.getCurrentEngine();
    }
    return Promise.resolve(null);
  }
}

export const webLLMService = new WebLLMService();
