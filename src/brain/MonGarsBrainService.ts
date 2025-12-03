import { webLLMService } from "../services/WebLLMService";
import type { ChatMessage } from "../services/WebLLMService.types";
import { EmbeddingMemory } from "../../memory";
import { decideNextAction } from "../../decisionEngine";
import type { Config, MLCEngine, Message } from "../../types";
import type { SemanticMemoryClient } from "../../contextEngine";
import { DEFAULT_MODEL_ID } from "../../models";
import { ensurePipeline } from "../../speechPipeline";
import { blobToFloat32AudioData } from "../../speechUtils";

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
  lastTranscript: string;
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
  private speechState: SpeechState = {
    mode: "idle",
    isRecording: false,
    isPlaying: false,
    lastError: null,
    lastTranscript: "",
  };

  private mediaRecorder: MediaRecorder | null = null;
  private recordingChunks: BlobPart[] = [];
  private recordingStream: MediaStream | null = null;

  private audioContext: AudioContext | null = null;
  private playbackSource: AudioBufferSourceNode | null = null;

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
    this.semanticMemory?.clear();
    this.semanticMemoryWarmup = null;
    this.broadcast();
  }

  private setSpeechState(partial: Partial<SpeechState>): void {
    this.speechState = {
      ...this.speechState,
      ...partial,
    };
    this.broadcast();
  }

  private getAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    return this.audioContext;
  }

  private stopPlayback(): void {
    if (this.playbackSource) {
      try {
        this.playbackSource.stop();
      } catch (err) {
        console.warn("Failed to stop playback", err);
      }
    }
    this.playbackSource = null;
  }

  private async transcribeBlob(blob: Blob): Promise<string> {
    const asr = await ensurePipeline(
      "automatic-speech-recognition",
      "Xenova/whisper-small",
    );

    const { audioData, sampleRate } = await blobToFloat32AudioData(
      blob,
      this.getAudioContext(),
    );

    const result = await asr({ array: audioData, sampling_rate: sampleRate }, {
      chunk_length_s: 15,
      stride_length_s: [4, 2],
    });

    if (typeof result.text === "string") {
      return result.text.trim();
    }

    return "";
  }

  private async handleTranscription(blob: Blob): Promise<void> {
    if (blob.size === 0) {
      this.setSpeechState({
        lastError: "Aucun audio n'a été capturé.",
        isRecording: false,
        mode: "idle",
      });
      return;
    }

    try {
      const transcript = await this.transcribeBlob(blob);
      if (!transcript) {
        this.setSpeechState({
          lastError: "La transcription est vide.",
          isRecording: false,
          mode: "idle",
        });
        return;
      }

      this.setSpeechState({
        lastTranscript: transcript,
        lastError: null,
        isRecording: false,
        mode: "idle",
      });

      await this.sendUserMessage(transcript);
    } catch (err) {
      console.error("Transcription error", err);
      this.setSpeechState({
        lastError:
          "La transcription a échoué. Vérifie le micro ou réessaie.",
        isRecording: false,
        mode: "idle",
      });
    }
  }

  private cleanupRecorder(): void {
    if (this.recordingStream) {
      this.recordingStream.getTracks().forEach((track) => track.stop());
    }
    this.recordingStream = null;
    this.mediaRecorder = null;
    this.recordingChunks = [];
  }

  async startSpeechCapture(): Promise<void> {
    if (this.mediaRecorder) return;

    const canRecordAudio =
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia;

    if (!canRecordAudio) {
      this.setSpeechState({
        lastError: "La capture audio n'est pas disponible dans ce navigateur.",
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.recordingStream = stream;

      const options: MediaRecorderOptions | undefined =
        typeof MediaRecorder !== "undefined" &&
        MediaRecorder.isTypeSupported("audio/webm")
          ? { mimeType: "audio/webm" }
          : undefined;

      const recorder = new MediaRecorder(stream, options);
      this.recordingChunks = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.recordingChunks.push(event.data);
        }
      };

      recorder.onerror = (event) => {
        console.error("Recorder error", event);
        this.setSpeechState({
          lastError: "Erreur lors de la capture audio.",
          isRecording: false,
          mode: "idle",
        });
        this.cleanupRecorder();
      };

      recorder.onstop = async () => {
        const blob = new Blob(this.recordingChunks, { type: "audio/webm" });
        this.cleanupRecorder();
        await this.handleTranscription(blob);
      };

      recorder.start();
      this.mediaRecorder = recorder;
      this.setSpeechState({
        mode: "listening",
        isRecording: true,
        lastError: null,
      });
    } catch (err) {
      console.error("Microphone access failed", err);
      this.setSpeechState({
        lastError: "Impossible d'accéder au micro.",
        isRecording: false,
        mode: "idle",
      });
      this.cleanupRecorder();
    }
  }

  stopSpeechCapture(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    }
  }

  async speakText(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;

    this.stopPlayback();
    this.setSpeechState({
      mode: "speaking",
      isPlaying: true,
      lastError: null,
    });

    try {
      const tts = await ensurePipeline("text-to-speech", "Xenova/parler-tts-mini-v1");
      const output = await tts(trimmed, {
        description: "French voice, clear and warm",
      });
      const audioArray = output.audio as Float32Array;
      const sampleRate = (output as any).sampling_rate || 22050;
      const audioContext = this.getAudioContext();

      const buffer = audioContext.createBuffer(1, audioArray.length, sampleRate);
      buffer.copyToChannel(audioArray, 0);

      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      source.onended = () => {
        this.setSpeechState({ mode: "idle", isPlaying: false });
        this.stopPlayback();
      };
      this.playbackSource = source;
      source.start();
    } catch (err) {
      console.error("TTS error", err);
      this.setSpeechState({
        lastError: "La synthèse vocale a échoué.",
        mode: "idle",
        isPlaying: false,
      });
      this.stopPlayback();
    }
  }

  stopSpeechOutput(): void {
    this.stopPlayback();
    this.setSpeechState({ mode: "idle", isPlaying: false });
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
        timestamp: Date.now(),
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
      timestamp: Date.now(),
    };

    this.messages = [...this.messages, userMessage];
    this.isBusy = true;
    this.broadcast();

    try {
      const history: ChatMessage[] = this.messages
        .filter((m) => (m.role === "user" || m.role === "assistant") && !m.error)
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
          if (chunk && chunk.length > 0) {
            received = true;
            assistantMessage.content += chunk;
            this.broadcast();
          }
        }
        if (!received) {
          this.messages = this.messages.filter((m) => m.id !== assistantMessage.id);
        } else {
          await this.recordAssistantInMemory(assistantMessage);
        }
        // Do not append completion.text when stream was used to avoid duplicate assistant messages
      } else {
        const sanitized = (completion.text ?? "").trim();
        if (sanitized.length > 0) {
          const assistantMessage: Message = {
            id: nextId(),
            role: "assistant",
            content: sanitized,
            timestamp: Date.now(),
          };
          this.messages = [...this.messages, assistantMessage];
          await this.recordAssistantInMemory(assistantMessage);
        }
      }

      await this.refreshReasoningTrace(userMessage);

    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Erreur inconnue lors de la génération.";
      const errorMessage: Message = {
        id: nextId(),
        role: "assistant",
        content: `Désolé, une erreur s'est produite : ${message}`,
        timestamp: Date.now(),
        error: true,
      };
      this.messages = [...this.messages, errorMessage];
    } finally {
      this.isBusy = false;
      this.broadcast();
    }
  }

  private async ensureSemanticMemoryReady(): Promise<EmbeddingMemory> {
    const memory = this.semanticMemory ?? new EmbeddingMemory(96);
    this.semanticMemory = memory;

    if (!this.semanticMemoryWarmup) {
      this.semanticMemoryWarmup = memory
        .warmup()
        .catch((error) =>
          console.warn("Semantic memory warmup failed", error),
        );
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
      console.warn("Impossible d'enregistrer la réponse dans la mémoire", error);
    }
  }

  private async refreshReasoningTrace(userMessage: Message): Promise<void> {
    try {
      const engine = (await webLLMService.getCurrentEngine?.()) as
        | MLCEngine
        | null;

      if (!engine) {
        this.reasoningTrace = {
          summary:
            "Trace limitée : moteur non initialisé, affichage d'une trace minimale.",
          raw: { reason: "engine_unavailable" },
        };
        this.broadcast();
        return;
      }

      const historyForContext = this.messages.reduce<Message[]>(
        (acc, msg) => {
          const alreadyAdded = acc.some((entry) => entry.id === msg.id);
          if (alreadyAdded) return acc;

          if (msg.id === userMessage.id) {
            acc.push(userMessage);
          } else {
            acc.push(msg);
          }

          return acc;
        },
        [],
      );

      const decision = await decideNextAction(
        engine,
        userMessage,
        historyForContext,
        DEFAULT_TRACE_CONFIG,
        this.buildSemanticMemoryClient(),
        null,
      );

      this.reasoningTrace = {
        summary: decision.plan || decision.rationale || "Trace de décision générée.",
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
