import React, { createContext, useCallback, useMemo, useState } from "react";
import { DEFAULT_MODEL_ID } from "../../models";
import { webLLMService } from "../services/WebLLMService";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  error?: boolean;
}

interface ChatConfig {
  modelId: string;
  maxTokens: number;
  temperature: number;
}

interface ChatContextType {
  messages: Message[];
  sendMessage: (text: string) => Promise<void>;
  isGenerating: boolean;
  config: ChatConfig;
  updateConfig: (patch: Partial<ChatConfig>) => void;
  theme: "light" | "dark";
  setTheme: (theme: "light" | "dark") => void;
}

export const ChatContext = createContext<ChatContextType>({
  messages: [],
  sendMessage: async () => undefined,
  isGenerating: false,
  config: { modelId: DEFAULT_MODEL_ID, maxTokens: 256, temperature: 0.7 },
  updateConfig: () => undefined,
  theme: "dark",
  setTheme: () => undefined,
});

export const ChatProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [config, setConfig] = useState<ChatConfig>({
    modelId: DEFAULT_MODEL_ID,
    maxTokens: 256,
    temperature: 0.7,
  });
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  const updateConfig = useCallback((patch: Partial<ChatConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isGenerating) return;

      setIsGenerating(true);

      const userMessage: Message = {
        id: `${Date.now()}-user`,
        role: "user",
        content: trimmed,
      };

      let historySnapshot: Message[] = [];
      setMessages((prev) => {
        historySnapshot = [...prev, userMessage];
        return historySnapshot;
      });

      try {
        const assistantContent = await webLLMService.generateResponse(
          trimmed,
          historySnapshot,
          {
            modelId: config.modelId,
            maxTokens: config.maxTokens,
            temperature: config.temperature,
          },
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
    [config, isGenerating],
  );

  const value = useMemo(
    () => ({
      messages,
      sendMessage,
      isGenerating,
      config,
      updateConfig,
      theme,
      setTheme,
    }),
    [messages, sendMessage, isGenerating, config, updateConfig, theme],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};
