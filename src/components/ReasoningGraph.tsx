import React from "react";
import type {
  OrchestratorGraph,
  OrchestratorGraphEdge,
  OrchestratorGraphNode,
} from "../prompts/orchestrator";

interface Props {
  graph: OrchestratorGraph | null;
}

export const ReasoningGraphView: React.FC<Props> = ({ graph }) => {
  if (!graph || graph.nodes.length === 0) {
    return (
      <div className="reasoning-graph empty">
        <p className="text-sm text-slate-500">
          Aucun graphe de pensée disponible pour ce tour.
        </p>
      </div>
    );
  }

  return (
    <div className="reasoning-graph border border-slate-200 rounded-md p-3 bg-slate-50 text-sm">
      <h3 className="font-semibold mb-2 text-slate-700">Flux de pensée (monGARS)</h3>

      <div className="flex flex-col gap-2 md:flex-row md:gap-4">
        <div className="flex-1">
          <h4 className="font-semibold text-xs uppercase text-slate-500 mb-1">Nœuds</h4>
          <ul className="space-y-1">
            {graph.nodes.map((node: OrchestratorGraphNode) => (
              <li
                key={node.id}
                className="px-2 py-1 rounded border border-slate-200 bg-white"
              >
                <div className="text-[11px] text-slate-400">
                  {node.id}
                  {node.type ? (
                    <span className="ml-1 rounded bg-slate-100 px-1 py-[1px] text-[10px] uppercase">
                      {node.type}
                    </span>
                  ) : null}
                </div>
                <div className="text-[13px] text-slate-800">{node.label}</div>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex-1">
          <h4 className="font-semibold text-xs uppercase text-slate-500 mb-1">Liens</h4>
          {graph.edges.length === 0 ? (
            <p className="text-xs text-slate-500">Aucun lien défini.</p>
          ) : (
            <ul className="space-y-1">
              {graph.edges.map((edge: OrchestratorGraphEdge, index: number) => (
                <li
                  key={`${edge.from}-${edge.to}-${index}`}
                  className="px-2 py-1 rounded border border-slate-200 bg-white"
                >
                  <span className="font-mono text-[11px] text-slate-500">
                    {edge.from} → {edge.to}
                  </span>
                  {edge.label && (
                    <span className="ml-1 text-[12px] text-slate-700">— {edge.label}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};
