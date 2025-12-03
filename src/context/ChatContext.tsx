import React, {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useMonGarsBrain } from "../brain/useMonGarsBrain";
import type {
  MemoryStats,
  ReasoningTrace,
  SpeechState,
} from "../brain/MonGarsBrainService";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  error?: boolean;
}

interface ChatContextType {
  messages: Message[];
  sendMessage: (text: string) => Promise<void>;
  resetConversation: () => void;
  isGenerating: boolean;

  // Extra state exposed from the brain layer for richer UIs.
  reasoningTrace: ReasoningTrace | null;
  memoryStats: MemoryStats;
  speechState: SpeechState;
  isSpeaking: boolean;
  isRecording: boolean;
  canSpeak: boolean;
}

const defaultValue: ChatContextType = {
  messages: [],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async sendMessage(_text: string): Promise<void> {
    console.warn("ChatContext.sendMessage called outside of provider.");
  },
  resetConversation() {
    console.warn("ChatContext.resetConversation called outside of provider.");
  },
  isGenerating: false,
  reasoningTrace: null,
  memoryStats: { totalEntries: 0, lastHitScore: null },
  speechState: {
    mode: "idle",
    isRecording: false,
    isPlaying: false,
    lastError: null,
  },
  isSpeaking: false,
  isRecording: false,
  canSpeak: false,
};

export const ChatContext = createContext<ChatContextType>(defaultValue);

interface ChatProviderProps {
  children: ReactNode;
}

export const ChatProvider: React.FC<ChatProviderProps> = ({ children }) => {
  const {
    messages,
    isBusy,
    sendUserMessage,
    resetConversation,
    reasoningTrace,
    memoryStats,
    speechState,
  } = useMonGarsBrain();

  const isSpeaking =
    speechState.mode === "speaking" || speechState.isPlaying === true;
  const isRecording =
    speechState.mode === "listening" || speechState.isRecording === true;
  const canSpeak = speechState.lastError === null;

  const value = useMemo<ChatContextType>(
    () => ({
      messages,
      sendMessage: sendUserMessage,
      resetConversation,
      isGenerating: isBusy,
      reasoningTrace,
      memoryStats,
      speechState,
      isSpeaking,
      isRecording,
      canSpeak,
    }),
    [
      messages,
      sendUserMessage,
      resetConversation,
      isBusy,
      reasoningTrace,
      memoryStats,
      speechState,
      isSpeaking,
      isRecording,
      canSpeak,
    ],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

export const useChatContext = (): ChatContextType => {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error("useChatContext must be used within a ChatProvider");
  }
  return ctx;
};
