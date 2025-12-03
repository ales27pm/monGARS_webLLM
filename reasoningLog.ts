import type { DecisionDiagnostics, DecisionTrace } from "./decisionEngine";

export type ReasoningLogEntry = {
  id: string;
  timestamp: number;
  userMessage: string;
  action: "respond" | "search";
  query: string | null;
  plan: string;
  rationale: string;
  notes: string[];
  diagnostics?: DecisionDiagnostics;
  trace?: DecisionTrace;
  finalResponse?: string;
  searchUsed?: boolean;
};

const STORAGE_KEY = "mg_reasoning_log";
const MAX_ENTRIES = 40;
const inMemoryLog: ReasoningLogEntry[] = [];

const safeParse = (raw: string | null): ReasoningLogEntry[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ReasoningLogEntry[]) : [];
  } catch (error) {
    console.warn("Impossible de parser le journal de raisonnement", error);
    return [];
  }
};

const readStore = (): ReasoningLogEntry[] => {
  if (typeof localStorage === "undefined") {
    return [...inMemoryLog];
  }

  try {
    return safeParse(localStorage.getItem(STORAGE_KEY));
  } catch (error) {
    console.warn("Lecture du journal de raisonnement impossible", error);
    return [];
  }
};

const writeStore = (entries: ReasoningLogEntry[]) => {
  const payload = JSON.stringify(entries.slice(-MAX_ENTRIES));

  if (typeof localStorage === "undefined") {
    inMemoryLog.splice(0, inMemoryLog.length, ...entries);
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, payload);
  } catch (error) {
    console.warn("Écriture du journal de raisonnement impossible", error);
  }
};

const normalizeResponse = (response?: string) => {
  if (!response) return response;
  const trimmed = response.trim();
  if (trimmed.length <= 1200) return trimmed;
  return `${trimmed.slice(0, 1200)}…`;
};

export const appendReasoningLog = (entry: ReasoningLogEntry) => {
  const normalized: ReasoningLogEntry = {
    ...entry,
    finalResponse: normalizeResponse(entry.finalResponse),
  };

  const current = readStore();
  current.push(normalized);
  writeStore(current);
};

export const getReasoningLog = () => readStore();

export const clearReasoningLog = () => writeStore([]);
