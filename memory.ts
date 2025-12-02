import { pipeline, env } from "@xenova/transformers";
import type { Message, Role } from "./types";

type EmbeddingOutput = {
  data: Float32Array | number[];
};

type EmbeddingPipeline = (input: string, options?: object) => Promise<EmbeddingOutput>;

export type MemoryEntry = {
  id: string;
  role: Role;
  content: string;
  timestamp: number;
  embedding: Float32Array;
};

export type ScoredMemoryEntry = MemoryEntry & { score: number };

/**
 * Lightweight semantic memory powered by a local MiniLM embedding model.
 * It runs fully in-browser via @xenova/transformers and caches embeddings
 * to avoid recomputation. Entries are trimmed and capped to keep resource
 * usage predictable on devices without a GPU.
 */
export class EmbeddingMemory {
  private embedderPromise: Promise<EmbeddingPipeline> | null = null;
  private readonly entries: MemoryEntry[] = [];
  private readonly cache = new Map<string, Float32Array>();
  private readonly maxEntries: number;

  constructor(maxEntries = 64) {
    this.maxEntries = maxEntries;
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    env.allowRemoteModels = true;
    try {
      (env.backends.onnx as any).wasm.numThreads = 1;
    } catch {
      // Defaults are fine if the backend configuration is unavailable.
    }
  }

  async warmup() {
    await this.getEmbedder();
  }

  async resetWithMessages(messages: Message[]) {
    this.entries.length = 0;
    for (const msg of messages) {
      await this.addMessage(msg);
    }
  }

  async addMessage(message: Message) {
    const content = (message.content || "").trim();
    if (!content) return;

    const embedding = await this.embed(content);
    this.entries.push({
      id: message.id,
      role: message.role,
      content: this.truncate(content),
      timestamp: message.timestamp,
      embedding,
    });

    if (this.entries.length > this.maxEntries) {
      this.entries.splice(0, this.entries.length - this.maxEntries);
    }
  }

  async search(query: string, limit = 4): Promise<ScoredMemoryEntry[]> {
    const content = query.trim();
    if (!content || this.entries.length === 0) return [];

    const queryEmbedding = await this.embed(content);
    const scored = this.entries
      .map((entry) => ({ ...entry, score: this.cosineSimilarity(queryEmbedding, entry.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .filter((entry) => entry.score > 0.2);

    return scored;
  }

  formatSummaries(entries: ScoredMemoryEntry[]): string {
    if (entries.length === 0) return "";
    return entries
      .map((entry) => {
        const date = new Date(entry.timestamp).toLocaleString();
        return `- (${entry.role}, ${date}, ${(entry.score * 100).toFixed(0)}%) ${entry.content}`;
      })
      .join("\n");
  }

  private async getEmbedder(): Promise<EmbeddingPipeline> {
    if (!this.embedderPromise) {
      this.embedderPromise = pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
        quantized: true,
      }) as Promise<EmbeddingPipeline>;
    }
    return this.embedderPromise;
  }

  private async embed(text: string): Promise<Float32Array> {
    if (this.cache.has(text)) {
      return this.cache.get(text)!;
    }

    const embedder = await this.getEmbedder();
    const output = await embedder(text, { pooling: "mean", normalize: true });
    const vector = output.data instanceof Float32Array ? output.data : Float32Array.from(output.data);
    this.cache.set(text, vector);
    return vector;
  }

  private cosineSimilarity(a: Float32Array, b: Float32Array) {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    const length = Math.min(a.length, b.length);
    for (let i = 0; i < length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private truncate(content: string, limit = 320) {
    if (content.length <= limit) return content;
    return `${content.slice(0, limit)}…`;
  }
}
