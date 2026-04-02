import React, { useEffect, useMemo, useState } from "react";
import ChatTimeline from "../components/chat/ChatTimeline";
import HomeComposer from "../components/chat/HomeComposer";
import StatusBanner from "../components/StatusBanner";
import { useEngine } from "../hooks/useEngine";
import { useChatContext } from "../context/ChatContext";
import type { EngineUiState } from "../hooks/useEngine";
import "./home-screen.css";

type QuickActionTarget = "Voice" | "Settings" | "Reasoning" | "Capabilities";

type HomeScreenProps = {
  navigation: { navigate: (screen: QuickActionTarget) => void };
};

type PromptCard = {
  title: string;
  subtitle: string;
};

const HOME_UI = {
  appTitle: "ChatGPT",
  drawerAriaLabel: "Menu principal",
  searchPlaceholder: "Recherchez des clavardages",
  searchAriaLabel: "Rechercher dans les clavardages",
  newChatLabel: "Nouveau clavardage",
  gemsLabel: "Gems",
  chatsLabel: "Clavardages",
  shortcutsLabel: "Raccourcis",
  readyLabel: "Prêt quand vous l'êtes.",
  composerPlaceholder: "Demandez ce que vous voulez",
  modeLabel: "Réflexion prolongée",
  voiceActionLabel: "Activer le micro",
  openMenuLabel: "Ouvrir le menu",
  closeMenuLabel: "Fermer le menu",
  altActionLabel: "Action rapide",
} as const;

const QUICK_PROMPT_CARDS: PromptCard[] = [
  {
    title: "Crée une illustration",
    subtitle: "pour une boulangerie",
  },
  {
    title: "Prépare un plan d'entraînement",
    subtitle: "pour faire de la musculation",
  },
];

const ASSISTANT_PILLS = [
  "Créer une image",
  "Créer de la musique",
  "Écrire n'importe quoi",
  "Égayer ma journée",
  "M'aider à apprendre",
] as const;

const GEM_ITEMS = ["Partenaire de codage", "monGARS"] as const;

const CHAT_ITEMS = [
  "Conception d'un assistant IA",
  "Prompt 78.txt Implementation",
  "Algorithm Improvement Plan",
] as const;

const SHORTCUT_ITEMS: { label: string; target: QuickActionTarget }[] = [
  { label: "Voix", target: "Voice" },
  { label: "Réglages", target: "Settings" },
  { label: "Traçage", target: "Reasoning" },
  { label: "Capacités", target: "Capabilities" },
];

const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const [isDrawerOpen, setDrawerOpen] = useState(false);
  const [drawerQuery, setDrawerQuery] = useState("");
  const [inputValue, setInputValue] = useState("");
  const { bootEngine, engineState, errorText, progress, statusText } =
    useEngine();
  const { sendMessage, isGenerating, messages } = useChatContext();

  const hasMessages = messages.length > 0;
  const canSend = engineState === "ready" && !isGenerating;

  const filteredChats = useMemo(() => {
    const query = drawerQuery.trim().toLocaleLowerCase();
    if (!query) return CHAT_ITEMS;
    return CHAT_ITEMS.filter((chat) =>
      chat.toLocaleLowerCase().includes(query),
    );
  }, [drawerQuery]);

  useEffect(() => {
    if (!isDrawerOpen) return undefined;

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawerOpen(false);
      }
    };

    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("keydown", onEscape);
    };
  }, [isDrawerOpen]);

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
    if (!text || !canSend) return;
    await sendMessage(text);
    setInputValue("");
  };

  const handlePromptCard = async (prompt: string) => {
    if (!canSend) {
      setInputValue(prompt);
      return;
    }

    await sendMessage(prompt);
  };

  return (
    <div className="home-shell">
      <aside
        id="home-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={HOME_UI.drawerAriaLabel}
        aria-hidden={!isDrawerOpen}
        className={`home-drawer ${isDrawerOpen ? "home-drawer--open" : ""}`}
      >
        <input
          type="search"
          className="home-drawer__search"
          placeholder={HOME_UI.searchPlaceholder}
          aria-label={HOME_UI.searchAriaLabel}
          value={drawerQuery}
          onChange={(event) => setDrawerQuery(event.target.value)}
        />

        <button type="button" className="home-drawer__new-chat">
          <span>✎</span>
          <span>{HOME_UI.newChatLabel}</span>
        </button>

        <div className="home-drawer__section-title">{HOME_UI.gemsLabel}</div>
        {GEM_ITEMS.map((gem) => (
          <button key={gem} type="button" className="home-drawer__item">
            {gem}
          </button>
        ))}

        <div className="home-drawer__section-title">{HOME_UI.chatsLabel}</div>
        {filteredChats.length > 0 ? (
          filteredChats.map((chat) => (
            <button key={chat} type="button" className="home-drawer__item">
              {chat}
            </button>
          ))
        ) : (
          <div className="home-drawer__empty">Aucun clavardage trouvé.</div>
        )}

        <div className="home-drawer__section-title">
          {HOME_UI.shortcutsLabel}
        </div>
        <div className="home-drawer__quick-actions">
          {SHORTCUT_ITEMS.map((shortcut) => (
            <button
              key={shortcut.label}
              type="button"
              onClick={() => navigation.navigate(shortcut.target)}
            >
              {shortcut.label}
            </button>
          ))}
        </div>
      </aside>

      {isDrawerOpen ? (
        <button
          type="button"
          className="home-overlay"
          aria-label={HOME_UI.closeMenuLabel}
          onClick={() => setDrawerOpen(false)}
        />
      ) : null}

      <div className="home-main">
        <header className="home-topbar">
          <button
            type="button"
            className="home-icon-btn"
            onClick={() => setDrawerOpen(true)}
            aria-label={HOME_UI.openMenuLabel}
            aria-controls="home-drawer"
            aria-expanded={isDrawerOpen}
          >
            ☰
          </button>
          <div className="home-topbar__title">{HOME_UI.appTitle}</div>
          <div className="home-topbar__actions">
            <button
              type="button"
              className="home-icon-btn"
              aria-label={HOME_UI.altActionLabel}
            >
              ◎
            </button>
            <div className="home-avatar">AL</div>
          </div>
        </header>

        {!hasMessages ? (
          <section className="home-empty-state">
            <div className="home-empty-state__heading">
              {HOME_UI.readyLabel}
            </div>
            <div className="home-pill-stack">
              {ASSISTANT_PILLS.map((pill) => (
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
            {QUICK_PROMPT_CARDS.map((card) => (
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

        <HomeComposer
          inputValue={inputValue}
          onInputChange={setInputValue}
          onSend={handleSend}
          canSend={canSend}
          isGenerating={isGenerating}
          banner={banner}
          placeholder={HOME_UI.composerPlaceholder}
          modeLabel={HOME_UI.modeLabel}
          voiceActionLabel={HOME_UI.voiceActionLabel}
        />
      </div>
    </div>
  );
};

export default HomeScreen;
