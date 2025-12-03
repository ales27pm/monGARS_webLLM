import React from "react";
import { palette } from "../theme";
import type { ReasoningTrace } from "../brain/MonGarsBrainService";
import type { GpuMode } from "../services/GpuService.types";

interface Props {
  reasoning?: ReasoningTrace | null;
  gpuMode?: GpuMode;
  loading?: boolean;
  error?: string;
}

const ReasoningVisualizer: React.FC<Props> = ({
  reasoning,
  gpuMode = "none",
  loading = false,
  error,
}) => {
  const isRichRendering = gpuMode === "webgpu";
  const isReducedRendering = gpuMode === "webgl2" || gpuMode === "webgl";

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 420,
        minHeight: 260,
        background: palette.elevated,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 12,
        border: `1px solid ${palette.border}`,
        padding: 12,
        flexDirection: "column",
        gap: 8,
        textAlign: "center",
      }}
    >
      <div style={{ color: palette.text, fontWeight: 700, fontSize: 16 }}>
        Graphique du flux de pensée
      </div>
      <div style={{ color: palette.muted }}>
        {loading
          ? "Préparation de la scène graphique…"
          : error
            ? error
            : reasoning?.summary ?? "Branches parallèles, score de confiance et appels outils"}
      </div>
      <div
        style={{
          marginTop: 8,
          padding: 8,
          borderRadius: 8,
          border: `1px dashed ${palette.border}`,
          color: palette.muted,
          fontSize: 12,
          width: "100%",
        }}
      >
        {loading && "Détection GPU en cours…"}
        {!loading && !error && isRichRendering &&
          "Accélération WebGPU activée pour les visualisations riches."}
        {!loading && !error && isReducedRendering && !isRichRendering &&
          "WebGL actif : visualisation simplifiée pour maximiser la compatibilité."}
        {!loading && !error && !isRichRendering && !isReducedRendering &&
          "Mode logiciel : aperçu textuel uniquement pour rester fiable."}
      </div>
    </div>
  );
};

export default ReasoningVisualizer;
