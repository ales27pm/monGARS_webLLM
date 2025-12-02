import React from "react";
import type { ScoredMemoryEntry } from "../memory";

const formatEmbeddingPreview = (vector: Float32Array) => {
  if (!vector || vector.length === 0) return "vecteur vide";
  const values = Array.from(vector.slice(0, 6)).map((v) => v.toFixed(3));
  return `${values.join(", ")}… (${vector.length} dims)`;
};

const formatDate = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

type ReasoningSnapshot = {
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

interface ReasoningVisualizerProps {
  trace: ReasoningSnapshot | null;
  onClear: () => void;
}

export const ReasoningVisualizer: React.FC<ReasoningVisualizerProps> = ({
  trace,
  onClear,
}) => {
  if (!trace) return null;

  const stripListPrefix = (value: string) =>
    value
      // Remove ordered/unordered list markers (1), 1., -, •, etc.) and trim spaces
      .replace(/^[\s>*-]*\d*[.)]?\s*/, "")
      .trim();

  const planSteps = trace.plan
    .split(/\n+/)
    .map((step) => stripListPrefix(step))
    .filter(Boolean);

  return (
    <div className="border-t border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 px-4 py-3">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Traçage du raisonnement
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Action demandée :
            <span className="ml-1 font-semibold text-primary-DEFAULT">
              {trace.requestedAction.toUpperCase()}
            </span>
            {trace.requestedAction !== trace.effectiveAction && (
              <span className="ml-2 text-amber-500">(appliqué : {trace.effectiveAction})</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {formatDate(trace.timestamp)}
          </span>
          <button
            onClick={onClear}
            className="text-xs text-slate-500 hover:text-primary-DEFAULT transition-colors"
            title="Effacer la trace actuelle"
          >
            <i className="fa-solid fa-broom"></i>
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-800/60 rounded-lg p-3 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Plan (Tree-of-Thought)
            </h3>
            <span className="text-xs text-slate-500">{planSteps.length} étapes</span>
          </div>
          <ol className="space-y-1 text-sm text-slate-700 dark:text-slate-200 list-decimal list-inside">
            {planSteps.map((step, idx) => (
              <li key={idx} className="leading-snug">
                {step}
              </li>
            ))}
          </ol>
          {trace.rationale && (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 leading-snug">
              Justification : {trace.rationale}
            </p>
          )}
          {trace.query && (
            <p className="mt-2 text-xs text-primary-DEFAULT font-semibold">
              Requête API : {trace.query}
            </p>
          )}
        </div>

        <div className="bg-white dark:bg-slate-800/60 rounded-lg p-3 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">
            Statut des outils
          </h3>
          <div className="space-y-2 text-sm text-slate-700 dark:text-slate-200">
            <div className="flex items-center justify-between">
              <span>Recherche web</span>
              <span
                className={`px-2 py-1 rounded text-xs font-semibold ${
                  trace.effectiveAction === "search"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
                    : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-100"
                }`}
              >
                {trace.effectiveAction === "search" ? "active" : "non utilisée"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Mémoire vectorielle</span>
              <span
                className={`px-2 py-1 rounded text-xs font-semibold ${
                  trace.memoryEnabled
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200"
                    : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-100"
                }`}
              >
                {trace.memoryEnabled ? "active" : "coupée"}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-snug">
              {trace.memoryContext
                ? `Contexte mémoire : ${trace.memoryContext}`
                : "Aucun contexte mémoire injecté."}
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800/60 rounded-lg p-3 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Voisins sémantiques
            </h3>
            <span className="text-xs text-slate-500">{trace.memoryResults.length} éléments</span>
          </div>
          {trace.memoryResults.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {trace.memoryEnabled
                ? "Aucun résultat trouvé pour cette requête."
                : "Mémoire désactivée : aucun voisin calculé."}
            </p>
          ) : (
            <ul className="space-y-2">
              {trace.memoryResults.map((entry) => {
                const scorePct = Math.min(100, Math.max(0, Math.round(entry.score * 100)));
                return (
                  <li key={entry.id} className="text-xs text-slate-700 dark:text-slate-200">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{entry.role.toUpperCase()}</span>
                      <span className="text-slate-500">{scorePct}%</span>
                    </div>
                    <p className="truncate text-slate-600 dark:text-slate-300" title={entry.content || undefined}>
                      {entry.content}
                    </p>
                    <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded mt-1 overflow-hidden">
                      <div
                        className="h-full bg-primary-DEFAULT"
                        style={{ width: `${scorePct}%` }}
                        aria-label={`Score de similarité ${scorePct}%`}
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      Embedding : {formatEmbeddingPreview(entry.embedding)} | {formatDate(entry.timestamp)}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};
