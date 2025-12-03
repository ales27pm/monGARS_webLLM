import React, { useState } from "react";
import { palette } from "../theme";

interface InputBarProps {
  onSend: (text: string) => Promise<void>;
  disabled?: boolean;
  isLoading?: boolean;
}

const InputBar: React.FC<InputBarProps> = ({
  onSend,
  disabled = false,
  isLoading = false,
}) => {
  const [text, setText] = useState("");

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    await onSend(trimmed);
    setText("");
  };

  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        padding: 10,
        background: palette.surface,
        borderTop: `1px solid ${palette.border}`,
        borderRadius: 10,
      }}
    >
      <input
        style={{
          flex: 1,
          color: palette.text,
          padding: 12,
          background: palette.elevated,
          borderRadius: 10,
          border: `1px solid ${palette.border}`,
          outline: "none",
        }}
        placeholder="Ask Mon Gars..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void handleSend();
          }
        }}
        disabled={disabled}
      />
      {(() => {
        const sendingBlocked = disabled || isLoading;
        const cursorStyle = sendingBlocked ? "not-allowed" : "pointer";
        return (
          <button
            type="button"
            onClick={handleSend}
            style={{
              background: palette.accent,
              color: "white",
              border: "none",
              padding: "12px 16px",
              borderRadius: 10,
              fontWeight: 700,
              opacity: sendingBlocked ? 0.6 : 1,
              cursor: cursorStyle,
            }}
            disabled={sendingBlocked}
          >
            {isLoading ? "En cours…" : "Envoyer"}
          </button>
        );
      })()}
      {isLoading ? (
        <div style={{ color: palette.muted, fontSize: 12, alignSelf: "center" }}>
          Génération en cours…
        </div>
      ) : null}
    </div>
  );
};

export default InputBar;
