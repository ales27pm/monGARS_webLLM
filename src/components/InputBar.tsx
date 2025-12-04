import React, { useState } from "react";
import { palette } from "../theme";

interface InputBarProps {
  onSend: (text: string) => Promise<void>;
  disabled?: boolean;
  isLoading?: boolean;
  helperText?: string;
}

const InputBar: React.FC<InputBarProps> = ({
  onSend,
  disabled = false,
  isLoading = false,
  helperText,
}) => {
  const [text, setText] = useState("");

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    await onSend(trimmed);
    setText("");
  };

  const sendingBlocked = disabled || isLoading;

  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        padding: 10,
        background: palette.surface,
        borderTop: `1px solid ${palette.border}`,
        borderRadius: 10,
        flexWrap: "wrap",
        alignItems: "flex-start",
      }}
    >
      <input
        style={{
          flex: 1,
          minWidth: 220,
          color: palette.text,
          padding: "clamp(10px, 2vw, 14px)",
          background: palette.elevated,
          borderRadius: 10,
          border: `1px solid ${palette.border}`,
          outline: "none",
          fontSize: "clamp(14px, 1.6vw, 16px)",
        }}
        placeholder="Glisse ta commande locale…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void handleSend();
          }
        }}
        disabled={disabled}
        aria-disabled={disabled}
      />
      <button
        type="button"
        onClick={handleSend}
        style={{
          background: palette.accent,
          color: "white",
          border: "none",
          padding: "clamp(10px, 2vw, 14px) clamp(12px, 2vw, 16px)",
          borderRadius: 10,
          fontWeight: 700,
          opacity: sendingBlocked ? 0.6 : 1,
          cursor: sendingBlocked ? "not-allowed" : "pointer",
          fontSize: "clamp(14px, 1.6vw, 16px)",
          minWidth: 96,
        }}
        disabled={sendingBlocked}
        aria-disabled={sendingBlocked}
      >
        {isLoading ? "Ça mouline…" : "Lancer"}
      </button>
      {isLoading ? (
        <div
          style={{
            color: palette.muted,
            fontSize: "clamp(12px, 1.4vw, 14px)",
            alignSelf: "center",
          }}
        >
          Génération locale en cours…
        </div>
      ) : null}
      {helperText ? (
        <div
          style={{
            color: palette.muted,
            fontSize: "clamp(12px, 1.4vw, 13px)",
            flexBasis: "100%",
            marginTop: 4,
          }}
        >
          {helperText}
        </div>
      ) : null}
    </div>
  );
};

export default InputBar;
