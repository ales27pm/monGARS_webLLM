import { webLLMService } from "../services/WebLLMService";
import type { ChatMessage } from "../services/WebLLMService.types";
import type { Message } from "../context/ChatContext";

/**
 * Minimal reasoning trace structure.
 * This can be extended later to expose real context/reasoning information.
 */
export interface ReasoningTrace {
  /** Human-readable description of what the assistant is doing. */
  summary: string;
  /** Optional raw trace payload (JSON, text, etc.). */
  raw?: unknown;
}

export interface MemoryStats {
  totalEntries: number;
  lastHitScore: number | null;
}

export interface SpeechState {
  mode: "idle" | "listening" | "speaking";
  isRecording: boolean;
  isPlaying: boolean;
  lastError: string | null;
}

export interface MonGarsBrainSnapshot {
  messages: Message[];
  reasoningTrace: ReasoningTrace | null;
  memoryStats: MemoryStats;
  speechState: SpeechState;
  isBusy: boolean;
}

type Listener = (snapshot: MonGarsBrainSnapshot) => void;

let idCounter = 0;
const nextId = () => {
  idCounter += 1;
  return `${Date.now()}-${idCounter}`;
};

export function sanitizeUserInput(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

const DEFAULT_SYSTEM_PROMPT =
  "Tu es Mon Gars, un assistant qui tourne en local. Réponds de façon concise et utile.";

/**
 * MonGarsBrainService is a framework-agnostic orchestrator that owns
 * the conversation state and delegates text generation to WebLLM.
 *
 * For now it focuses on robust, deterministic chat completion. It is
 * designed so that semantic memory, rich reasoning traces and speech
 * orchestration can be plugged in without changing the public API.
 */
class MonGarsBrainService {
  private messages: Message[] = [];
  private isBusy = false;

  // Stubs for future richer features – kept fully defined and stable.
  private reasoningTrace: ReasoningTrace | null = null;
  private memoryStats: MemoryStats = {
    totalEntries: 0,
    lastHitScore: null,
  };
  private speechState: SpeechState = {
    mode: "idle",
    isRecording: false,
    isPlaying: false,
    lastError: null,
  };

  private listeners: Set<Listener> = new Set();

  /**
   * Subscribe to snapshot updates. Returns an unsubscribe function.
   */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    // Immediately send the current snapshot so the subscriber is in sync.
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Public read-only snapshot.
   */
  getSnapshot(): MonGarsBrainSnapshot {
    return {
      messages: this.messages,
      reasoningTrace: this.reasoningTrace,
      memoryStats: this.memoryStats,
      speechState: this.speechState,
      isBusy: this.isBusy,
    };
  }

  /**
   * Clear the current conversation while keeping the underlying engine warm.
   */
  resetConversation(): void {
    this.messages = [];
    this.reasoningTrace = null;
    this.memoryStats = {
      totalEntries: 0,
      lastHitScore: null,
    };
    this.broadcast();
  }

  /**
   * Main entry point: push a user message, ask WebLLM for a reply,
   * record an assistant message and notify subscribers of all steps.
   */
  async sendUserMessage(text: string): Promise<void> {
    const trimmed = sanitizeUserInput(text);
    if (!trimmed) {
      return;
    }

    if (this.isBusy) {
      const errorMessage: Message = {
        id: nextId(),
        role: "assistant",
        content: "Je suis déjà en train de répondre. Réessayez dans un instant.",
        error: true,
      };
      this.messages = [...this.messages, errorMessage];
      this.broadcast();
      return;
    }

    const userMessage: Message = {
      id: nextId(),
      role: "user",
      content: trimmed,
    };

    this.messages = [...this.messages, userMessage];
    this.isBusy = true;
    this.broadcast();

    try {
      const history: ChatMessage[] = this.messages.map((message) => ({
        role: message.role,
        content: message.content,
      }));

      const completion = await webLLMService.completeChat(history, {
        temperature: 0.7,
        maxTokens: 256,
        systemPrompt: DEFAULT_SYSTEM_PROMPT,
      });

      if (completion.stream) {
        const assistantMessage: Message = {
          id: nextId(),
          role: "assistant",
          content: "",
        };
        this.messages = [...this.messages, assistantMessage];
        this.broadcast();

        for await (const chunk of completion.stream) {
          const lastIndex = this.messages.length - 1;
          const updatedMessage = { ...this.messages[lastIndex], content: this.messages[lastIndex].content + chunk };
          this.messages = [...this.messages.slice(0, lastIndex), updatedMessage];
          this.broadcast();
        }
      } else {
        const sanitized = (completion.text ?? "").trim();
        const assistantMessage: Message = {
          id: nextId(),
          role: "assistant",
          content: sanitized,
        };
        this.messages = [...this.messages, assistantMessage];
      }

      // Minimal reasoning trace – can be replaced by a richer pipeline later.
      this.reasoningTrace = {
        summary:
          "Réponse générée par le modèle WebLLM à partir de l'historique courant.",
        raw: {
          input: trimmed,
          historyLength: this.messages.length,
        },
      };

      // In a future iteration, memoryStats will reflect real semantic memory.
      this.memoryStats = {
        ...this.memoryStats,
        totalEntries: this.memoryStats.totalEntries,
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Erreur inconnue lors de la génération.";
      const errorMessage: Message = {
        id: nextId(),
        role: "assistant",
        content: `Désolé, une erreur s'est produite : ${message}`,
        error: true,
      };
      this.messages = [...this.messages, errorMessage];
    } finally {
      this.isBusy = false;
      this.broadcast();
    }
  }

  /**
   * Internal helper to notify all subscribers of the latest snapshot.
   */
  private broadcast(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (error) {
        // Listener errors should never break the brain service.
        console.warn("MonGarsBrainService listener error", error);
      }
    }
  }
}

export const monGarsBrain = new MonGarsBrainService();
