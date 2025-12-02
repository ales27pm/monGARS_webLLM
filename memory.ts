import type { Message, Role } from "./types";

export type MemoryEntry = {
  id: string;
  role: Role;
  content: string;
  timestamp: number;
  embedding: Float32Array;
};

export type ScoredMemoryEntry = MemoryEntry & { score: number };

type WorkerRequest =
  | { type: "warmup"; requestId: string }
  | { type: "embed"; requestId: string; text: string }
  | { type: "search"; requestId: string; query: string; entries: MemoryEntry[]; limit: number };

type WorkerResponse =
  | { type: "warmup_complete"; requestId: string }
  | { type: "embed_result"; requestId: string; vector: Float32Array }
  | { type: "search_result"; requestId: string; results: { index: number; score: number }[] };

/**
 * Lightweight semantic memory powered by a local MiniLM embedding model.
 * Embedding and search run in a dedicated worker to keep the UI thread responsive.
 */
export class EmbeddingMemory {
  private readonly worker: Worker;
  private readonly entries: MemoryEntry[] = [];
  private readonly cache = new Map<string, Float32Array>();
  private readonly maxCacheEntries = 512;
  private readonly maxEntries: number;
  private readonly pendingRequests = new Map<
    string,
    { resolve: (response: WorkerResponse) => void; type: WorkerRequest["type"] }
  >();

  constructor(maxEntries = 64) {
    this.maxEntries = maxEntries;
    this.worker = new Worker(new URL("./embedding.worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const { requestId } = event.data;
      const pending = this.pendingRequests.get(requestId);
      if (pending) {
        pending.resolve(event.data);
        this.pendingRequests.delete(requestId);
      }
    };

    this.worker.onerror = (error) => {
      console.warn("Embedding worker error", error);
      this.pendingRequests.forEach((pending, requestId) => {
        const fallback: WorkerResponse = (() => {
          switch (pending.type) {
            case "search":
              return { type: "search_result", requestId, results: [] };
            case "warmup":
              return { type: "warmup_complete", requestId };
            default:
              return { type: "embed_result", requestId, vector: new Float32Array() };
          }
        })();
        pending.resolve(fallback);
      });
      this.pendingRequests.clear();
    };
  }

  async warmup() {
    await this.sendToWorker({ type: "warmup", requestId: this.requestId() });
  }

  async resetWithMessages(messages: Message[]) {
    this.entries.length = 0;

    const MAX_MESSAGES_TO_EMBED = 200;
    const CONCURRENCY = 8;
    const recentMessages =
      messages.length > MAX_MESSAGES_TO_EMBED
        ? messages.slice(-MAX_MESSAGES_TO_EMBED)
        : messages;

    for (let i = 0; i < recentMessages.length; i += CONCURRENCY) {
      const batch = recentMessages.slice(i, i + CONCURRENCY);
      const entries = await Promise.all(batch.map((msg) => this.buildEntry(msg)));
      entries.forEach((entry) => {
        if (entry) {
          this.pushEntry(entry);
        }
      });
    }
  }

  async addMessage(message: Message) {
    const entry = await this.buildEntry(message);
    if (!entry) return;

    this.pushEntry(entry);
  }

  async search(query: string, limit = 4): Promise<ScoredMemoryEntry[]> {
    const content = query.trim();
    if (!content || this.entries.length === 0) return [];

    const snapshot = this.entries.slice();

    const response = await this.sendToWorker({
      type: "search",
      requestId: this.requestId(),
      query: content,
      entries: snapshot,
      limit,
    });

    if (response.type !== "search_result") return [];

    return response.results
      .map((result) => {
        const entry = snapshot[result.index];
        if (!entry) return null;
        return {
          ...entry,
          score: result.score,
        };
      })
      .filter((entry): entry is ScoredMemoryEntry => entry !== null);
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

  private async embed(text: string): Promise<Float32Array> {
    const cached = this.getCachedEmbedding(text);
    if (cached) return cached;

    const response = await this.sendToWorker({
      type: "embed",
      requestId: this.requestId(),
      text,
    });

    if (response.type !== "embed_result") {
      return new Float32Array();
    }

    this.setCachedEmbedding(text, response.vector);
    return response.vector;
  }

  private sendToWorker(message: WorkerRequest): Promise<WorkerResponse> {
    return new Promise((resolve) => {
      this.pendingRequests.set(message.requestId, { resolve, type: message.type });
      this.worker.postMessage(message);
    });
  }

  private requestId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  private truncate(content: string, limit = 320) {
    if (content.length <= limit) return content;
    return `${content.slice(0, limit)}…`;
  }

  private async buildEntry(message: Message): Promise<MemoryEntry | null> {
    const content = (message.content || "").trim();
    if (!content) return null;

    const embedding = await this.embed(content);
    if (embedding.length === 0) return null;

    return {
      id: message.id,
      role: message.role,
      content: this.truncate(content),
      timestamp: message.timestamp,
      embedding,
    };
  }

  private pushEntry(entry: MemoryEntry) {
    this.entries.push(entry);

    if (this.entries.length > this.maxEntries) {
      this.entries.splice(0, this.entries.length - this.maxEntries);
    }
  }

  private getCachedEmbedding(text: string): Float32Array | null {
    const key = text.trim();
    if (!key) return null;

    const cached = this.cache.get(key);
    if (!cached) return null;

    // Refresh key for LRU semantics.
    this.cache.delete(key);
    this.cache.set(key, cached);
    return cached;
  }

  private setCachedEmbedding(text: string, vector: Float32Array) {
    const key = text.trim();
    if (!key || vector.length === 0) return;

    this.cache.set(key, vector);

    if (this.cache.size > this.maxCacheEntries) {
      const firstKey = this.cache.keys().next().value as string | undefined;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
  }
}
