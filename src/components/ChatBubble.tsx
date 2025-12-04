import React from "react";
import type { Message } from "../../types";
import { palette } from "../theme";

interface ChatBubbleProps {
  message: Message;
}

const bubbleBase: React.CSSProperties = {
  margin: 6,
  padding: 12,
  borderRadius: 12,
  maxWidth: "85%",
  border: `1px solid ${palette.border}`,
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  marginTop: 6,
  color: palette.muted,
  fontSize: "clamp(11px, 1.1vw, 13px)",
};

const ChatBubble: React.FC<ChatBubbleProps> = ({ message }) => {
  const isUser = message.role === "user";
  const isError = message.error === true;
  const content = message.content ?? "";
  const background = isUser
    ? palette.accent
    : isError
      ? "rgba(255, 77, 109, 0.08)"
      : palette.elevated;

  const borderColor = isError ? palette.error : palette.border;

  return (
    <div
      style={{
        ...bubbleBase,
        alignSelf: isUser ? "flex-end" : "flex-start",
        background,
        color: isUser ? "white" : palette.text,
        border: `1px solid ${borderColor}`,
      }}
    >
      <div style={{ fontSize: "clamp(14px, 1.6vw, 17px)", lineHeight: 1.5 }}>
        {content}
      </div>
      <div style={labelStyle}>
        {isUser ? "Toi (local)" : isError ? "monGARS (oops)" : "monGARS"}
      </div>
    </div>
  );
};

export default ChatBubble;
