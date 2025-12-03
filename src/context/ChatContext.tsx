import React, { createContext, useCallback, useMemo, useState } from "react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface ChatContextType {
  messages: Message[];
  sendMessage: (text: string) => void;
}

export const ChatContext = createContext<ChatContextType>({
  messages: [],
  sendMessage: () => undefined,
});

export const ChatProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [messages, setMessages] = useState<Message[]>([]);

  const sendMessage = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const userMessage: Message = {
      id: `${Date.now()}-user`,
      role: "user",
      content: trimmed,
    };

    const assistantReply: Message = {
      id: `${Date.now()}-assistant`,
      role: "assistant",
      content: "Thanks for your message. I'll use the on-device WebLLM pipeline to respond soon.",
    };

    setMessages((prev) => [...prev, userMessage, assistantReply]);
  }, []);

  const value = useMemo(
    () => ({
      messages,
      sendMessage,
    }),
    [messages, sendMessage],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};
