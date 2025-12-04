import { useCallback, useEffect, useRef, useState } from "react";
import type { InitProgressReport } from "../../types";
import { webLLMService } from "../services/WebLLMService";

export type EngineUiState =
  | "idle"
  | "initializing"
  | "downloading"
  | "ready"
  | "error";

export interface UseEngineResult {
  engineState: EngineUiState;
  progress: number;
  statusText: string;
  errorText: string | null;
  bootEngine: () => Promise<void>;
}

export interface UseEngineOptions {
  autoStart?: boolean;
}

export function useEngine(options: UseEngineOptions = {}): UseEngineResult {
  const { autoStart = true } = options;
  const [engineState, setEngineState] = useState<EngineUiState>("idle");
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState<string>(
    "Arme le moteur local.",
  );
  const [errorText, setErrorText] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const isBootingRef = useRef(false);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleProgress = useCallback((report: InitProgressReport) => {
    if (!isMountedRef.current) return;
    const pct = Math.round((report.progress ?? 0) * 100);
    setProgress(pct);
    setStatusText(report.text || "Initialisation en cours…");
    if (pct < 100) {
      setEngineState("downloading");
    }
  }, []);

  const bootEngine = useCallback(async () => {
    if (!isMountedRef.current || isBootingRef.current) return;

    isBootingRef.current = true;
    setErrorText(null);
    setEngineState("initializing");
    setStatusText("Préparation du moteur WebGPU local…");
    setProgress(0);

    try {
      await webLLMService.init({ onProgress: handleProgress });
      if (!isMountedRef.current) return;

      setEngineState("ready");
      setStatusText("Moteur local prêt. Tu peux envoyer.");
      setProgress(100);
    } catch (err) {
      if (!isMountedRef.current) return;

      const message = err instanceof Error ? err.message : String(err);
      setErrorText(
        message ||
          "Initialisation impossible : WebGPU ou stockage semble indisponible.",
      );
      setEngineState("error");
    } finally {
      isBootingRef.current = false;
    }
  }, [handleProgress]);

  useEffect(() => {
    if (autoStart) {
      void bootEngine();
    }
  }, [autoStart, bootEngine]);

  return { engineState, progress, statusText, errorText, bootEngine };
}
