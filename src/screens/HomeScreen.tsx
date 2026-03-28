import React, { useMemo, useState } from "react";
import ChatTimeline from "../components/chat/ChatTimeline";
import StatusBanner from "../components/StatusBanner";
import { useEngine } from "../hooks/useEngine";
import { useChatContext } from "../context/ChatContext";
import type { EngineUiState } from "../hooks/useEngine";
import "./home-screen.css";

type QuickActionTarget = "Voice" | "Settings" | "Reasoning" | "Capabilities";

type HomeScreenProps = {
  navigation: { navigate: (screen: QuickActionTarget) => void };
};

const quickPromptCards = [
  {
    title: "Crée une illustration",
    subtitle: "pour une boulangerie",
  },
  {
    title: "Prépare un plan d'entraînement",
    subtitle: "pour faire de la musculation",
  },
];

const assistantPills = [
  "Créer une image",
  "Créer de la musique",
  "Écrire n'importe quoi",
  "Égayer ma journée",
  "M'aider à apprendre",
];

const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const [isDrawerOpen, setDrawerOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const { bootEngine, engineState, errorText, progress, statusText } =
    useEngine();
  const { sendMessage, isGenerating, messages } = useChatContext();

  const hasMessages = messages.length > 0;

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
      idle: "Moteur local au repos",
      initializing: "Initialisation locale en cours",
      downloading: "Téléchargement du modèle local",
      ready: "Prêt",
      error: "Erreur",
    };

    const descriptionMap: Record<EngineUiState, string> = {
      idle: "Arme le modèle local quand tu veux lancer une réponse.",
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

  const handleSend = async () => {
    const text = inputValue.trim();
    if (!text || engineState !== "ready" || isGenerating) return;
    await sendMessage(text);
    setInputValue("");
  };

  const handlePromptCard = async (prompt: string) => {
    setInputValue(prompt);
    if (engineState !== "ready" || isGenerating) return;
    await sendMessage(prompt);
    setInputValue("");
  };

  return (
    <div className="home-shell">
      <aside
        className={`home-drawer ${isDrawerOpen ? "home-drawer--open" : ""}`}
      >
        <div className="home-drawer__search">Recherchez des clavardages</div>
        <button type="button" className="home-drawer__new-chat">
          <span>✎</span>
          <span>Nouveau clavardage</span>
        </button>

        <div className="home-drawer__section-title">Gems</div>
        <button type="button" className="home-drawer__item">
          Partenaire de codage
        </button>
        <button type="button" className="home-drawer__item">
          monGARS
        </button>

        <div className="home-drawer__section-title">Clavardages</div>
        <button type="button" className="home-drawer__item">
          Conception d'un assistant IA
        </button>
        <button type="button" className="home-drawer__item">
          Prompt 78.txt Implementation
        </button>
        <button type="button" className="home-drawer__item">
          Algorithm Improvement Plan
        </button>

        <div className="home-drawer__section-title">Raccourcis</div>
        <div className="home-drawer__quick-actions">
          <button type="button" onClick={() => navigation.navigate("Voice")}>
            Voix
          </button>
          <button type="button" onClick={() => navigation.navigate("Settings")}>
            Réglages
          </button>
          <button
            type="button"
            onClick={() => navigation.navigate("Reasoning")}
          >
            Traçage
          </button>
          <button
            type="button"
            onClick={() => navigation.navigate("Capabilities")}
          >
            Capacités
          </button>
        </div>
      </aside>

      {isDrawerOpen ? (
        <button
          type="button"
          className="home-overlay"
          aria-label="Fermer le menu"
          onClick={() => setDrawerOpen(false)}
        />
      ) : null}

      <div className="home-main">
        <header className="home-topbar">
          <button
            type="button"
            className="home-icon-btn"
            onClick={() => setDrawerOpen(true)}
          >
            ☰
          </button>
          <div className="home-topbar__title">ChatGPT</div>
          <div className="home-topbar__actions">
            <button type="button" className="home-icon-btn">
              ◎
            </button>
            <div className="home-avatar">AL</div>
          </div>
        </header>

        {!hasMessages ? (
          <section className="home-empty-state">
            <div className="home-empty-state__heading">
              Prêt quand vous l'êtes.
            </div>
            <div className="home-pill-stack">
              {assistantPills.map((pill) => (
                <button
                  key={pill}
                  type="button"
                  className="home-pill"
                  onClick={() => setInputValue(pill)}
                >
                  {pill}
                </button>
              ))}
            </div>
          </section>
        ) : (
          <section className="home-timeline-wrap">
            <ChatTimeline
              style={{
                background: "transparent",
                border: "none",
                borderRadius: 0,
                padding: 0,
                minHeight: "min(48vh, 420px)",
                maxHeight: "56vh",
              }}
            />
          </section>
        )}

        {!hasMessages ? (
          <div className="home-prompt-cards" aria-label="Suggestions rapides">
            {quickPromptCards.map((card) => (
              <button
                key={card.title}
                type="button"
                className="home-prompt-card"
                onClick={() =>
                  handlePromptCard(`${card.title} ${card.subtitle}`)
                }
              >
                <span>{card.title}</span>
                <small>{card.subtitle}</small>
              </button>
            ))}
          </div>
        ) : null}

        <footer className="home-composer-wrap">
          {banner ? <div className="home-banner">{banner}</div> : null}

          <div className="home-composer">
            <input
              className="home-composer__input"
              placeholder="Demandez ce que vous voulez"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleSend();
                }
              }}
              disabled={engineState !== "ready" || isGenerating}
            />
            <div className="home-composer__actions">
              <button type="button" className="home-chip">
                Réflexion prolongée
              </button>
              <button type="button" className="home-icon-action">
                🎤
              </button>
              <button
                type="button"
                className="home-send"
                onClick={() => {
                  void handleSend();
                }}
                disabled={engineState !== "ready" || isGenerating}
              >
                {isGenerating ? "…" : "↑"}
              </button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default HomeScreen;
