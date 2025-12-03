import React from "react";
import { palette } from "../theme";

interface ChatBubbleProps {
  message: { role: string; content: string };
}

const bubbleBase: React.CSSProperties = {
  margin: 6,
  padding: 12,
  borderRadius: 12,
  maxWidth: "85%",
  border: `1px solid ${palette.border}`,
};

const ChatBubble: React.FC<ChatBubbleProps> = ({ message }) => {
  const isUser = message.role === "user";
  return (
    <div
      style={{
        ...bubbleBase,
        alignSelf: isUser ? "flex-end" : "flex-start",
        background: isUser ? palette.accent : palette.elevated,
        color: isUser ? "white" : palette.text,
      }}
    >
      <div style={{ fontSize: 16, lineHeight: 1.4 }}>{message.content}</div>
      <div style={{ marginTop: 6, color: palette.muted, fontSize: 12 }}>
        {isUser ? "Toi" : "Assistant"}
      </div>
    </div>
  );
};

export default ChatBubble;
