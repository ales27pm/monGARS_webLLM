import React, { useContext, useEffect, useState } from "react";
import { ChatContext } from "../context/ChatContext";
import ReasoningVisualizer from "../components/ReasoningVisualizer";
import { palette } from "../theme";
import { detectGpuMode } from "../services/GpuService";
import type { GpuMode } from "../services/GpuService.types";
import { AgenticOrchestratorPanel } from "../components/AgenticOrchestratorPanel";

const reasoningSteps = [
  "Reformulation claire de la demande",
  "Scan de la mémoire locale pour les indices",
  "Plan d'outils (web/voix) avant d'agir",
  "Synthèse et contrôle qualité de la réponse",
];

type Props = { navigation: { navigate: (screen: string) => void } };

const ReasoningScreen: React.FC<Props> = () => {
  const { reasoningTrace } = useContext(ChatContext);
  const [gpuMode, setGpuMode] = useState<GpuMode>("none");
  const [gpuLoading, setGpuLoading] = useState(false);
  const [gpuError, setGpuError] = useState<string | null>(null);

  const runGpuDetection = () => {
    if (gpuLoading) return; // avoid concurrent detections
    setGpuLoading(true);
    setGpuError(null);
    detectGpuMode()
      .then((mode) => setGpuMode(mode))
      .catch((error: unknown) => {
        console.warn("GPU detection failed", error);
        setGpuError(
          "Impossible de confirmer WebGPU/WebGL. Le rendu bascule sur un mode texte fiable.",
        );
        setGpuMode("none");
      })
      .finally(() => setGpuLoading(false));
  };

  useEffect(() => {
    let isMounted = true;

    const safeRun = () => {
      setGpuLoading(true);
      setGpuError(null);
      detectGpuMode()
        .then((mode) => {
          if (!isMounted) return;
          setGpuMode(mode);
        })
        .catch((error: unknown) => {
          console.warn("GPU detection failed", error);
          if (!isMounted) return;
          setGpuError(
            "Impossible de confirmer WebGPU/WebGL. Le rendu bascule sur un mode texte fiable.",
          );
          setGpuMode("none");
        })
        .finally(() => {
          if (!isMounted) return;
          setGpuLoading(false);
        });
    };

    safeRun();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        alignItems: "center",
        color: palette.text,
      }}
    >
      <div style={{ fontSize: 24, fontWeight: 800 }}>
        Traçage du cerveau monGARS
      </div>
      <div style={{ color: palette.muted, textAlign: "center", maxWidth: 600 }}>
        Suis le flux de pensée de l'agent : parfait pour déboguer ou justifier
        ses moves.
      </div>
      <ReasoningVisualizer
        reasoning={reasoningTrace}
        gpuMode={gpuMode}
        loading={gpuLoading}
        error={gpuError ?? undefined}
      />
      <div
        style={{
          alignSelf: "stretch",
          width: "100%",
          maxWidth: 900,
        }}
      >
        <AgenticOrchestratorPanel />
      </div>
      <div
        style={{
          alignSelf: "stretch",
          background: palette.surface,
          borderRadius: 12,
          border: `1px solid ${palette.border}`,
          padding: 12,
        }}
      >
        {gpuError ? (
          <div
            style={{
              background: palette.elevated,
              border: `1px solid ${palette.error}`,
              borderRadius: 10,
              padding: 10,
              marginBottom: 10,
            }}
          >
            <div style={{ fontWeight: 700, color: palette.error }}>
              GPU non disponible
            </div>
            <div style={{ color: palette.muted, marginTop: 4 }}>{gpuError}</div>
            <button
              type="button"
              onClick={runGpuDetection}
              style={{
                marginTop: 8,
                padding: "6px 10px",
                borderRadius: 8,
                border: `1px solid ${palette.border}`,
                background: "transparent",
                color: palette.text,
                cursor: "pointer",
              }}
            >
              Relancer la détection
            </button>
          </div>
        ) : null}
        {gpuLoading ? (
          <div style={{ color: palette.muted, marginBottom: 8 }}>
            Détection GPU en cours…
          </div>
        ) : null}
        {reasoningTrace && (reasoningTrace.summary ?? "").trim().length > 0 ? (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontWeight: 700 }}>Résumé actuel</div>
            <div style={{ color: palette.muted, marginTop: 4 }}>
              {reasoningTrace.summary}
            </div>
          </div>
        ) : (
          <div style={{ color: palette.muted, marginBottom: 8 }}>
            {reasoningTrace
              ? "Résumé indisponible pour cette trace."
              : "Pas encore de trace. Ping l'agent pour lancer un nouveau raisonnement."}
          </div>
        )}
        {reasoningSteps.map((step, index) => (
          <div
            key={step}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 6,
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                background: palette.accent,
              }}
            />
            <div style={{ color: palette.text }}>
              {index + 1}. {step}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ReasoningScreen;
