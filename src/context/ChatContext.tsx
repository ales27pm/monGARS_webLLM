import React, { createContext, useCallback, useMemo, useState } from "react";
import { webLLMService } from "../services/WebLLMService";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  error?: boolean;
}

interface ChatContextType {
  messages: Message[];
  sendMessage: (text: string) => Promise<void>;
  isGenerating: boolean;
}

export const ChatContext = createContext<ChatContextType>({
  messages: [],
  sendMessage: async () => undefined,
  isGenerating: false,
});

export const ChatProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      if (isGenerating) return;

      setIsGenerating(true);

      const userMessage: Message = {
        id: `${Date.now()}-user`,
        role: "user",
        content: trimmed,
      };

      const nextHistory = [...messages, userMessage];
      setMessages(nextHistory);

      try {
        const assistantContent = await webLLMService.generateResponse(
          trimmed,
          nextHistory,
        );

        const assistantReply: Message = {
          id: `${Date.now()}-assistant`,
          role: "assistant",
          content: assistantContent,
        };

        setMessages((prev) => [...prev, assistantReply]);
      } catch (error: any) {
        console.error("WebLLM generation failed", error);
        setMessages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-assistant-error`,
            role: "assistant",
            content:
              error?.message ||
              "Impossible de générer une réponse pour le moment. Vérifie la configuration du modèle et réessaie.",
            error: true,
          },
        ]);
      } finally {
        setIsGenerating(false);
      }
    },
    [isGenerating, messages],
  );

  const value = useMemo(
    () => ({
      messages,
      sendMessage,
      isGenerating,
    }),
    [messages, sendMessage, isGenerating],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};
