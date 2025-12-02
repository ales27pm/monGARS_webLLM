import type { ScoredMemoryEntry } from "./memory";

export type ReasoningTrace = {
  id: number;
  requestedAction: "search" | "respond";
  effectiveAction: "search" | "respond";
  query?: string | null;
  plan: string;
  rationale?: string;
  memoryContext: string;
  memoryEnabled: boolean;
  memoryResults: ScoredMemoryEntry[];
  timestamp: number;
};
