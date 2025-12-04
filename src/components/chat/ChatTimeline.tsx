import React, { useEffect, useMemo, useRef } from "react";
import type { CSSProperties } from "react";
import ChatBubble from "../ChatBubble";
import { useChatContext } from "../../context/ChatContext";
import { palette } from "../../theme";

export interface ChatTimelineProps {
  style?: CSSProperties;
  contentContainerStyle?: CSSProperties;
}

const containerStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  background: palette.surface,
  border: `1px solid ${palette.border}`,
  borderRadius: 12,
  padding: 12,
  minHeight: 240,
  maxHeight: "60vh",
  overflowY: "auto",
  scrollBehavior: "smooth",
  boxSizing: "border-box",
};

const stackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const emptyTitle: CSSProperties = {
  color: palette.text,
  fontWeight: 700,
  fontSize: "clamp(16px, 2vw, 20px)",
};

const emptySubtitle: CSSProperties = {
  color: palette.muted,
  fontSize: "clamp(13px, 1.7vw, 15px)",
};

const errorCard: CSSProperties = {
  background: palette.elevated,
  border: `1px solid ${palette.error}`,
  color: palette.text,
  borderRadius: 10,
  padding: 10,
  marginTop: 6,
};

const ChatTimeline: React.FC<ChatTimelineProps> = ({
  style,
  contentContainerStyle,
}) => {
  const { messages } = useChatContext();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const lastErrorMessage = useMemo(() => {
    const reversed = [...messages].reverse();
    const failing = reversed.find((msg) => msg.error);
    return failing?.content ?? null;
  }, [messages]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [messages]);

  return (
    <div ref={scrollRef} style={{ ...containerStyle, ...style }}>
      <div style={{ ...stackStyle, ...contentContainerStyle }}>
        {messages.length === 0 ? (
          <div>
            <div style={emptyTitle}>Prêt à brainstormer en local</div>
            <div style={emptySubtitle}>
              Balance une question ou déclenche la voix : monGARS calcule sur ta
              machine, sans cloud ni témoin.
            </div>
          </div>
        ) : (
          messages.map((msg) => <ChatBubble key={msg.id} message={msg} />)
        )}
      </div>
      {lastErrorMessage ? (
        <div style={errorCard}>
          <div style={{ fontWeight: 700, color: palette.error }}>
            Le moteur a bégayé
          </div>
          <div style={{ color: palette.muted, marginTop: 4 }}>
            {lastErrorMessage ||
              "Relance ou change de modèle pour continuer en local."}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default ChatTimeline;
