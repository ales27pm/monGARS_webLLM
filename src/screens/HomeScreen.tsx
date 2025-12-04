import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ChatTimeline from "../components/chat/ChatTimeline";
import ChatComposer from "../components/chat/ChatComposer";
import GpuStatusCard from "../components/GpuStatusCard";
import ChatSkeleton from "../components/ChatSkeleton";
import StatusBanner from "../components/StatusBanner";
import { webLLMService } from "../services/WebLLMService";
import type { InitProgressReport } from "../../types";
import { palette } from "../theme";

type HomeScreenProps = {
  navigation: { navigate: (screen: string) => void };
};

type EngineUiState =
  | "idle"
  | "initializing"
  | "downloading"
  | "ready"
  | "error";

const cardStyle: React.CSSProperties = {
  background: palette.surface,
  border: `1px solid ${palette.border}`,
  borderRadius: 12,
  padding: 16,
};

const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const [engineState, setEngineState] = useState<EngineUiState>("idle");
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState<string>("Arme le moteur local.");
  const [errorText, setErrorText] = useState<string | null>(null);
  const isMountedRef = useRef(true);

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
    if (!isMountedRef.current) return;

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
    }
  }, [handleProgress]);

  useEffect(() => {
    void bootEngine();
  }, [bootEngine]);

  const banner = useMemo(() => {
    if (engineState === "ready") return null;

    if (engineState === "error") {
      return (
        <StatusBanner
          tone="error"
          title="Moteur hors ligne"
          description={
            errorText ||
            "WebGPU semble indispo. Recharge la page, active le flag WebGPU ou vide le cache."
          }
          actionLabel="Recharger le moteur"
          onAction={bootEngine}
        />
      );
    }

    const titleMap: Record<EngineUiState, string> = {
      idle: "monGARS attend l'armement",
      initializing: "Initialisation locale en cours",
      downloading: "Téléchargement du modèle local",
      ready: "Prêt",
      error: "Erreur",
    };

    const descriptionMap: Record<EngineUiState, string> = {
      idle: "On vérifie WebGPU / stockage avant de lancer le modèle.",
      initializing: statusText,
      downloading: `${statusText} (${progress}% )`,
      ready: "",
      error: "",
    };

    return (
      <StatusBanner
        tone="info"
        title={titleMap[engineState]}
        description={descriptionMap[engineState]}
        progress={engineState === "downloading" ? progress : undefined}
        actionLabel={engineState === "idle" ? "Armer maintenant" : undefined}
        onAction={engineState === "idle" ? bootEngine : undefined}
      />
    );
  }, [bootEngine, engineState, errorText, progress, statusText]);

  const composerDisabled = engineState !== "ready";
  const composerReason = useMemo(() => {
    if (engineState === "error") {
      return "Moteur injoignable. Recharge ou active WebGPU dans ton navigateur.";
    }
    if (engineState === "downloading" || engineState === "initializing") {
      return "Patiente le temps que le modèle local se charge.";
    }
    return undefined;
  }, [engineState]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ ...cardStyle }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ maxWidth: 640 }}>
            <div
              style={{ color: palette.muted, fontWeight: 700, fontSize: 12 }}
            >
              MON GARS — LOCAL FIRST
            </div>
            <div style={{ color: palette.text, fontSize: 22, fontWeight: 800 }}>
              Assistant clandestin qui tourne sur ta machine.
            </div>
            <div style={{ color: palette.muted, fontSize: 14 }}>
              Tape, parle ou mixe les deux : l'agent reste sur ton device,
              crypto-barbu et discret.
            </div>
          </div>
          <GpuStatusCard />
        </div>
        <div
          style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}
        >
          <QuickAction
            label="Voix / mains libres"
            description="Micro + synthèse, zéro cloud"
            onClick={() => navigation.navigate("Voice")}
          />
          <QuickAction
            label="Réglages locaux"
            description="Modèles, mémoire, reset"
            onClick={() => navigation.navigate("Settings")}
          />
          <QuickAction
            label="Traçage"
            description="Voir le plan et les appels"
            onClick={() => navigation.navigate("Reasoning")}
          />
          <QuickAction
            label="Capacités"
            description="Forces, limites, GPU"
            onClick={() => navigation.navigate("Capabilities")}
          />
        </div>
        {banner ? <div style={{ marginTop: 12 }}>{banner}</div> : null}
      </div>

      <div
        style={{
          ...cardStyle,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {engineState === "initializing" || engineState === "downloading" ? (
          <ChatSkeleton />
        ) : null}
        <ChatTimeline
          style={{
            border: "none",
            padding: 0,
            background: "transparent",
            maxHeight: "unset",
          }}
        />
        <div style={{ marginTop: 4 }}>
          <ChatComposer disabled={composerDisabled} disabledReason={composerReason} />
        </div>
      </div>
    </div>
  );
};

const QuickAction: React.FC<{
  label: string;
  description: string;
  onClick: () => void;
}> = ({ label, description, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      background: palette.elevated,
      padding: 12,
      borderRadius: 10,
      border: `1px solid ${palette.border}`,
      minWidth: 150,
      color: palette.text,
      textAlign: "left",
      cursor: "pointer",
    }}
  >
    <div style={{ fontWeight: 700, fontSize: 15 }}>{label}</div>
    <div style={{ color: palette.muted, fontSize: 12 }}>{description}</div>
  </button>
);

export default HomeScreen;
