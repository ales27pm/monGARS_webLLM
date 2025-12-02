import { useCallback, useEffect, useRef } from "react";
import { EmbeddingMemory, type ScoredMemoryEntry } from "./memory";
import type { Message } from "./types";

export function useSemanticMemory(
  messages: Message[],
  options?: {
    enabled?: boolean;
    maxEntries?: number;
    neighbors?: number;
  },
) {
  const { enabled = true, maxEntries = 64, neighbors = 4 } = options || {};
  const memoryRef = useRef<EmbeddingMemory | null>(null);

  if (!memoryRef.current || memoryRef.current.getCapacity() !== maxEntries) {
    memoryRef.current = new EmbeddingMemory(maxEntries);
  }

  const memory = memoryRef.current;

  useEffect(() => {
    if (!enabled) {
      memory.clear();
      return;
    }

    memory.warmup().catch((err) =>
      console.warn("Semantic memory warmup failed", err),
    );
  }, [enabled, memory]);

  useEffect(() => {
    if (!enabled) {
      memory.clear();
      return;
    }

    memory
      .resetWithMessages(messages)
      .catch((err) =>
        console.warn("Impossible de recharger la mémoire sémantique", err),
      );
  }, [enabled, memory, messages]);

  const queryMemory = useCallback(
    async (
      query: string,
      neighborsOverride?: number,
    ): Promise<{ context: string; results: ScoredMemoryEntry[] }> => {
      if (!enabled) return { context: "", results: [] };

      const limit =
        typeof neighborsOverride === "number" && Number.isFinite(neighborsOverride)
          ? Math.max(1, neighborsOverride)
          : neighbors;

      try {
        const results = await memory.search(query, limit);
        return { context: memory.formatSummaries(results), results };
      } catch (error) {
        console.warn("Semantic memory search failed", error);
        return { context: "", results: [] };
      }
    },
    [enabled, memory, neighbors],
  );

  const recordExchange = useCallback(
    async (user: Message, assistant: Message) => {
      if (!enabled) return;
      try {
        await memory.addMessage(user);
        await memory.addMessage(assistant);
      } catch (error) {
        console.warn("Impossible d'enregistrer la mémoire sémantique", error);
      }
    },
    [enabled, memory],
  );

  return { queryMemory, recordExchange, memoryEnabled: enabled };
}
