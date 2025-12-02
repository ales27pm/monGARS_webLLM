import { useCallback, useEffect, useRef } from "react";
import { EmbeddingMemory } from "./memory";
import type { Message } from "./types";

export function useSemanticMemory(messages: Message[]) {
  const memoryRef = useRef<EmbeddingMemory | null>(null);

  if (!memoryRef.current) {
    memoryRef.current = new EmbeddingMemory();
  }

  const memory = memoryRef.current;

  useEffect(() => {
    memory.warmup().catch((err) =>
      console.warn("Semantic memory warmup failed", err),
    );
  }, [memory]);

  useEffect(() => {
    memory
      .resetWithMessages(messages)
      .catch((err) =>
        console.warn("Impossible de recharger la mémoire sémantique", err),
      );
  }, [memory, messages]);

  const buildMemoryContext = useCallback(
    async (query: string) => {
      try {
        const results = await memory.search(query, 4);
        return memory.formatSummaries(results);
      } catch (error) {
        console.warn("Semantic memory search failed", error);
        return "";
      }
    },
    [memory],
  );

  const recordExchange = useCallback(
    async (user: Message, assistant: Message) => {
      try {
        await memory.addMessage(user);
        await memory.addMessage(assistant);
      } catch (error) {
        console.warn("Impossible d'enregistrer la mémoire sémantique", error);
      }
    },
    [memory],
  );

  return { buildMemoryContext, recordExchange };
}
