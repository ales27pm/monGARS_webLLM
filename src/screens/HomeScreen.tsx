import React, { useMemo } from "react";
import ChatTimeline from "../components/chat/ChatTimeline";
import ChatComposer from "../components/chat/ChatComposer";
import GpuStatusCard from "../components/GpuStatusCard";
import ChatSkeleton from "../components/ChatSkeleton";
import StatusBanner from "../components/StatusBanner";
import { useEngine } from "../hooks/useEngine";
import type { EngineUiState } from "../hooks/useEngine";
import "./home-screen.css";

type HomeScreenProps = {
  navigation: { navigate: (screen: string) => void };
};

type QuickActionConfig = {
  label: string;
  description: string;
  target: string;
};

const QUICK_ACTIONS: QuickActionConfig[] = [
  {
    label: "Voix / mains libres",
    description: "Micro + synthèse, zéro cloud",
    target: "Voice",
  },
  {
    label: "Réglages locaux",
    description: "Modèles, mémoire, reset",
    target: "Settings",
  },
  {
    label: "Traçage",
    description: "Voir le plan et les appels",
    target: "Reasoning",
  },
  {
    label: "Capacités",
    description: "Forces, limites, GPU",
    target: "Capabilities",
  },
];

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
      downloading: `${statusText} (${progress}%)`,
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
    <div className="home-screen">
      <div className="home-screen__card">
        <div className="home-screen__hero">
          <div className="home-screen__hero-copy">
            <div className="home-screen__eyebrow">MON GARS — LOCAL FIRST</div>
            <div className="home-screen__title">
              Assistant clandestin qui tourne sur ta machine.
            </div>
            <div className="home-screen__description">
              Tape, parle ou mixe les deux : l'agent reste sur ton device,
              crypto-barbu et discret.
            </div>
          </div>
          <GpuStatusCard />
        </div>

        <div className="home-screen__actions">
          {QUICK_ACTIONS.map((action) => (
            <QuickAction
              key={action.target}
              label={action.label}
              description={action.description}
              onClick={() => navigation.navigate(action.target)}
            />
          ))}
        </div>

        {banner ? <div className="home-screen__banner">{banner}</div> : null}
      </div>

      <div className="home-screen__card home-screen__card--chat">
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

        <div className="home-screen__composer">
          <ChatComposer
            disabled={composerDisabled}
            disabledReason={composerReason}
          />
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
  <button type="button" onClick={onClick} className="quick-action">
    <div className="quick-action__label">{label}</div>
    <div className="quick-action__description">{description}</div>
  </button>
);

export default HomeScreen;
