import React from "react";

interface HomeComposerProps {
  inputValue: string;
  onInputChange: (value: string) => void;
  onSend: () => Promise<void>;
  canSend: boolean;
  isGenerating: boolean;
  banner: React.ReactNode;
  placeholder: string;
  modeLabel: string;
  voiceActionLabel: string;
}

const HomeComposer: React.FC<HomeComposerProps> = ({
  inputValue,
  onInputChange,
  onSend,
  canSend,
  isGenerating,
  banner,
  placeholder,
  modeLabel,
  voiceActionLabel,
}) => (
  <footer className="home-composer-wrap">
    {banner ? <div className="home-banner">{banner}</div> : null}

    <div className="home-composer">
      <input
        type="text"
        className="home-composer__input"
        placeholder={placeholder}
        value={inputValue}
        onChange={(event) => onInputChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void onSend();
          }
        }}
        disabled={!canSend}
      />
      <div className="home-composer__actions">
        <button type="button" className="home-chip">
          {modeLabel}
        </button>
        <button
          type="button"
          className="home-icon-action"
          aria-label={voiceActionLabel}
        >
          🎤
        </button>
        <button
          type="button"
          className="home-send"
          onClick={() => {
            void onSend();
          }}
          disabled={!canSend}
          aria-label={isGenerating ? "Génération en cours" : "Envoyer"}
        >
          {isGenerating ? "…" : "↑"}
        </button>
      </div>
    </div>
  </footer>
);

export default HomeComposer;
