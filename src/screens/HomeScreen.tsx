import React, { useMemo } from "react";
import ChatTimeline from "../components/chat/ChatTimeline";
import ChatComposer from "../components/chat/ChatComposer";
import GpuStatusCard from "../components/GpuStatusCard";
import ChatSkeleton from "../components/ChatSkeleton";
import StatusBanner from "../components/StatusBanner";
import { useEngine } from "../hooks/useEngine";
import type { EngineUiState } from "../hooks/useEngine";
import { palette } from "../theme";

type HomeScreenProps = {
  navigation: { navigate: (screen: string) => void };
};

const cardStyle: React.CSSProperties = {
  background: palette.surface,
  border: `1px solid ${palette.border}`,
  borderRadius: 12,
  padding: 16,
};

const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const { bootEngine, engineState, errorText, progress, statusText } =
    useEngine();

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
