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
    {/* Safely scoped decorative layers to avoid UI obstruction if global CSS is missing */}
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        background:
          "radial-gradient(60% 60% at 50% 50%, rgba(255,255,255,0.04) 0%, transparent 60%)",
      }}
      aria-hidden="true"
      role="presentation"
      tabIndex={-1}
    />
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        backgroundImage:
          "linear-gradient(transparent 24px, rgba(255,255,255,0.05) 25px), linear-gradient(90deg, transparent 24px, rgba(255,255,255,0.05) 25px)",
        backgroundSize: "25px 25px, 25px 25px",
        opacity: 0.25,
      }}
      aria-hidden="true"
      role="presentation"
      tabIndex={-1}
    />
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
        onClick={() => {
          if (disabled || busy) return;
          onSpeak("Test voix capturée");
        }}
        style={{
          background: palette.accent,
          color: "white",
          border: "none",
          padding: "12px 14px",
          borderRadius: 12,
          cursor: disabled || busy ? "not-allowed" : "pointer",
          fontWeight: 700,
          opacity: disabled || busy ? 0.5 : 1,
        }}
        disabled={disabled || busy}
      >
        {busy ? "Patiente…" : "Capturer"}
      </button>
    </div>
  </div>
);

export default VoiceInput;
