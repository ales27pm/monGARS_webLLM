import React from "react";
import { palette } from "../theme";
import type { SpeechState } from "../brain/MonGarsBrainService";

interface VoiceInputProps {
  onSpeak: (text: string) => void;
  speechState?: SpeechState;
  disabled?: boolean;
  busy?: boolean;
}

const VoiceInput: React.FC<VoiceInputProps> = ({
  onSpeak,
  speechState,
  disabled = false,
  busy = false,
}) => (
  <div
    style={{
      position: "relative",
      padding: 20,
      borderRadius: 16,
      background: palette.elevated,
      border: `1px solid ${palette.border}`,
      overflow: "hidden",
    }}
  >
    <div className="voice-glow" style={{ position: "absolute", inset: 0 }} />
    <div className="voice-glow-secondary" style={{ position: "absolute", inset: 0 }} />
    <div className="voice-grid" style={{ position: "absolute", inset: 0, opacity: 0.3 }} />
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <div>
        <div style={{ color: palette.text, fontSize: 18, fontWeight: 800 }}>
          {busy ? "Micro en cours" : "Micro prêt"}
        </div>
        <div style={{ color: palette.muted }}>
          {speechState?.mode === "listening"
            ? "En écoute…"
            : speechState?.mode === "speaking"
              ? "Synthèse en cours"
              : "Clique pour simuler une capture voix"}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onSpeak("Test voix capturée")}
        style={{
          background: palette.accent,
          color: "white",
          border: "none",
          padding: "12px 14px",
          borderRadius: 12,
          cursor: "pointer",
          fontWeight: 700,
          opacity: disabled ? 0.5 : 1,
        }}
        disabled={disabled || busy}
      >
        {busy ? "Patiente…" : "Capturer"}
      </button>
    </div>
  </div>
);

export default VoiceInput;
