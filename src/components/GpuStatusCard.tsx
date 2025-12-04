import React, { useCallback, useEffect, useMemo, useState } from "react";
import { detectGpuMode } from "../services/GpuService";
import type { GpuMode } from "../services/GpuService.types";
import { palette } from "../theme";

type GpuStatusCardProps = {
  mode?: GpuMode;
  style?: React.CSSProperties;
  className?: string;
  onDetected?: (mode: GpuMode) => void;
};

const label: Record<GpuMode, string> = {
  webgpu: "WebGPU armé (on-device)",
  webgl2: "WebGL2 en backup",
  webgl: "WebGL compatibilité",
  none: "Aucun backend GPU",
};

const subtitle: Record<GpuMode, string> = {
  webgpu: "Calc local accéléré. Basculera sur WebGL si besoin.",
  webgl2: "Fallback WebGL2 : un peu moins véloce mais 100% navigateur.",
  webgl: "Fallback WebGL : mode compat, garde-fou si WebGPU absent.",
  none: "Rendu logiciel : plus lent mais toujours privé et offline.",
};

const tone: Record<GpuMode, string> = {
  webgpu: palette.success,
  webgl2: palette.accent,
  webgl: palette.accent,
  none: palette.error,
};

const baseStyle: React.CSSProperties = {
  border: `1px solid ${palette.border}`,
  borderRadius: 12,
  padding: 12,
  background: palette.elevated,
  display: "flex",
  flexDirection: "column",
  gap: 6,
  minWidth: 220,
  flex: "1 1 240px",
  maxWidth: 420,
};

const GpuStatusCard: React.FC<GpuStatusCardProps> = ({
  mode,
  style,
  className,
  onDetected,
}) => {
  const [detectedMode, setDetectedMode] = useState<GpuMode>(mode ?? "none");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runDetection = useCallback(async () => {
    if (mode) return;
    setChecking(true);
    setError(null);
    try {
      const backend = await detectGpuMode();
      setDetectedMode(backend);
      onDetected?.(backend);
    } catch (err) {
      console.error("GPU detection failed", err);
      setError(
        "Impossible de détecter l'accélération matérielle. On repasse en mode CPU sécurisé.",
      );
      setDetectedMode("none");
    } finally {
      setChecking(false);
    }
  }, [mode, onDetected]);

  useEffect(() => {
    runDetection();
  }, [runDetection]);

  const resolvedMode = mode ?? detectedMode;

  const primaryLabel = useMemo(() => {
    if (checking) return "Scan GPU local…";
    if (error) return error;
    return label[resolvedMode];
  }, [checking, error, resolvedMode]);

  const secondaryLabel = useMemo(() => {
    if (checking) return "Analyse de l'accélération matérielle";
    if (error) return "Optimisé pour WebLLM, fallback prêt";
    return subtitle[resolvedMode];
  }, [checking, error, resolvedMode]);

  return (
    <div
      className={className}
      style={{ ...baseStyle, ...style, color: palette.text }}
    >
      <div
        style={{
          color: error ? palette.error : tone[resolvedMode],
          fontWeight: 700,
          fontSize: 15,
        }}
      >
        {primaryLabel}
      </div>
      <div style={{ color: palette.muted, fontSize: 12 }}>{secondaryLabel}</div>
      {!mode && error ? (
        <button
          type="button"
          onClick={runDetection}
          style={{
            alignSelf: "flex-start",
            padding: "6px 10px",
            borderRadius: 8,
            border: `1px solid ${palette.border}`,
            background: "transparent",
            color: palette.text,
            cursor: "pointer",
          }}
        >
          Réessayer
        </button>
      ) : null}
    </div>
  );
};

export type { GpuStatusCardProps };
export default GpuStatusCard;
