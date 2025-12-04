import type { InitProgressReport, Role } from "../../types";

export type ChatRole = Role | "system";

export interface ChatMessage {
  role: ChatRole;
  content: string | null;
}

export interface CompletionOptions {
  temperature: number;
  maxTokens: number;
  stream?: boolean;
  signal?: AbortSignal;
}

export interface CompletionResult {
  text?: string;
  stream?: AsyncIterable<string>;
}

export interface InitOptions {
  modelId?: string;
  onProgress?: (report: InitProgressReport) => void;
}

export interface MonGarsEngine {
  init: (options?: InitOptions) => Promise<void>;
  completeChat: (
    messages: ChatMessage[],
    options: CompletionOptions,
  ) => Promise<CompletionResult>;
  reset: () => Promise<void>;
  getRuntimeStatsText?: () => Promise<string>;
  getCurrentEngine?: () => Promise<unknown | null>;
}
