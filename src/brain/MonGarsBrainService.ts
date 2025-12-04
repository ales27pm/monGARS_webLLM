import { webLLMService } from "../services/WebLLMService";
import type { ChatMessage } from "../services/WebLLMService.types";
import { EmbeddingMemory } from "../../memory";
import { decideNextAction } from "../../decisionEngine";
import type { Config, MLCEngine, Message } from "../../types";
import type { SemanticMemoryClient } from "../../contextEngine";
import { DEFAULT_MODEL_ID } from "../../models";
import { SpeechService } from "./SpeechService";

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

export type { SpeechState } from "./SpeechService";

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

const DEFAULT_TRACE_CONFIG: Config = {
  modelId: DEFAULT_MODEL_ID,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  temperature: 0.7,
  maxTokens: 512,
  theme: "dark",
  semanticMemoryEnabled: true,
  semanticMemoryMaxEntries: 96,
  semanticMemoryNeighbors: 6,
  toolSearchEnabled: false,
  searchApiBase: "https://api.duckduckgo.com",
};

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

  private semanticMemory: EmbeddingMemory | null = null;
  private semanticMemoryWarmup: Promise<void> | null = null;

  // Stubs for future richer features – kept fully defined and stable.
  private reasoningTrace: ReasoningTrace | null = null;
  private memoryStats: MemoryStats = {
    totalEntries: 0,
    lastHitScore: null,
  };
  private speechService: SpeechService;

  private pendingTranscripts: string[] = [];

  constructor() {
    this.speechService = new SpeechService({
      onStateChange: () => this.broadcast(),
      onTranscription: (transcript) => {
        if (this.isBusy) {
          this.pendingTranscripts.push(transcript);
          const notice = {
            id: nextId(),
            role: "assistant" as const,
            content: "Déjà en cours de réponse. Je traiterai ta demande ensuite.",
            timestamp: Date.now(),
            error: true,
          };
          this.messages = [...this.messages, notice];
          this.broadcast();
          return;
        }
        return this.sendUserMessage(transcript);
      },
    });
  }

  async sendUserMessage(text: string): Promise<void> {
    const trimmed = sanitizeUserInput(text);
    if (!trimmed) {
      return;
    }

    if (this.isBusy) {
      const errorMessage: Message = {
        id: nextId(),
        role: "assistant",
        content:
          "Je suis déjà en train de répondre. Réessayez dans un instant.",
        timestamp: Date.now(),
        error: true,
      };
      this.messages = [...this.messages, errorMessage];
      return; // Do not proceed when busy
    }

    const userMessage: Message = {
      id: nextId(),
      role: "user",
      content: trimmed,
      timestamp: Date.now(),
    };
    this.messages = [...this.messages, userMessage];
    this.isBusy = true;
    this.broadcast();

    try {
      const history: ChatMessage[] = this.messages
        .filter(
          (m) => (m.role === "user" || m.role === "assistant") && !m.error,
        )
        .map((message) => ({
          role: message.role,
          content: message.content,
        }));

      const { history: augmentedHistory } =
        await this.enrichHistoryWithSemanticMemory(history, userMessage);

      const completion = await webLLMService.completeChat(augmentedHistory, {
        temperature: 0.7,
        maxTokens: 256,
        systemPrompt: DEFAULT_SYSTEM_PROMPT,
      });

      if (completion.stream) {
        const assistantMessage: Message = {
          id: nextId(),
          role: "assistant",
          content: "",
          timestamp: Date.now(),
        };
        this.messages = [...this.messages, assistantMessage];
        this.broadcast();

        let received = false;
        for await (const chunk of completion.stream) {
          if (typeof chunk === "string" && chunk.length > 0) {
            received = true;
            assistantMessage.content += chunk;
            this.broadcast();
          }
        }
        if (!received) {
          this.messages = this.messages.filter(
            (m) => m.id !== assistantMessage.id,
          );
        } else {
          await this.recordAssistantInMemory(assistantMessage);
        }
      } else if (completion.text) {
        const assistantMessage: Message = {
          id: nextId(),
          role: "assistant",
          content: completion.text,
          timestamp: Date.now(),
        };
        this.messages = [...this.messages, assistantMessage];
        await this.recordAssistantInMemory(assistantMessage);
      }

      await this.refreshReasoningTrace(userMessage);
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "string"
          ? error
          : "Erreur inconnue";
      const errorMessage: Message = {
        id: nextId(),
        role: "assistant",
        content: `Erreur lors de la génération : ${message}`,
        timestamp: Date.now(),
        error: true,
      };
      this.messages = [...this.messages, errorMessage];
    } finally {
      this.isBusy = false;
      this.broadcast();

      // Drain queued transcripts
      if (this.pendingTranscripts.length > 0) {
        const next = this.pendingTranscripts.shift()!;
        // Fire and forget; any further queuing handled by busy guard
        void this.sendUserMessage(next);
      }
    }
  }

  private buildSemanticMemoryClient(): SemanticMemoryClient | null {
    if (!this.semanticMemory) return null;

    return {
      enabled: true,
      search: async (query, neighbors) => {
        const memory = this.semanticMemory;
        if (!memory) return { results: [] };

        const results = await memory.search(query, neighbors);
        return {
          results: results.map((entry) => ({
            id: entry.id,
            content: entry.content,
            score: entry.score,
            timestamp: entry.timestamp,
          })),
        };
      },
    };
  }

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
      speechState: this.speechService.getSpeechState(),
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
    this.semanticMemory?.clear();
    this.semanticMemoryWarmup = null;
    this.broadcast();
  }

  async startSpeechCapture(): Promise<void> {
    await this.speechService.startSpeechCapture();
  }

  stopSpeechCapture(): void {
    this.speechService.stopSpeechCapture();
  }

  async speakText(text: string): Promise<void> {
    await this.speechService.speakText(text);
  }

  stopSpeechOutput(): void {
    this.speechService.stopSpeechOutput();
  }

  private async ensureSemanticMemoryReady(): Promise<EmbeddingMemory> {
    const memory = this.semanticMemory ?? new EmbeddingMemory(96);
    this.semanticMemory = memory;

    if (!this.semanticMemoryWarmup) {
      this.semanticMemoryWarmup = memory
        .warmup()
        .catch((error) => console.warn("Semantic memory warmup failed", error));
    }

    await this.semanticMemoryWarmup;
    return memory;
  }

  private async enrichHistoryWithSemanticMemory(
    history: ChatMessage[],
    userMessage: Message,
  ): Promise<{ history: ChatMessage[]; bestScore: number | null }> {
    try {
      const memory = await this.ensureSemanticMemoryReady();

      await memory.addMessage(userMessage);
      const results = await memory.search(userMessage.content, 6);
      const bestScore = results.length > 0 ? results[0].score : null;
      const contextSummary = memory.formatSummaries(results);

      const augmentedHistory =
        contextSummary.trim().length > 0 && history.length > 0
          ? [
              ...history.slice(0, -1),
              {
                role: "system",
                content: `Mémoire sémantique pertinente :\n${contextSummary}`,
              },
              history[history.length - 1],
            ]
          : history;

      this.memoryStats = {
        totalEntries: memory.getEntryCount(),
        lastHitScore: bestScore,
      };

      return { history: augmentedHistory, bestScore };
    } catch (error) {
      console.warn("Impossible d'enrichir l'historique avec la mémoire", error);
      this.memoryStats = {
        totalEntries: this.semanticMemory?.getEntryCount() ?? 0,
        lastHitScore: null,
      };
      return { history, bestScore: null };
    }
  }

  private async recordAssistantInMemory(message: Message): Promise<void> {
    try {
      const memory = await this.ensureSemanticMemoryReady();
      await memory.addMessage(message);
      this.memoryStats = {
        ...this.memoryStats,
        totalEntries: memory.getEntryCount(),
      };
    } catch (error) {
      console.warn(
        "Impossible d'enregistrer la réponse dans la mémoire",
        error,
      );
    }
  }

  private async refreshReasoningTrace(userMessage: Message): Promise<void> {
    try {
      const engine =
        (await webLLMService.getCurrentEngine?.()) as MLCEngine | null;

      if (!engine) {
        this.reasoningTrace = {
          summary:
            "Trace limitée : moteur non initialisé, affichage d'une trace minimale.",
          raw: { reason: "engine_unavailable" },
        };
        this.broadcast();
        return;
      }

      const historyForContext = this.messages.reduce<Message[]>((acc, msg) => {
        const alreadyAdded = acc.some((entry) => entry.id === msg.id);
        if (alreadyAdded) return acc;

        if (msg.id === userMessage.id) {
          acc.push(userMessage);
        } else {
          acc.push(msg);
        }

        return acc;
      }, []);

      const decision = await decideNextAction(
        engine,
        userMessage,
        historyForContext,
        DEFAULT_TRACE_CONFIG,
        this.buildSemanticMemoryClient(),
        null,
      );

      this.reasoningTrace = {
        summary:
          decision.plan || decision.rationale || "Trace de décision générée.",
        raw: {
          decision,
          context: decision.context,
        },
      };
    } catch (error) {
      console.warn("Reasoning trace generation failed", error);
      this.reasoningTrace = {
        summary:
          "Impossible de construire une trace détaillée pour cette requête.",
        raw: { error: error instanceof Error ? error.message : String(error) },
      };
    }

    this.broadcast();
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
