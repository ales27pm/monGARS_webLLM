import React from "react";
import { palette } from "../theme";

const shimmer: React.CSSProperties = {
  background: `linear-gradient(90deg, ${palette.elevated} 0%, ${palette.border}55 50%, ${palette.elevated} 100%)`,
  backgroundSize: "200% 100%",
  animation: "chat-skeleton-shine 1.4s ease-in-out infinite",
};

const line = (width: string): React.CSSProperties => ({
  width,
  height: 12,
  borderRadius: 8,
  ...shimmer,
});

const bubble = (width: string): React.CSSProperties => ({
  width,
  height: 42,
  borderRadius: 12,
  ...shimmer,
});

const ChatSkeleton: React.FC = () => {
  return (
    <div
      style={{
        border: `1px solid ${palette.border}`,
        borderRadius: 12,
        padding: 12,
        background: palette.surface,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
      aria-busy
      aria-label="Chargement du modèle"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={bubble("68%")}></div>
        <div style={bubble("82%")}></div>
        <div style={bubble("54%")}></div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={line("48%")}></div>
        <div style={line("40%")}></div>
      </div>
    </div>
  );
};

export default ChatSkeleton;
