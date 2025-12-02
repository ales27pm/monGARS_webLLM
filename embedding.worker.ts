/// <reference lib="WebWorker" />

import { pipeline, env } from "@xenova/transformers";
import type { Role } from "./types";

type EmbeddingOutput = {
  data: Float32Array | number[];
};

type EmbeddingPipeline = (input: string, options?: object) => Promise<EmbeddingOutput>;

type SerializedEntry = {
  id: string;
  role: Role;
  content: string;
  timestamp: number;
  embedding: Float32Array;
};

type WorkerRequest =
  | { type: "warmup"; requestId: string }
  | { type: "embed"; requestId: string; text: string }
  | { type: "search"; requestId: string; query: string; entries: SerializedEntry[]; limit: number };

type WorkerResponse =
  | { type: "warmup_complete"; requestId: string }
  | { type: "embed_result"; requestId: string; vector: Float32Array }
  | { type: "search_result"; requestId: string; results: { index: number; score: number }[] };

const cache = new Map<string, Float32Array>();
let embedderPromise: Promise<EmbeddingPipeline> | null = null;

function configureEnv() {
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  env.allowRemoteModels = true;
  try {
    (env.backends.onnx as any).wasm.numThreads = 1;
  } catch {
    // Defaults are fine if the backend configuration is unavailable.
  }
}

async function getEmbedder(): Promise<EmbeddingPipeline> {
  if (!embedderPromise) {
    configureEnv();
    embedderPromise = pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
      quantized: true,
    }) as Promise<EmbeddingPipeline>;
  }
  return embedderPromise;
}

async function embed(text: string): Promise<Float32Array> {
  const trimmed = text.trim();
  if (!trimmed) return new Float32Array();

  if (cache.has(trimmed)) {
    return cache.get(trimmed)!;
  }

  const embedder = await getEmbedder();
  const output = await embedder(trimmed, { pooling: "mean", normalize: true });
  const vector = output.data instanceof Float32Array ? output.data : Float32Array.from(output.data);
  cache.set(trimmed, vector);
  return vector;
}

function cosineSimilarity(a: Float32Array, b: Float32Array) {
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

async function handleSearch(query: string, entries: SerializedEntry[], limit: number) {
  const queryEmbedding = await embed(query);
  if (queryEmbedding.length === 0) return [] as { index: number; score: number }[];

  return entries
    .map((entry, index) => ({ index, score: cosineSimilarity(queryEmbedding, entry.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .filter((entry) => entry.score > 0.2);
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { data } = event;
  try {
    switch (data.type) {
      case "warmup": {
        await getEmbedder();
        postMessage({ type: "warmup_complete", requestId: data.requestId } satisfies WorkerResponse);
        break;
      }
      case "embed": {
        const vector = await embed(data.text);
        postMessage(
          { type: "embed_result", requestId: data.requestId, vector } satisfies WorkerResponse,
          [vector.buffer],
        );
        break;
      }
      case "search": {
        const results = await handleSearch(data.query, data.entries, data.limit);
        postMessage({ type: "search_result", requestId: data.requestId, results } satisfies WorkerResponse);
        break;
      }
      default:
        throw new Error(`Unsupported worker message: ${(data as WorkerRequest).type}`);
    }
  } catch (error) {
    console.warn("Embedding worker error", error);
    const fallback: WorkerResponse = (() => {
      switch (data.type) {
        case "search":
          return { type: "search_result", requestId: data.requestId, results: [] };
        case "warmup":
          return { type: "warmup_complete", requestId: data.requestId };
        default:
          return { type: "embed_result", requestId: data.requestId, vector: new Float32Array() };
      }
    })();
    postMessage(fallback);
  }
};
