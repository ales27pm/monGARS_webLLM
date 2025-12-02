
export type Role = 'user' | 'assistant' | 'tool';

export interface Message {
  id: string;
  role: Role;
  content: string | null;
  timestamp: number;
  tokens?: number;
}

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface InitProgressReport {
  progress: number;
  text: string;
}

export interface Config {
  modelId: string; // Added modelId to Config interface
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  theme: 'light' | 'dark';
  semanticMemoryEnabled: boolean;
  semanticMemoryMaxEntries: number;
  semanticMemoryNeighbors: number;
  toolSearchEnabled: boolean;
  searchApiBase: string;
}

export interface ToastInfo {
  id: number;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

// Simplified types for MLC WebLLM
export interface MLCEngine {
  chat: {
    completions: {
      create: (options: {
        messages: { role: string; content: string | null }[];
        temperature: number;
        max_tokens: number;
        stream: boolean;
        signal?: AbortSignal;
      }) => Promise<any>; // Return type is complex, using any for simplicity
    };
  };
  runtimeStatsText: () => Promise<string>;
}
