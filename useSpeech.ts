import { useCallback, useMemo, useRef, useState } from "react";
import { TurnDetectionConfig, useTurnDetection } from "./useTurnDetection";

type UseSpeechOptions = {
  onTranscription?: (text: string) => void;
  initialVocalModeEnabled?: boolean;
  turnDetectionConfig?: Partial<TurnDetectionConfig>;
};

type RecognitionCtor = new () => SpeechRecognition;

type MediaAccess = {
  stream: MediaStream | null;
  error: string | null;
};

function supportsNativeRecognition(win: Window | undefined): boolean {
  if (!win) return false;
  return "SpeechRecognition" in win || "webkitSpeechRecognition" in win;
}

function supportsNativeTts(win: Window | undefined): boolean {
  if (!win) return false;
  return (
    "speechSynthesis" in win &&
    typeof (win as any).SpeechSynthesisUtterance !== "undefined"
  );
}

function getRecognitionCtor(win: Window | undefined): RecognitionCtor | null {
  if (!win) return null;
  return (win as any).SpeechRecognition || (win as any).webkitSpeechRecognition;
}

export function useSpeech(options: UseSpeechOptions = {}) {
  const {
    onTranscription,
    initialVocalModeEnabled = true,
    turnDetectionConfig,
  } = options;
  const windowRef = typeof window !== "undefined" ? window : undefined;
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [lastTranscript, setLastTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [vocalModeEnabled, setVocalModeEnabled] = useState(
    initialVocalModeEnabled,
  );
  const [activeStream, setActiveStream] = useState<MediaStream | null>(null);

  const hasNativeRecognition = useMemo(
    () => supportsNativeRecognition(windowRef),
    [windowRef],
  );

  const isChromeOnIos = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    return /CriOS/i.test(navigator.userAgent);
  }, []);

  const voiceSupportError = useMemo(() => {
    if (!windowRef) {
      return "La dictée vocale requiert un navigateur moderne.";
    }

    if (!windowRef.isSecureContext) {
      return "Active HTTPS pour utiliser la dictée vocale (obligatoire pour l'accès au micro).";
    }

    if (isChromeOnIos) {
      return "Chrome sur iOS ne supporte pas la dictée vocale. Utilise Safari ou un navigateur compatible.";
    }

    if (!hasNativeRecognition) {
      return "La dictée vocale n'est pas supportée par ce navigateur.";
    }

    return null;
  }, [hasNativeRecognition, isChromeOnIos, windowRef]);

  const isVoiceSupported = !voiceSupportError;

  const hasNativeTts = useMemo(() => supportsNativeTts(windowRef), [windowRef]);

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    if (audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume().catch((err) => {
        console.warn("Failed to resume AudioContext", err);
      });
    }
    return audioContextRef.current;
  }, []);

  const setRecordingFlags = (recording: boolean, transcribing: boolean) => {
    setIsRecording(recording);
    setIsTranscribing(transcribing);
  };

  const stopStreamTracks = useCallback((stream: MediaStream | null) => {
    stream?.getTracks().forEach((track) => track.stop());
  }, []);

  const stopNativeRecognition = useCallback(() => {
    if (!recognitionRef.current) return;
    recognitionRef.current.onend = null;
    recognitionRef.current.onerror = null;
    recognitionRef.current.stop();
    recognitionRef.current = null;
    setRecordingFlags(false, false);
    stopStreamTracks(streamRef.current);
    streamRef.current = null;
    setActiveStream(null);
  }, [stopStreamTracks]);

  const { turnState } = useTurnDetection({
    enabled: vocalModeEnabled && isRecording,
    stream: activeStream,
    getAudioContext,
    onTurnEnded: () => stopNativeRecognition(),
    config: turnDetectionConfig,
  });

  const requestMicStream = useCallback(async (): Promise<MediaAccess> => {
    const canRecordAudio =
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia;

    if (!canRecordAudio) {
      return { stream: null, error: "La capture audio est indisponible." };
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      return { stream, error: null };
    } catch (err) {
      console.error("Microphone permission failed", err);
      return {
        stream: null,
        error: "Impossible d'accéder au micro. Vérifie les permissions.",
      };
    }
  }, []);

  const startNativeRecognition = useCallback(async () => {
    setError(null);
    setRecordingFlags(true, true);

    if (vocalModeEnabled) {
      const { stream, error: streamError } = await requestMicStream();
      if (streamError) {
        setRecordingFlags(false, false);
        setError(streamError);
        return;
      }
      stopStreamTracks(streamRef.current);
      streamRef.current = stream;
      setActiveStream(stream);
    } else {
      setActiveStream(null);
    }

    const RecognitionCtor = getRecognitionCtor(windowRef);
    if (!RecognitionCtor) {
      setRecordingFlags(false, false);
      setError(
        "La reconnaissance vocale n'est pas disponible sur ce navigateur.",
      );
      return;
    }

    try {
      const recognition = new RecognitionCtor();
      recognition.lang = "fr-FR";
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const transcript = event.results?.[0]?.[0]?.transcript?.trim() || "";
        setLastTranscript(transcript);
        setRecordingFlags(false, false);
        setActiveStream(null);
        stopStreamTracks(streamRef.current);
        streamRef.current = null;
        onTranscription?.(transcript);
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error("Native speech recognition error", event.error);
        recognitionRef.current = null;
        setRecordingFlags(false, false);
        setActiveStream(null);
        stopStreamTracks(streamRef.current);
        streamRef.current = null;
        setError(
          "La transcription vocale du navigateur a échoué. Vérifie ton micro et réessaie.",
        );
      };

      recognition.onend = () => {
        recognitionRef.current = null;
        setRecordingFlags(false, false);
        setActiveStream(null);
        stopStreamTracks(streamRef.current);
        streamRef.current = null;
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error("Native recognition init failed", err);
      recognitionRef.current = null;
      setRecordingFlags(false, false);
      setActiveStream(null);
      stopStreamTracks(streamRef.current);
      streamRef.current = null;
      setError(
        "La dictée vocale a échoué. Vérifie les permissions micro et réessaie.",
      );
    }
  }, [
    onTranscription,
    requestMicStream,
    stopStreamTracks,
    vocalModeEnabled,
    windowRef,
  ]);

  const startRecording = useCallback(async () => {
    if (isRecording || isTranscribing) {
      return;
    }

    if (!isVoiceSupported) {
      setError(voiceSupportError);
      return;
    }

    await startNativeRecognition();
  }, [
    isVoiceSupported,
    isRecording,
    isTranscribing,
    startNativeRecognition,
    voiceSupportError,
  ]);

  const stopRecording = useCallback(() => {
    stopNativeRecognition();
    stopStreamTracks(streamRef.current);
    streamRef.current = null;
    setActiveStream(null);
  }, [stopNativeRecognition, stopStreamTracks]);

  const getVoices = useCallback(async () => {
    if (!windowRef?.speechSynthesis) return [] as SpeechSynthesisVoice[];

    const existingVoices = windowRef.speechSynthesis.getVoices();
    if (existingVoices.length) {
      return existingVoices;
    }

    return new Promise<SpeechSynthesisVoice[]>((resolve) => {
      const handleVoicesChanged = () => {
        windowRef.speechSynthesis.removeEventListener(
          "voiceschanged",
          handleVoicesChanged,
        );
        resolve(windowRef.speechSynthesis.getVoices());
      };

      windowRef.speechSynthesis.addEventListener(
        "voiceschanged",
        handleVoicesChanged,
      );

      // Fallback in case the event doesn't fire
      setTimeout(() => {
        windowRef.speechSynthesis.removeEventListener(
          "voiceschanged",
          handleVoicesChanged,
        );
        resolve(windowRef.speechSynthesis.getVoices());
      }, 300);
    });
  }, [windowRef]);

  const speakWithNativeTts = useCallback(
    async (text: string) => {
      setError(null);
      setIsSpeaking(true);
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "fr-FR";
      const voices = await getVoices();
      const frenchVoice = voices.find((voice) =>
        voice.lang?.toLowerCase().startsWith("fr"),
      );
      if (frenchVoice) {
        utterance.voice = frenchVoice;
      }
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = (event) => {
        console.error("Native TTS error", event.error);
        setIsSpeaking(false);
        setError(
          "La synthèse vocale du navigateur a échoué. Réessaie ou réduis la longueur du texte.",
        );
      };
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    },
    [getVoices],
  );

  const speak = useCallback(
    async (text: string) => {
      if (!text.trim()) {
        return;
      }

      if (!hasNativeTts) {
        setError("La synthèse vocale n'est pas supportée par ce navigateur.");
        return;
      }

      try {
        await speakWithNativeTts(text);
      } catch (err) {
        console.error("Native TTS failed", err);
        setIsSpeaking(false);
        setError(
          "La synthèse vocale du navigateur a échoué. Réessaie ou réduis la longueur du texte.",
        );
      }
    },
    [hasNativeTts, speakWithNativeTts],
  );

  const stopSpeaking = useCallback(() => {
    try {
      if (hasNativeTts && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }
    } catch (err) {
      console.warn("Error while stopping speech", err);
    } finally {
      setIsSpeaking(false);
    }
  }, [hasNativeTts]);

  return {
    startRecording,
    stopRecording,
    speak,
    stopSpeaking,
    isRecording,
    isTranscribing,
    isSpeaking,
    lastTranscript,
    error,
    isVoiceSupported,
    voiceSupportError,
    vocalModeEnabled,
    setVocalModeEnabled,
    turnState,
  };
}
