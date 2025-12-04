import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { MLCEngine } from "@mlc-ai/web-llm";

import { palette } from "../theme";
import { ReasoningGraphView } from "./ReasoningGraph";
import { runChatPipeline, type ChatTurn } from "../llm/chatPipeline";
import type { OrchestratorGraph } from "../prompts/orchestrator";
import { webLLMService } from "../services/WebLLMService";
import { useEngine } from "../hooks/useEngine";

interface PipelineState {
  history: ChatTurn[];
  lastGraph: OrchestratorGraph | null;
  lastToolSummary: string | null;
  mode: "offline" | "online" | "mixed";
}

const initialPipelineState: PipelineState = {
  history: [],
  lastGraph: null,
  lastToolSummary: null,
  mode: "offline",
};

export const AgenticOrchestratorPanel: React.FC = () => {
  const [engine, setEngine] = useState<MLCEngine | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<PipelineState>(initialPipelineState);

  const { engineState, bootEngine, statusText } = useEngine();

  const engineReadyText = useMemo(() => {
    if (engineState === "ready") return "Moteur armé";
    if (engineState === "error") return "Moteur indisponible";
    if (engineState === "downloading") return "Téléchargement en cours";
    if (engineState === "initializing") return "Initialisation du moteur";
    return "En attente d'initialisation";
  }, [engineState]);

  useEffect(() => {
    let cancelled = false;

    const fetchEngine = async () => {
      try {
        const current = (await webLLMService.getCurrentEngine()) as MLCEngine | null;
        if (!cancelled) {
          setEngine(current);
        }
      } catch (err) {
        if (!cancelled) {
          setEngine(null);
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    };

    if (engineState === "ready") {
      void fetchEngine();
    }

    return () => {
      cancelled = true;
    };
  }, [engineState]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;

    if (!engine) {
      setError("Moteur WebLLM non initialisé. Lance le moteur pour utiliser le pipeline.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const result = await runChatPipeline({
        engine,
        history: state.history,
        userText: text,
      });

      const userTurn: ChatTurn = {
        id: `user-${Date.now()}`,
        role: "user",
        content: text,
      };

      setState((prev) => ({
        history: [...prev.history, userTurn, result.assistantMessage],
        lastGraph: result.orchestrator.graph,
        lastToolSummary: result.toolResult?.textSummary ?? null,
        mode: result.mode,
      }));
      setInput("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erreur inconnue lors de l'orchestration. Consulte la console.",
      );
      console.error("Pipeline monGARS échoué", err);
    } finally {
      setBusy(false);
    }
  }, [busy, engine, input, state.history]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        background: palette.surface,
        border: `1px solid ${palette.border}`,
        borderRadius: 12,
        padding: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, color: palette.text }}>
            Orchestrateur → Outil → Assistant
          </div>
          <div style={{ color: palette.muted, fontSize: 13 }}>
            Séquence complète WebLLM avec graphe de pensée stocké pour l'UI.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span
            style={{
              padding: "6px 10px",
              borderRadius: 10,
              border: `1px solid ${palette.border}`,
              background: engineState === "ready" ? palette.elevated : "transparent",
              color: engineState === "error" ? palette.error : palette.text,
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {engineReadyText}
          </span>
          {engineState !== "ready" ? (
            <button
              type="button"
              onClick={bootEngine}
              style={{
                padding: "6px 10px",
                borderRadius: 10,
                border: `1px solid ${palette.border}`,
                background: palette.elevated,
                color: palette.text,
                cursor: "pointer",
              }}
            >
              Armer le moteur
            </button>
          ) : null}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label htmlFor="agentic-input" style={{ color: palette.text, fontWeight: 700 }}>
            Prompt utilisateur
          </label>
          <textarea
            id="agentic-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            rows={3}
            placeholder="Ex: Trouve la météo à Montréal demain et fais-moi un plan."
            style={{
              borderRadius: 10,
              border: `1px solid ${palette.border}`,
              padding: 10,
              color: palette.text,
              resize: "vertical",
              background: palette.elevated,
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void handleSend();
              }
            }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ color: palette.muted, fontSize: 12 }}>
              {statusText || ""}
              {state.mode === "mixed" ? " • Mode mixte (contexte + outil)" : null}
              {state.mode === "online" && state.mode !== "mixed"
                ? " • Contexte enrichi par un outil"
                : null}
            </div>
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={busy || !input.trim() || engineState !== "ready"}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: `1px solid ${palette.border}`,
                background: busy ? palette.border : palette.elevated,
                color: palette.text,
                cursor: busy || engineState !== "ready" ? "not-allowed" : "pointer",
                minWidth: 120,
              }}
            >
              {busy ? "En cours…" : "Lancer"}
            </button>
          </div>
        </div>

        {error ? (
          <div
            style={{
              border: `1px solid ${palette.error}`,
              background: "rgba(244,63,94,0.08)",
              color: palette.error,
              borderRadius: 10,
              padding: 10,
            }}
          >
            {error}
          </div>
        ) : null}

        {state.history.length > 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              background: palette.elevated,
              borderRadius: 10,
              border: `1px solid ${palette.border}`,
              padding: 10,
            }}
          >
            {state.history.map((turn) => (
              <div key={turn.id} style={{ textAlign: turn.role === "user" ? "right" : "left" }}>
                <div
                  style={{
                    display: "inline-block",
                    padding: "8px 10px",
                    borderRadius: 10,
                    background: turn.role === "user" ? palette.text : "white",
                    color: turn.role === "user" ? palette.surface : palette.text,
                    border: `1px solid ${palette.border}`,
                    maxWidth: "100%",
                  }}
                >
                  <div style={{ fontSize: 11, opacity: 0.7 }}>
                    {turn.role === "user" ? "Utilisateur" : "monGARS"}
                  </div>
                  <div style={{ whiteSpace: "pre-wrap" }}>{turn.content}</div>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {state.lastToolSummary ? (
          <div
            style={{
              border: `1px dashed ${palette.border}`,
              borderRadius: 10,
              padding: 10,
              color: palette.text,
              background: "rgba(148,163,184,0.12)",
            }}
          >
            <div style={{ fontWeight: 700 }}>Résumé outil</div>
            <div style={{ whiteSpace: "pre-wrap", color: palette.muted }}>{state.lastToolSummary}</div>
          </div>
        ) : null}

        <ReasoningGraphView graph={state.lastGraph} />
      </div>
    </div>
  );
};
