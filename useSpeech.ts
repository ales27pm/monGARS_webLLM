import { useCallback, useMemo, useRef, useState } from "react";
import { ensurePipeline } from "./speechPipeline";
import { useAudioPlayback } from "./useAudioPlayback";
import { blobToFloat32AudioData } from "./speechUtils";

type UseSpeechOptions = {
  onTranscription?: (text: string) => void;
  initialVocalModeEnabled?: boolean;
};

const ASR_MODEL = "Xenova/whisper-small";
const TTS_MODEL = "Xenova/parler-tts-mini-v1";
const TURN_BASE_THRESHOLD = 0.01;
const TURN_SILENCE_MS = 1200;
const TURN_MIN_SPEECH_MS = 900;
const TURN_CALIBRATION_FRAMES = 90;

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
  const { onTranscription, initialVocalModeEnabled = true } = options;
  const windowRef = typeof window !== "undefined" ? window : undefined;
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
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
  const [turnState, setTurnState] = useState<
    "idle" | "calibrating" | "listening" | "silenceHold"
  >("idle");
  const turnStateRef = useRef<
    "idle" | "calibrating" | "listening" | "silenceHold"
  >(turnState);

  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const turnRafRef = useRef<number | null>(null);
  const silenceStartedAtRef = useRef<number | null>(null);
  const lastVoiceDetectedAtRef = useRef<number | null>(null);
  const noiseFloorRef = useRef<number>(0);
  const calibrationFramesRef = useRef<number>(0);
  const hasDetectedSpeechRef = useRef<boolean>(false);

  const hasNativeRecognition = useMemo(
    () => supportsNativeRecognition(windowRef),
    [windowRef],
  );

  const hasNativeTts = useMemo(() => supportsNativeTts(windowRef), [windowRef]);

  const updateTurnState = useCallback(
    (state: "idle" | "calibrating" | "listening" | "silenceHold") => {
      turnStateRef.current = state;
      setTurnState(state);
    },
    [],
  );

  const stopTurnMonitoring = useCallback(() => {
    if (turnRafRef.current !== null) {
      cancelAnimationFrame(turnRafRef.current);
      turnRafRef.current = null;
    }
    if (mediaStreamSourceRef.current) {
      mediaStreamSourceRef.current.disconnect();
      mediaStreamSourceRef.current = null;
    }
    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }
    silenceStartedAtRef.current = null;
    lastVoiceDetectedAtRef.current = null;
    calibrationFramesRef.current = 0;
    noiseFloorRef.current = 0;
    hasDetectedSpeechRef.current = false;
    updateTurnState("idle");
  }, [updateTurnState]);

  const monitorTurnTaking = useCallback(
    (stream: MediaStream) => {
      const audioContext = getAudioContext();
      analyserRef.current = audioContext.createAnalyser();
      analyserRef.current.fftSize = 2048;
      const analyser = analyserRef.current;
      mediaStreamSourceRef.current = audioContext.createMediaStreamSource(stream);
      mediaStreamSourceRef.current.connect(analyser);
      const buffer = new Float32Array(analyser.fftSize);
      silenceStartedAtRef.current = null;
      lastVoiceDetectedAtRef.current = performance.now();
      calibrationFramesRef.current = 0;
      noiseFloorRef.current = 0;
      updateTurnState("calibrating");

      const step = () => {
        if (!analyserRef.current || !recorderRef.current) {
          return;
        }
        analyser.getFloatTimeDomainData(buffer);
        const rms = Math.sqrt(
          buffer.reduce((sum, value) => sum + value * value, 0) / buffer.length,
        );

        const isCalibrating =
          calibrationFramesRef.current < TURN_CALIBRATION_FRAMES;

        if (isCalibrating) {
          noiseFloorRef.current =
            (noiseFloorRef.current * calibrationFramesRef.current + rms) /
            (calibrationFramesRef.current + 1);
          calibrationFramesRef.current += 1;
          if (turnStateRef.current !== "calibrating") {
            updateTurnState("calibrating");
          }
          turnRafRef.current = requestAnimationFrame(step);
          return;
        }

        const dynamicThreshold = Math.max(
          TURN_BASE_THRESHOLD,
          noiseFloorRef.current * 3.5,
        );
        const now = performance.now();

        if (rms >= dynamicThreshold) {
          if (!hasDetectedSpeechRef.current) {
            hasDetectedSpeechRef.current = true;
          }
          lastVoiceDetectedAtRef.current = now;
          silenceStartedAtRef.current = null;
          if (turnStateRef.current !== "listening") {
            updateTurnState("listening");
          }
        } else {
          if (!hasDetectedSpeechRef.current) {
            if (turnStateRef.current !== "listening") {
              updateTurnState("listening");
            }
            turnRafRef.current = requestAnimationFrame(step);
            return;
          }
          silenceStartedAtRef.current = silenceStartedAtRef.current ?? now;
          const elapsedSinceSpeech =
            now - (lastVoiceDetectedAtRef.current ?? now);
          const silenceDuration = now - silenceStartedAtRef.current;

          if (
            elapsedSinceSpeech > TURN_MIN_SPEECH_MS &&
            silenceDuration > TURN_SILENCE_MS &&
            recorderRef.current.state !== "inactive"
          ) {
            updateTurnState("silenceHold");
            recorderRef.current.stop();
            return;
          }

          if (turnStateRef.current !== "silenceHold") {
            updateTurnState("silenceHold");
          }
        }

        turnRafRef.current = requestAnimationFrame(step);
      };

      turnRafRef.current = requestAnimationFrame(step);
    },
    [getAudioContext, updateTurnState],
  );

  const setRecordingFlags = (recording: boolean, transcribing: boolean) => {
    setIsRecording(recording);
    setIsTranscribing(transcribing);
  };

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
      updateTurnState("calibrating");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
        stopTurnMonitoring();
        setRecordingFlags(false, true);
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        chunksRef.current = [];

        if (blob.size === 0) {
          setError("Aucun audio enregistré.");
          stream.getTracks().forEach((track) => track.stop());
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
          stream.getTracks().forEach((track) => track.stop());
        }
      };

      recorder.onerror = (event) => {
        console.error("Recorder error", event);
        stopTurnMonitoring();
        setRecordingFlags(false, false);
        setError("L'enregistrement a été interrompu.");
      };

      recorder.start();
      recorderRef.current = recorder;
      setRecordingFlags(true, false);
      if (vocalModeEnabled) {
        monitorTurnTaking(stream);
      } else {
        updateTurnState("idle");
      }
    } catch (err) {
      console.error("Microphone permission or initialization failed", err);
      setError("Impossible d'accéder au micro. Vérifie les permissions.");
      stopTurnMonitoring();
    }
  }, [
    monitorTurnTaking,
    onTranscription,
    stopTurnMonitoring,
    transcribeBlob,
    updateTurnState,
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
