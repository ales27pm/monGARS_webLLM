import type { ScoredMemoryEntry } from "./contextEngine";

export type RequestedAction = "search" | "respond";
export type EffectiveAction = "search" | "respond";

/**
 * A ReasoningTrace captures what the "meta layer" decided to do for a
 * particular user turn: requested vs effective action, search query,
 * plan, rationale, and which memory hits were used.
 *
 * This is meant both for debugging and for UI visualisation.
 */
export interface ReasoningTrace {
  /** Monotonically increasing identifier for the trace. */
  id: number;

  /** The raw action requested by the decision model. */
  requestedAction: RequestedAction;

  /** The action we actually took after normalisation / safety checks. */
  effectiveAction: EffectiveAction;

  /** Search query, if any (null if effectiveAction === "respond"). */
  query: string | null;

  /** High-level multi-step plan proposed by the model. */
  plan: string;

  /** Optional free-text rationale explaining the choice. */
  rationale: string | null;

  /** Optional partial draft answer returned by the decision model. */
  partialResponse: string | null;

  /** Whether semantic memory was enabled at the time. */
  memoryEnabled: boolean;

  /** Raw memory hits (as returned from the context engine). */
  memoryResults: ScoredMemoryEntry[];

  /** Short description of memory usage for this turn. */
  memoryContextSummary: string;

  /** Whether a web search or external tool call was actually performed. */
  usedExternalTool: boolean;

  /** Free-form notes about what happened (warnings, fallbacks, etc.). */
  notes: string[];

  /** Epoch ms when this trace was created. */
  timestamp: number;
}

/**
 * Helper to create a new ReasoningTrace from scratch.
 * Keeps all the wiring and defaults in one place.
 */
export interface ReasoningTraceParams {
  id: number;
  requestedAction: RequestedAction;
  effectiveAction: EffectiveAction;
  query?: string | null;
  plan: string;
  rationale?: string | null;
  partialResponse?: string | null;
  memoryEnabled: boolean;
  memoryResults?: ScoredMemoryEntry[];
  memoryContextSummary?: string | null;
  usedExternalTool: boolean;
  notes?: string[];
}

export function createReasoningTrace(params: ReasoningTraceParams): ReasoningTrace {
  return {
    id: params.id,
    requestedAction: params.requestedAction,
    effectiveAction: params.effectiveAction,
    query: params.query ?? null,
    plan: params.plan,
    rationale: params.rationale ?? null,
    partialResponse: params.partialResponse ?? null,
    memoryEnabled: params.memoryEnabled,
    memoryResults: params.memoryResults ?? [],
    memoryContextSummary:
      params.memoryContextSummary ??
      (params.memoryEnabled
        ? params.memoryResults && params.memoryResults.length > 0
          ? "Mémoire utilisée (résultats disponibles)."
          : "Mémoire activée mais aucun résultat pertinent."
        : "Mémoire désactivée."),
    usedExternalTool: params.usedExternalTool,
    notes: params.notes ?? [],
    timestamp: Date.now(),
  };
}
