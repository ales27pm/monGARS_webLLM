import { useCallback, useMemo, useRef, useState } from "react";
import { ensurePipeline } from "./speechPipeline";
import { useAudioPlayback } from "./useAudioPlayback";
import { blobToFloat32AudioData } from "./speechUtils";
import { TurnDetectionConfig, useTurnDetection } from "./useTurnDetection";

type UseSpeechOptions = {
  onTranscription?: (text: string) => void;
  initialVocalModeEnabled?: boolean;
  turnDetectionConfig?: Partial<TurnDetectionConfig>;
};

const ASR_MODEL = "Xenova/whisper-small";
const TTS_MODEL = "Xenova/parler-tts-mini-v1";

type MediaRecorderOptions = ConstructorParameters<typeof MediaRecorder>[1];

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

export function useSpeech(options: UseSpeechOptions = {}) {
  const {
    onTranscription,
    initialVocalModeEnabled = true,
    turnDetectionConfig,
  } = options;
  const windowRef = typeof window !== "undefined" ? window : undefined;
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const {
    getAudioContext,
    sourceRef: ttsSourceRef,
    resetPlayback,
  } = useAudioPlayback();
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

  const hasNativeTts = useMemo(() => supportsNativeTts(windowRef), [windowRef]);

  const { turnState } = useTurnDetection({
    enabled: vocalModeEnabled && isRecording,
    stream: activeStream,
    getAudioContext,
    onTurnEnded: () => {
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }
    },
    config: turnDetectionConfig,
  });

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
  }, []);

  const transcribeBlob = useCallback(
    async (blob: Blob) => {
      const asr = await ensurePipeline(
        "automatic-speech-recognition",
        ASR_MODEL,
      );
      const { audioData, sampleRate } = await blobToFloat32AudioData(
        blob,
        getAudioContext(),
      );
      const result = await asr(
        { array: audioData, sampling_rate: sampleRate },
        {
          chunk_length_s: 15,
          stride_length_s: [4, 2],
          language: "french",
        },
      );

      if (typeof result.text === "string") {
        return result.text.trim();
      }

      return "";
    },
    [getAudioContext],
  );

  const startNativeRecognition = useCallback(async () => {
    setError(null);
    setRecordingFlags(true, true);

    const RecognitionCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new RecognitionCtor();
    recognition.lang = "fr-FR";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results?.[0]?.[0]?.transcript || "";
      setLastTranscript(transcript);
      onTranscription?.(transcript);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error("Native speech recognition error", event.error);
      recognitionRef.current = null;
      setRecordingFlags(false, false);
      setError(
        "La transcription vocale du navigateur a échoué. Vérifie ton micro et réessaie.",
      );
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setRecordingFlags(false, false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [onTranscription]);

  const startMediaRecorder = useCallback(async () => {
    const canRecordAudio =
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia;

    if (!canRecordAudio) {
      setError("La dictée vocale n'est pas disponible sur cet appareil.");
      return;
    }

    try {
      setError(null);
      stopStreamTracks(streamRef.current);
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const stream = streamRef.current;
      const options: MediaRecorderOptions | undefined =
        typeof MediaRecorder !== "undefined" &&
        MediaRecorder.isTypeSupported("audio/webm")
          ? { mimeType: "audio/webm" }
          : undefined;
      const recorder = new MediaRecorder(stream, options);
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        setActiveStream(null);
        setRecordingFlags(false, true);
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        chunksRef.current = [];

        if (blob.size === 0) {
          setError("Aucun audio enregistré.");
          stopStreamTracks(streamRef.current);
          streamRef.current = null;
          return;
        }

        try {
          const text = await transcribeBlob(blob);
          setLastTranscript(text);
          onTranscription?.(text);
        } catch (transcriptionError) {
          console.error("Transcription error", transcriptionError);
          setError("La transcription a échoué. Vérifie ton micro et réessaie.");
        } finally {
          setIsTranscribing(false);
          stopStreamTracks(streamRef.current);
          streamRef.current = null;
          recorderRef.current = null;
        }
      };

      recorder.onerror = (event) => {
        console.error("Recorder error", event);
        setActiveStream(null);
        setRecordingFlags(false, false);
        setError("L'enregistrement a été interrompu.");
        stopStreamTracks(streamRef.current);
        streamRef.current = null;
        recorderRef.current = null;
      };

      recorder.start();
      recorderRef.current = recorder;
      setRecordingFlags(true, false);
      if (vocalModeEnabled) {
        setActiveStream(stream);
      }
    } catch (err) {
      console.error("Microphone permission or initialization failed", err);
      setError("Impossible d'accéder au micro. Vérifie les permissions.");
      stopStreamTracks(streamRef.current);
      streamRef.current = null;
      setActiveStream(null);
    }
  }, [
    onTranscription,
    transcribeBlob,
    vocalModeEnabled,
  ]);

  const startRecording = useCallback(async () => {
    if (isRecording || isTranscribing) {
      return;
    }

    if (hasNativeRecognition) {
      try {
        await startNativeRecognition();
        return;
      } catch (err) {
        console.error("Native speech recognition failed, falling back", err);
        setRecordingFlags(false, false);
        setError(
          "La dictée vocale native a échoué. Nouvelle tentative avec la transcription locale...",
        );
      }
    }

    await startMediaRecorder();
  }, [
    hasNativeRecognition,
    isRecording,
    isTranscribing,
    startMediaRecorder,
    startNativeRecognition,
  ]);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      stopNativeRecognition();
      return;
    }

    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  }, [stopNativeRecognition]);

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

  const speakWithModelTts = useCallback(
    async (text: string) => {
      try {
        setError(null);
        setIsSpeaking(true);
        resetPlayback();
        const tts = await ensurePipeline("text-to-speech", TTS_MODEL);
        const output = await tts(text, {
          description: "French voice, clear and warm",
        });
        const audioArray = output.audio as Float32Array;
        const sampleRate = (output as any).sampling_rate || 22050;
        const audioContext = getAudioContext();
        const buffer = audioContext.createBuffer(
          1,
          audioArray.length,
          sampleRate,
        );
        buffer.copyToChannel(audioArray, 0);
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        ttsSourceRef.current = source;
        source.onended = () => {
          setIsSpeaking(false);
          resetPlayback();
        };
        source.start();
      } catch (err) {
        console.error("TTS error", err);
        setIsSpeaking(false);
        setError(
          "La synthèse vocale a échoué. Réessaie ou réduit la longueur du texte.",
        );
      }
    },
    [getAudioContext, resetPlayback],
  );

  const speak = useCallback(
    async (text: string) => {
      if (!text.trim()) {
        return;
      }

      if (hasNativeTts) {
        try {
          await speakWithNativeTts(text);
          return;
        } catch (err) {
          console.error("Native TTS failed, falling back", err);
          setIsSpeaking(false);
        }
      }

      await speakWithModelTts(text);
    },
    [hasNativeTts, speakWithModelTts, speakWithNativeTts],
  );

  return {
    startRecording,
    stopRecording,
    speak,
    isRecording,
    isTranscribing,
    isSpeaking,
    lastTranscript,
    error,
    vocalModeEnabled,
    setVocalModeEnabled,
    turnState,
  };
}
