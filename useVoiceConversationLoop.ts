import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSpeech } from "./useSpeech";
import type { EngineStatus, Message } from "./types";

type VoiceTurn = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
};

function buildTurns(messages: Message[]): VoiceTurn[] {
  const relevant = messages.filter(
    (msg) => msg.role === "user" || msg.role === "assistant",
  );

  return relevant.slice(-8).map((msg) => ({
    id: msg.id,
    role: msg.role as VoiceTurn["role"],
    content: msg.content,
    timestamp: msg.timestamp,
  }));
}

export interface VoiceConversationLoopProps {
  onClose: () => void;
  onSend: (text: string) => Promise<void> | void;
  engineStatus: EngineStatus;
  messages: Message[];
  isGenerating: boolean;
}

export function useVoiceConversationLoop({
  onClose,
  onSend,
  messages,
  engineStatus,
  isGenerating,
}: VoiceConversationLoopProps) {
  const [autoLoop, setAutoLoop] = useState(true);
  const [autoReadAloud, setAutoReadAloud] = useState(true);
  const [queuedTranscripts, setQueuedTranscripts] = useState<string[]>([]);

  const lastAssistantMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i];
      if (msg.role === "assistant" && msg.content?.trim()) {
        return msg;
      }
    }
    return null;
  }, [messages]);

  const {
    startRecording,
    stopRecording,
    speak,
    stopSpeaking,
    isRecording,
    isTranscribing,
    isSpeaking,
    lastTranscript,
    error,
    vocalModeEnabled,
    setVocalModeEnabled,
    turnState,
  } = useSpeech({
    initialVocalModeEnabled: true,
    turnDetectionConfig: {
      silenceHoldMs: 1200,
      minVoiceDurationMs: 320,
    },
    onTranscription: (transcript) => {
      const sanitized = transcript.trim();
      if (!sanitized) return;

      setQueuedTranscripts((prev) => {
        const updated = [...prev, sanitized];
        const MAX_QUEUE = 6;
        return updated.length > MAX_QUEUE
          ? updated.slice(updated.length - MAX_QUEUE)
          : updated;
      });
    },
  });

  const spokenAssistantIdRef = useRef<string | null>(null);

  const recentTurns = useMemo(() => buildTurns(messages), [messages]);

  useEffect(() => {
    if (!isRecording) {
      return;
    }
    stopSpeaking();
  }, [isRecording, stopSpeaking]);

  const consumeQueue = useCallback(async () => {
    if (isGenerating) return;
    let nextToSend: string | undefined;

    setQueuedTranscripts((prev) => {
      if (prev.length === 0) return prev;
      const [next, ...rest] = prev;
      nextToSend = next;
  const consumeQueue = useCallback(async () => {
    if (isGenerating) return;

    let nextToSend: string | undefined;
    setQueuedTranscripts((prev) => {
      if (prev.length === 0) return prev;
      // Peek without removing; removal happens after successful send
      nextToSend = prev[0];
      return prev;
    });

    if (!nextToSend) return;

    try {
      await onSend(nextToSend);
      setQueuedTranscripts((prev) => prev.slice(1));
    } catch (e) {
      console.error("Failed to send transcript from queue", e);
      // Keep the item for retry
    }
  }, [isGenerating, onSend]);

  useEffect(() => {
    if (!isGenerating) {
      void consumeQueue();
    }
  }, [consumeQueue, isGenerating, queuedTranscripts.length]);

  useEffect(() => {
    if (!autoReadAloud) return;
    if (isGenerating) return;
    const msg = lastAssistantMessage;
    if (!msg) return;

    // Skip if we already spoke this exact message
    const alreadySpoken = spokenAssistantIdRef.current === msg.id;
    if (alreadySpoken) return;

    // Debounce to avoid reacting to rapid successive updates
    const t = setTimeout(() => {
      // Re-check conditions after debounce
      if (isGenerating) return;
      if (!lastAssistantMessage) return;
      if (spokenAssistantIdRef.current === lastAssistantMessage.id) return;

      stopSpeaking();
      spokenAssistantIdRef.current = lastAssistantMessage.id;
      void speak(lastAssistantMessage.content);
    }, 150);

    return () => clearTimeout(t);
  }, [autoReadAloud, isGenerating, lastAssistantMessage, speak, stopSpeaking]);

  useEffect(() => {
    if (!autoLoop || engineStatus !== "ready") return;
    if (isRecording || isTranscribing || isSpeaking || isGenerating) return;

    startRecording();
  }, [
    autoLoop,
    engineStatus,
    isGenerating,
    isRecording,
    isSpeaking,
    isTranscribing,
    startRecording,
  ]);

  useEffect(() => {
    if (engineStatus === "ready") return;

    stopRecording();
    stopSpeaking();
  }, [engineStatus, stopRecording, stopSpeaking]);

  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, [stopRecording]);

  const micStateLabel = useMemo(() => {
    if (error) return "Erreur micro";
    if (isSpeaking) return "Lecture de la réponse";
    if (isGenerating) return "Génération en cours";
    if (isTranscribing) return "Transcription locale";
    if (isRecording) {
      switch (turnState) {
        case "calibrating":
          return "Calibration du bruit";
        case "monitoring":
          return "Écoute active";
        case "listening":
          return "Voix détectée";
        case "silenceHold":
          return "Fin de tour de parole";
        default:
          return "Enregistrement";
      }
    }
    return "Prêt pour une nouvelle question";
  }, [error, isGenerating, isRecording, isSpeaking, isTranscribing, turnState]);

  const handleManualSend = useCallback(async () => {
    if (lastTranscript.trim()) {
      setQueuedTranscripts([]);
      await onSend(lastTranscript.trim());
    }
  }, [lastTranscript, onSend]);

  const handleClose = useCallback(() => {
    stopRecording();
    stopSpeaking();
    setQueuedTranscripts([]);
    onClose();
  }, [onClose, stopRecording, stopSpeaking]);

  const listeningActive = isRecording || turnState === "listening";
  const queueCount = queuedTranscripts.length;

  return {
    autoLoop,
    setAutoLoop,
    autoReadAloud,
    setAutoReadAloud,
    queuedTranscripts,
    setQueuedTranscripts,
    lastAssistantMessage,
    startRecording,
    stopRecording,
    speak,
    stopSpeaking,
    isRecording,
    isTranscribing,
    isSpeaking,
    lastTranscript,
    error,
    vocalModeEnabled,
    setVocalModeEnabled,
    turnState,
    micStateLabel,
    handleManualSend,
    handleClose,
    listeningActive,
    queueCount,
    recentTurns,
  };
}
